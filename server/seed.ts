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
    // Tyler 2026-04-29 — was "testagent1" (10 chars, lowercase, obviously fake).
    // Changed to ZZTEST9 so the intake form's "VRS Tech ID" field populates with a
    // value matching the real-agent shape (7 chars, uppercase, ends in digit — same
    // shape as JMORGA7 / PCANTU2). ZZ prefix is reserved-looking; no real surname
    // starts with it, so it can't ever collide. Single-field DB UPDATE applied in
    // lockstep on 2026-04-29; see COMMITS.md "Test agent ID realism" section.
    racId: "ZZTEST9",
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
  await seedDefaultCommunicationTemplates();
}

// ============================================================================
// Tyler 2026-04-29 — Seed default SMS templates so the admin Communication
// Templates page has rows to edit on first boot. Idempotent: every entry uses
// upsertDefaultCommunicationTemplate which only inserts when (channel, action_key)
// is missing, so re-running on every boot never overwrites a saved admin edit.
//
// Each `body` is byte-identical to the hardcoded fallback in server/sms.ts /
// server/routes.ts, with `{varName}` placeholders for the runtime values. The
// `variables` array drives the "Available variables" panel in the admin UI.
// ============================================================================

type SeedTemplate = {
  channel: "sms";
  actionKey: string;
  name: string;
  body: string;
  variables: { name: string; required: boolean; sample: string; description?: string }[];
};

