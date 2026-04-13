import bcryptjs from "bcryptjs";
import { storage, db } from "./storage";
import { technicians, users, submissions, smsNotifications } from "@shared/schema";
import { sql, isNull, isNotNull } from "drizzle-orm";

const SEED_USERS = [
  {
    email: null,
    password: "admin123",
    name: "System Admin",
    role: "admin",
    phone: "5551234567",
    racId: "sysadmin",
  },
  {
    email: null,
    password: "tech123",
    name: "Tyler Morrison",
    role: "technician",
    phone: "9105550147",
    racId: "tmorri1",
  },
  {
    email: null,
    password: "agent123",
    name: "Maria Johnson",
    role: "vrs_agent",
    phone: "5559876543",
    racId: "mjohnson1",
    specializations: ["refrigeration", "laundry"],
  },
  {
    email: null,
    password: "agent123",
    name: "James Chen",
    role: "vrs_agent",
    phone: "5551112222",
    racId: "jchen1",
    specializations: ["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac", "generalist"],
  },
  {
    email: null,
    password: "VRS!M@ster2026#Secure",
    name: "System Administrator",
    role: "super_admin",
    phone: null,
    racId: "VRS_MASTER",
    isSystemAccount: true,
  },
  {
    email: null,
    password: "TestTech2026!",
    name: "Test Tech",
    role: "technician",
    phone: "5550001111",
    racId: "testtech1",
  },
  {
    email: null,
    password: "TestAgent2026!",
    name: "Test Agent",
    role: "vrs_agent",
    phone: "5550002222",
    racId: "testagent1",
    specializations: ["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac", "generalist"],
  },
  {
    email: null,
    password: "TestAdmin2026!",
    name: "Test Admin",
    role: "admin",
    phone: "5550003333",
    racId: "TESTADMIN",
  },
] as const;

export async function seedDatabase() {
  for (const seedUser of SEED_USERS) {
    let user = seedUser.racId ? await storage.getUserByRacId(seedUser.racId) : null;

    if (!user) {
      const hashedPassword = await bcryptjs.hash(seedUser.password, 10);
      const createData: any = {
        email: null,
        password: hashedPassword,
        name: seedUser.name,
        role: seedUser.role,
        phone: seedUser.phone,
        racId: seedUser.racId,
        mustChangePassword: false,
      };
      if ("isSystemAccount" in seedUser) {
        createData.isSystemAccount = true;
        createData.mustChangePassword = false;
      }
      user = await storage.createUser(createData);
      console.log(`Seeded user: ${seedUser.name} / ${seedUser.racId} (${seedUser.role})`);
    }

    if ("specializations" in seedUser && seedUser.specializations) {
      const existing = await storage.getSpecializations(user.id);
      if (existing.length === 0) {
        await storage.setSpecializations(user.id, [...seedUser.specializations]);
        console.log(`Seeded specializations for: ${seedUser.name}`);
      }
    }
  }

  const testTechEntries = [
    { ldapId: "testtech1", name: "Test Tech", phone: "5550001111", district: "TEST", techUnNo: "T0001" },
    { ldapId: "tmorri1", name: "Tyler Morrison", phone: "9105550147", district: "TEST", techUnNo: "T0002" },
  ];
  for (const tech of testTechEntries) {
    try {
      await storage.upsertTechnician({
        ldapId: tech.ldapId,
        name: tech.name,
        phone: tech.phone,
        district: tech.district,
        managerName: "Test Manager",
        techUnNo: tech.techUnNo,
        isActive: true,
      });
      console.log(`Seeded technician: ${tech.name} / ${tech.ldapId}`);
    } catch (e) {
      // Already exists
    }
  }

  const ALL_DIVISIONS = ["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac", "all_other", "nla"];
  const allUsers = await db.select({ id: users.id, role: users.role }).from(users);
  for (const u of allUsers) {
    if (u.role === "admin" || u.role === "super_admin") {
      const existing = await storage.getSpecializations(u.id);
      const existingDivisions = new Set(existing.map(s => s.division));
      const hasMissing = ALL_DIVISIONS.some(d => !existingDivisions.has(d));
      if (hasMissing) {
        await storage.setSpecializations(u.id, ALL_DIVISIONS);
        console.log(`Auto-assigned all divisions to admin user id=${u.id}`);
      }
    }
  }

  await resetAllPasswords();
  await backfillClaimedAt();
  await cleanupTestSubmissions();
}

