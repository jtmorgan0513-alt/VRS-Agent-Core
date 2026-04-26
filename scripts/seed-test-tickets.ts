/**
 * Seed 3 test submissions for end-to-end VRS Agent flow verification.
 *
 * Run manually:  tsx scripts/seed-test-tickets.ts
 *
 * Idempotent: skips any submission whose service_order already exists.
 * All submissions are tagged with [TEST] in issue_description so they can be
 * easily identified and removed (see cleanup SQL in COMMITS.md).
 *
 * Tickets:
 *   1. SO 99999000001 — Sears Protect authorization, queued (claimable from queue).
 *      Walk Stage 1 -> Stage 2 -> Stage 3 (intake auto-opens after authorize+send).
 *   2. SO 99999000002 — AHS authorization, queued (claimable from queue).
 *      Verifies dual-code (AHS + RGC) path; intake auto-opens after authorize+send.
 *   3. SO 99999000003 — already-approved Sears Protect (auth_code populated,
 *      no intake_forms row). Lands directly on Stage 3 to verify auto-open
 *      and the "Re-open intake form" fallback button.
 */

import bcryptjs from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "../server/storage";
import { users, technicians, submissions } from "../shared/schema";

const TECH_LDAP = "test_tech_1";
const TECH_NAME = "TEST_TECH_1";
const TECH_PHONE = "555-0100";
const TECH_RAC = "TEST_TECH_1";
const TECH_UN_NO = "T_TEST_001";
const DISTRICT = "8175";

const SO_1 = "99999000001";
const SO_2 = "99999000002";
const SO_3 = "99999000003";

async function ensureTechnicianUser() {
  const existing = await db.select().from(users).where(eq(users.racId, TECH_RAC)).limit(1);
  if (existing.length) {
    console.log(`[skip] users row for ${TECH_RAC} exists (id=${existing[0].id})`);
    return existing[0];
  }
  const placeholderHash = await bcryptjs.hash("disabled-test-account-no-login", 10);
  const [created] = await db
    .insert(users)
    .values({
      name: TECH_NAME,
      role: "technician",
      racId: TECH_RAC,
      phone: TECH_PHONE,
      password: placeholderHash,
      isActive: true,
      firstLogin: false,
      mustChangePassword: false,
      isSystemAccount: false,
    })
    .returning();
  console.log(`[create] users row for ${TECH_RAC} (id=${created.id})`);
  return created;
}

async function ensureTechnicianRow() {
  const existing = await db
    .select()
    .from(technicians)
    .where(eq(technicians.ldapId, TECH_LDAP))
    .limit(1);
  if (existing.length) {
    console.log(`[skip] technicians row for ${TECH_LDAP} exists (id=${existing[0].id})`);
    return existing[0];
  }
  const [created] = await db
    .insert(technicians)
    .values({
      ldapId: TECH_LDAP,
      name: TECH_NAME,
      phone: TECH_PHONE,
      district: DISTRICT,
      techUnNo: TECH_UN_NO,
      isActive: true,
    })
    .returning();
  console.log(`[create] technicians row for ${TECH_LDAP} (id=${created.id}, tech_un_no=${TECH_UN_NO})`);
  return created;
}

interface TicketSpec {
  so: string;
  warrantyType: "sears_protect" | "american_home_shield";
  ticketStatus: "queued" | "approved";
  procId: string;
  clientNm: string;
  authCode: string | null;
  estimateAmount: string;
  scenario: string;
}

async function ensureSubmission(spec: TicketSpec, technicianUserId: number) {
  const existing = await db
    .select()
    .from(submissions)
    .where(eq(submissions.serviceOrder, spec.so))
    .limit(1);
  if (existing.length) {
    console.log(`[skip] submission SO ${spec.so} exists (id=${existing[0].id}, status=${existing[0].ticketStatus})`);
    return existing[0];
  }

  const isApproved = spec.ticketStatus === "approved";
  const [created] = await db
    .insert(submissions)
    .values({
      technicianId: technicianUserId,
      racId: TECH_RAC,
      phone: TECH_PHONE,
      serviceOrder: spec.so,
      districtCode: DISTRICT,
      applianceType: "refrigeration",
      requestType: "authorization",
      warrantyType: spec.warrantyType,
      issueDescription: `[TEST] ${spec.scenario} — Refrigerator not cooling, compressor running but no cold air. SO ${spec.so}.`,
      estimateAmount: spec.estimateAmount,
      technicianLdapId: TECH_LDAP,
      procId: spec.procId,
      clientNm: spec.clientNm,
      ticketStatus: spec.ticketStatus,
      stage1Status: isApproved ? "approved" : "pending",
      stage2Status: isApproved ? "approved" : "pending",
      submissionApproved: isApproved,
      submissionApprovedAt: isApproved ? sql`now()` : null,
      authCode: spec.authCode,
      aiEnhanced: false,
    })
    .returning();
  console.log(`[create] submission SO ${spec.so} (id=${created.id}, ${spec.warrantyType}/${spec.ticketStatus})`);
  return created;
}

async function main() {
  console.log("=== Seeding VRS test tickets ===");

  const techUser = await ensureTechnicianUser();
  await ensureTechnicianRow();

  await ensureSubmission(
    {
      so: SO_1,
      warrantyType: "sears_protect",
      ticketStatus: "queued",
      procId: "SPRCLL",
      clientNm: "Sears Protect",
      authCode: null,
      estimateAmount: "475.00",
      scenario: "Sears Protect Authorization (Stage 1 -> 2 -> 3 full flow)",
    },
    techUser.id,
  );

  await ensureSubmission(
    {
      so: SO_2,
      warrantyType: "american_home_shield",
      ticketStatus: "queued",
      procId: "AHSCLL",
      clientNm: "American Home Shield",
      authCode: null,
      estimateAmount: "525.00",
      scenario: "AHS Authorization (dual-code AHS+RGC, intake auto-open)",
    },
    techUser.id,
  );

  await ensureSubmission(
    {
      so: SO_3,
      warrantyType: "sears_protect",
      ticketStatus: "approved",
      procId: "SPRCLL",
      clientNm: "Sears Protect",
      authCode: "TEST-AUTH-001",
      estimateAmount: "612.50",
      scenario: "Pre-approved Sears Protect (Stage 3 landing, no intake_forms row)",
    },
    techUser.id,
  );

  console.log("=== Done ===");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