const DEFAULT_COMMUNICATION_TEMPLATES: SeedTemplate[] = [
  // ---- Submission received (sent right after the tech submits) -------------
  {
    channel: "sms",
    actionKey: "submission_received.standard",
    name: "Submission received — standard ticket",
    body: `VRS Submission received for SO#{serviceOrder}\n\nA VRS agent will review your request shortly. Standard turnaround is a few minutes during business hours. Please remain at the site until you receive the approval/rejection text.\n\nYou will receive a follow-up text when the decision is made.`,
    variables: [{ name: "serviceOrder", required: true, sample: "12345678" }],
  },
  {
    channel: "sms",
    actionKey: "submission_received.nla",
    name: "Submission received — NLA (parts)",
    body: `VRS Submission received for SO#{serviceOrder}\n\nNLA submission received by the VRS parts team. Typical turnaround is same-day. Reschedule this call for later today and move on to your next stop — you'll receive a follow-up text with the sourcing decision.\n\nYou will receive a follow-up text when the decision is made.`,
    variables: [{ name: "serviceOrder", required: true, sample: "12345678" }],
  },
  {
    channel: "sms",
    actionKey: "submission_received.external_warranty",
    name: "Submission received — AHS / First American",
    body: `VRS Submission received for SO#{serviceOrder}\n\nThis is an external-warranty request (AHS / First American). Approvals require a provider callback and can take longer than standard Sears Protect tickets. Please remain at the site until you receive the approval/rejection text.\n\nYou will receive a follow-up text when the decision is made.`,
    variables: [{ name: "serviceOrder", required: true, sample: "12345678" }],
  },

  // ---- Ticket claimed (sent when a VRS agent picks up the ticket) ----------
  {
    channel: "sms",
    actionKey: "ticket_claimed.standard",
    name: "Agent picked up — standard ticket",
    body: `VRS Update for SO#{serviceOrder}: An agent is actively working on your ticket. Stand by for confirmation of your submission, which will let you know when you can leave.\n\nDO NOT LEAVE THE SITE until you receive that confirmation text.`,
    variables: [{ name: "serviceOrder", required: true, sample: "12345678" }],
  },
  {
    channel: "sms",
    actionKey: "ticket_claimed.two_stage",
    name: "Agent picked up — two-stage (Sears Protect)",
    body: `VRS Update for SO#{serviceOrder}: An agent is actively working on your ticket. Stand by for confirmation of your submission, which will let you know when you can leave.\n\nDO NOT LEAVE THE SITE until you receive that confirmation text.\n\n1. Your photos and details will be reviewed. If anything is missing, you'll receive a text with details so you can quickly resubmit.\n2. If approved, VRS will obtain your authorization code and send it to you.`,
    variables: [{ name: "serviceOrder", required: true, sample: "12345678" }],
  },
  {
    channel: "sms",
    actionKey: "ticket_claimed.resubmission",
    name: "Agent picked up — resubmission",
    body: `VRS Update for SO#{serviceOrder}: An agent is actively working on your resubmitted ticket. Stand by for confirmation of your submission, which will let you know when you can leave.\n\nDO NOT LEAVE THE SITE until you receive that confirmation text.`,
    variables: [{ name: "serviceOrder", required: true, sample: "12345678" }],
  },

  // ---- Stage 1 approval (two-stage Sears Protect only) ---------------------
  {
    channel: "sms",
    actionKey: "submission_approved.stage1",
    name: "Stage 1 approved (clear to leave)",
    body: `VRS Update for SO#{serviceOrder}: Your submission has been reviewed and APPROVED. You are cleared to leave the site and head to your next call.\n\nIMPORTANT: Reschedule this call for the same day so you can reopen it later and enter the authorization code to finalize the part order.\n\nVRS is now working on obtaining your authorization code and will text it to you as soon as it is available.{technicianMessageLine}`,
    variables: [
      { name: "serviceOrder", required: true, sample: "12345678" },
      { name: "technicianMessage", required: false, sample: "Sears Protect requires part #SP-1234.", description: "Free-text agent note (no formatting)." },
      { name: "technicianMessageLine", required: false, sample: "\n\nSears Protect requires part #SP-1234.", description: "Same as technicianMessage but pre-formatted with leading blank lines, or empty if no note." },
    ],
  },

  // ---- Stage 2 / final auth ------------------------------------------------
  {
    channel: "sms",
    actionKey: "ticket_approved.with_auth_and_rgc",
    name: "Final approval — auth code + RGC code",
    body: `VRS Authorization for SO#{serviceOrder}\nAuthorization Code: {authCode}\nRGC Code: {rgcCode}\nEnter both codes in TechHub to complete the job.{agentMessageLine}`,
    variables: [
      { name: "serviceOrder", required: true, sample: "12345678" },
      { name: "authCode", required: true, sample: "AUTH-9988" },
      { name: "rgcCode", required: true, sample: "RGC-4421" },
      { name: "agentMessage", required: false, sample: "Heads up: customer prefers afternoon callback." },
      { name: "agentMessageLine", required: false, sample: "\n\nHeads up: customer prefers afternoon callback.", description: "Pre-formatted (with leading blank lines) or empty." },
    ],
  },
  {
    channel: "sms",
    actionKey: "ticket_approved.rgc_only",
    name: "Final approval — RGC code only",
    body: `VRS Authorization for SO#{serviceOrder}\nYour RGC/Auth Code: {rgcCode}\nEnter this code in TechHub to complete the job.{agentMessageLine}`,
    variables: [
      { name: "serviceOrder", required: true, sample: "12345678" },
      { name: "rgcCode", required: true, sample: "RGC-4421" },
      { name: "agentMessage", required: false, sample: "" },
      { name: "agentMessageLine", required: false, sample: "" },
    ],
  },
  {
    channel: "sms",
    actionKey: "ticket_approved.auth_only",
    name: "Final approval — auth code only",
    body: `VRS Authorization Code: Your auth code for SO# {serviceOrder} is: {authCode}. Please use this code to proceed with the repair.{agentMessageLine}`,
    variables: [
      { name: "serviceOrder", required: true, sample: "12345678" },
      { name: "authCode", required: true, sample: "AUTH-9988" },
      { name: "agentMessage", required: false, sample: "" },
      { name: "agentMessageLine", required: false, sample: "" },
    ],
  },

  // ---- NLA approval (parts team confirms sourcing) -------------------------
  {
    channel: "sms",
    actionKey: "nla_approval",
    name: "NLA — parts request received",
    body: `VRS Authorization for SO#{serviceOrder}{rgcLine}\n\nYour Parts NLA request has been received by the VRS Parts team. You will be contacted with further information regarding part sourcing and availability.{agentMessageLine}`,
    variables: [
      { name: "serviceOrder", required: true, sample: "12345678" },
      { name: "rgcCode", required: false, sample: "RGC-4421" },
      { name: "rgcLine", required: false, sample: "\nYour RGC/Auth Code: RGC-4421\nEnter this code in TechHub to complete the job.", description: "Full RGC block including newlines, or empty if no RGC." },
      { name: "agentMessage", required: false, sample: "" },
      { name: "agentMessageLine", required: false, sample: "" },
    ],
  },

  // ---- Rejections / invalid ------------------------------------------------
  {
    channel: "sms",
    actionKey: "ticket_rejected",
    name: "Rejected — needs more info (resubmit)",
    body: `VRS Update for SO#{serviceOrder}\n\nStatus: MORE INFO NEEDED\nReason: {reason}\n\n{closingLine}`,
    variables: [
      { name: "serviceOrder", required: true, sample: "12345678" },
      { name: "reason", required: true, sample: "Model and serial photos missing" },
      { name: "resubmitLink", required: false, sample: "https://vrs.example.com/resubmit/abc123" },
      { name: "closingLine", required: true, sample: "Tap to resubmit with your info saved:\nhttps://vrs.example.com/resubmit/abc123", description: "Either the resubmit-link block or the supervisor fallback line, computed by the server." },
    ],
  },
  {
    channel: "sms",
    actionKey: "ticket_rejected_closed.with_cash_call",
    name: "Rejected & closed — cash call OK (Sears Protect)",
    body: `VRS Update for SO#{serviceOrder}\n\nStatus: REJECTED — NOT COVERED\nReason: {reason}\n\nThis repair is not covered under warranty. You may offer the customer a cash call estimate for the repair. No further VRS submissions can be made for this service order.`,
    variables: [
      { name: "serviceOrder", required: true, sample: "12345678" },
      { name: "reason", required: true, sample: "Pre-existing damage" },
    ],
  },
  {
    channel: "sms",
    actionKey: "ticket_rejected_closed.no_cash_call",
    name: "Rejected & closed — no cash call (AHS / FA / infestation)",
    body: `VRS Update for SO#{serviceOrder}\n\nStatus: REJECTED — NOT COVERED\nReason: {reason}\n\nThis repair is not covered under warranty. No further VRS submissions can be made for this service order.`,
    variables: [
      { name: "serviceOrder", required: true, sample: "12345678" },
      { name: "reason", required: true, sample: "Infestation" },
    ],
  },
  {
    channel: "sms",
    actionKey: "ticket_invalid",
    name: "Invalid — not a VRS request",
    body: `VRS Update for SO#{serviceOrder}\n\nStatus: NOT APPLICABLE\nReason: {invalidReason}{instructionsLine}\n\nThis request cannot be processed through VRS. Please follow the instructions above.`,
    variables: [
      { name: "serviceOrder", required: true, sample: "12345678" },
      { name: "invalidReason", required: true, sample: "Wrong submission type" },
      { name: "instructions", required: false, sample: "Submit through the standard authorization flow." },
      { name: "instructionsLine", required: false, sample: "\n\nInstructions: Submit through the standard authorization flow.", description: "Pre-formatted or empty." },
    ],
  },
  {
    channel: "sms",
    actionKey: "nla_invalid",
    name: "NLA invalid — wrong request",
    body: `VRS NLA Update for SO#{serviceOrder}\n\nStatus: INVALID NLA REQUEST\nReason: {invalidReason}{instructionsLine}`,
    variables: [
      { name: "serviceOrder", required: true, sample: "12345678" },
      { name: "invalidReason", required: true, sample: "Part is in stock — no NLA needed" },
      { name: "instructions", required: false, sample: "Order through standard parts flow." },
      { name: "instructionsLine", required: false, sample: "\n\nInstructions: Order through standard parts flow.", description: "Pre-formatted or empty." },
    ],
  },
];