const TEST_RAC_IDS = ["testagent1", "TESTADMIN", "testtech1", "tmorri1", "sysadmin"];

async function resetAllPasswords() {
  const RESET_FLAG_RAC = "__pw_reset_v2_done__";
  const flagUser = await storage.getUserByRacId(RESET_FLAG_RAC);
  if (flagUser) {
    console.log("[password-reset] Already completed (flag found), skipping");
    return;
  }

  const GENERIC_PASSWORD = "VRS2026!";
  const hashedGeneric = await bcryptjs.hash(GENERIC_PASSWORD, 10);

  const allUsers = await db.select({ id: users.id, racId: users.racId, isSystemAccount: users.isSystemAccount }).from(users);

  let resetCount = 0;
  for (const u of allUsers) {
    if (u.racId === "VRS_MASTER") continue;

    const isTestAccount = TEST_RAC_IDS.includes(u.racId || "");
    await db.update(users).set({
      password: hashedGeneric,
      mustChangePassword: !isTestAccount,
      passwordChangedAt: null,
    }).where(sql`id = ${u.id}`);
    resetCount++;
  }

  await db.insert(users).values({
    email: null,
    password: "flag",
    name: "Password Reset Flag",
    role: "technician",
    phone: null,
    racId: RESET_FLAG_RAC,
    isActive: false,
    isSystemAccount: true,
  });

  console.log(`[password-reset] Reset ${resetCount} user passwords to generic (skipped VRS_MASTER)`);
}

async function backfillClaimedAt() {
  const BACKFILL_FLAG_RAC = "__claimed_at_backfill_done__";
  const flagUser = await storage.getUserByRacId(BACKFILL_FLAG_RAC);
  if (flagUser) {
    console.log("[claimedAt-backfill] Already completed (flag found), skipping");
    return;
  }

  const result = await db.update(submissions)
    .set({ claimedAt: sql`${submissions.createdAt}` })
    .where(sql`${submissions.claimedAt} IS NULL AND (${submissions.assignedTo} IS NOT NULL OR ${submissions.reviewedBy} IS NOT NULL)`);

  const backfilledCount = result.rowCount ?? 0;

  await db.insert(users).values({
    email: null,
    password: "flag",
    name: "ClaimedAt Backfill Flag",
    role: "technician",
    phone: null,
    racId: BACKFILL_FLAG_RAC,
    isActive: false,
    isSystemAccount: true,
  });

  console.log(`[claimedAt-backfill] Backfilled ${backfilledCount} submissions with claimedAt = createdAt`);
}

async function cleanupTestSubmissions() {
  const FLAG_RAC = "__test_submissions_cleanup_done__";
  const flagUser = await storage.getUserByRacId(FLAG_RAC);
  if (flagUser) {
    console.log("[test-cleanup] Already completed (flag found), skipping");
    return;
  }

  const testRacIds = ["testtech1", "tmorri1"];

  const testSubs = await db.select({ id: submissions.id })
    .from(submissions)
    .where(sql`${submissions.racId} IN (${sql.join(testRacIds.map(r => sql`${r}`), sql`, `)})`);

  const testSubIds = testSubs.map(s => s.id);

  if (testSubIds.length > 0) {
    await db.delete(smsNotifications)
      .where(sql`${smsNotifications.submissionId} IN (${sql.join(testSubIds.map(id => sql`${id}`), sql`, `)})`);

    await db.delete(submissions)
      .where(sql`${submissions.id} IN (${sql.join(testSubIds.map(id => sql`${id}`), sql`, `)})`);
  }

  const deletedCount = testSubIds.length;

  await db.insert(users).values({
    email: null,
    password: "flag",
    name: "Test Submissions Cleanup Flag",
    role: "technician",
    phone: null,
    racId: FLAG_RAC,
    isActive: false,
    isSystemAccount: true,
  });

  console.log(`[test-cleanup] Deleted ${deletedCount} test submissions (rac_id in: ${testRacIds.join(", ")})`);
}