async function seedDefaultCommunicationTemplates() {
  let inserted = 0;
  for (const tpl of DEFAULT_COMMUNICATION_TEMPLATES) {
    const before = await storage.getCommunicationTemplate(tpl.channel, tpl.actionKey);
    await storage.upsertDefaultCommunicationTemplate({
      channel: tpl.channel,
      actionKey: tpl.actionKey,
      subject: null,
      title: tpl.name,
      body: tpl.body,
      variables: tpl.variables as any,
      isDefault: true,
      isActive: true,
      currentVersion: 1,
      updatedBy: null,
    });
    if (!before) inserted += 1;
  }
  if (inserted > 0) {
    console.log(`[seed] communication_templates: inserted ${inserted} default(s) (existing rows untouched)`);
  }
}

// Tyler 2026-04-29 — testagent1 renamed to ZZTEST9 (see SEED_USERS above).
// Both kept here so historical pre-rename rows are still recognised by cleanup.
const TEST_RAC_IDS = ["ZZTEST9", "testagent1", "TESTADMIN", "testtech1", "tmorri1", "sysadmin"];

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

const TEST_SUBMISSION_RAC_IDS = ["testtech1", "tmorri1"];

async function purgeTestSubmissions() {
  const testSubs = await db.select({ id: submissions.id })
    .from(submissions)
    .where(sql`${submissions.racId} IN (${sql.join(TEST_SUBMISSION_RAC_IDS.map(r => sql`${r}`), sql`, `)})`);

  const testSubIds = testSubs.map(s => s.id);
  if (testSubIds.length === 0) return 0;

  await db.delete(smsNotifications)
    .where(sql`${smsNotifications.submissionId} IN (${sql.join(testSubIds.map(id => sql`${id}`), sql`, `)})`);

  await db.delete(submissions)
    .where(sql`${submissions.id} IN (${sql.join(testSubIds.map(id => sql`${id}`), sql`, `)})`);

  return testSubIds.length;
}

async function cleanupTestSubmissions() {
  if (process.env.NODE_ENV === "production") {
    console.log("[test-cleanup] Skipped in production environment");
    return;
  }
  const deleted = await purgeTestSubmissions();
  if (deleted > 0) {
    console.log(`[test-cleanup] Startup: deleted ${deleted} test submissions`);
  }
}

