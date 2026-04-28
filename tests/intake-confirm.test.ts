// =============================================================================
// Intake form CONFIRM endpoint regression harness
// =============================================================================
// Tyler 2026-04-28 — written in response to a reproducible production-side
// failure where clicking "I submitted Smartsheet" inside the new always-on
// Intake Form tab raised the red toast:
//
//   Could not record intake / Failed to record intake form
//
// The toast description ("Failed to record intake form") is the verbatim
// `error` string returned by `POST /api/submissions/:id/intake-form/confirm`
// from its 500-level catch branches. Until now the handler emitted a single
// catch-all "Intake form confirm error: <stack>" log line with no breadcrumb
// of WHICH step (parse → ownership → existing-check → ih-unit lookup →
// racId lookup → URL builder → DB insert) actually blew up.
//
// This harness exercises the endpoint end-to-end against the live dev server
// for both seed tickets the agents will hit on day one:
//
//   * SO 99999000006 (submission id 79) — SPHW branch (Sears Protect),
//     post-Authorize state (auth_code present, ticket_status=completed).
//
//   * SO 99999000007 (submission id 80) — AHS branch (American Home Shield),
//     PRE-Authorize state (no auth_code, ticket_status=pending) — proves the
//     always-on tab requirement Tyler shipped on 2026-04-28: the confirm
//     POST must succeed even before the agent has issued an auth code.
//
// The harness is INTENTIONALLY agnostic to the breadcrumb log format —
// assertions only inspect the HTTP response body / status / persisted
// `intake_forms` row. The structured server logs are diagnostic, not
// contractual.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { db } from "../server/storage";
import { intakeForms } from "../shared/schema";
import { eq, inArray } from "drizzle-orm";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:5000";
const AGENT_LDAP = "testagent1";
const AGENT_PASSWORD = "TestAgent2026!";

const TICKET_SPHW = { submissionId: 79, serviceOrder: "99999000006", branch: "SPHW" };
const TICKET_AHS = { submissionId: 80, serviceOrder: "99999000007", branch: "AHS" };

let agentToken: string;

async function login(): Promise<string> {
  const res = await request(BASE_URL)
    .post("/api/auth/login")
    .send({ identifier: AGENT_LDAP, password: AGENT_PASSWORD })
    .expect(200);
  if (!res.body?.token) {
    throw new Error(`Login did not return a token. Body: ${JSON.stringify(res.body)}`);
  }
  return res.body.token as string;
}

async function preview(submissionId: number, payload: Record<string, string | number> = {}) {
  return request(BASE_URL)
    .post(`/api/submissions/${submissionId}/intake-form/preview`)
    .set("Authorization", `Bearer ${agentToken}`)
    .send({ payload });
}

async function confirm(
  submissionId: number,
  body: { payload?: Record<string, string | number>; smartsheetUrlSubmitted?: string }
) {
  return request(BASE_URL)
    .post(`/api/submissions/${submissionId}/intake-form/confirm`)
    .set("Authorization", `Bearer ${agentToken}`)
    .send(body);
}

async function clearIntakeRows(submissionIds: number[]) {
  if (submissionIds.length === 0) return;
  await db.delete(intakeForms).where(inArray(intakeForms.submissionId, submissionIds));
}

beforeAll(async () => {
  agentToken = await login();
  // Start each test run from a clean slate so we can assert "row was created
  // by this run" rather than "row exists at all". Cleanup is also done at
  // afterAll to keep the dev DB tidy for the next manual smoke test.
  await clearIntakeRows([TICKET_SPHW.submissionId, TICKET_AHS.submissionId]);
});

afterAll(async () => {
  await clearIntakeRows([TICKET_SPHW.submissionId, TICKET_AHS.submissionId]);
});

describe("POST /api/submissions/:id/intake-form/confirm", () => {
  it(
    `succeeds for SO ${TICKET_SPHW.serviceOrder} (SPHW, post-Authorize) and writes the intake_forms row the live UI expects`,
    async () => {
      // 1. Fetch preview — the live UI does this on tab open and uses the
      //    returned `derivedDefaults` to seed the prefill. The confirm POST
      //    must accept the same payload shape the UI actually sends.
      const previewRes = await preview(TICKET_SPHW.submissionId);
      expect(previewRes.status).toBe(200);
      expect(previewRes.body.branch).toBe(TICKET_SPHW.branch);
      expect(typeof previewRes.body.url).toBe("string");
      expect(previewRes.body.url).toContain("smartsheet.com/b/form/");

      // 2. Confirm with the same payload+url the agent dashboard sends
      //    (intakeValues seeded from derivedDefaults, smartsheetUrlSubmitted
      //    = preview.url). This is the EXACT call shape that produced
      //    Tyler's red toast in production.
      const confirmRes = await confirm(TICKET_SPHW.submissionId, {
        payload: previewRes.body.derivedDefaults ?? {},
        smartsheetUrlSubmitted: previewRes.body.url,
      });

      if (confirmRes.status !== 200) {
        // Surface the structured-log breadcrumb code in the assertion
        // message so a CI failure points at the exact step.
        throw new Error(
          `confirm failed: status=${confirmRes.status} body=${JSON.stringify(confirmRes.body)}`
        );
      }

      expect(confirmRes.body?.intakeForm?.submissionId).toBe(TICKET_SPHW.submissionId);
      expect(confirmRes.body?.intakeForm?.smartsheetUrlSubmitted).toContain(
        `IH%20Service%20Order%20Number=${TICKET_SPHW.serviceOrder}`
      );
      expect(confirmRes.body?.intakeForm?.payload?.__branch).toBe(TICKET_SPHW.branch);

      // 3. Verify the row actually landed in the DB (not just echoed back
      //    by a stub).
      const [row] = await db
        .select()
        .from(intakeForms)
        .where(eq(intakeForms.submissionId, TICKET_SPHW.submissionId));
      expect(row).toBeTruthy();
      expect(row.id).toBe(confirmRes.body.intakeForm.id);
    },
    20000
  );

  it(
    `succeeds for SO ${TICKET_AHS.serviceOrder} (AHS, PRE-Authorize / no auth_code) — proves the always-on tab requirement`,
    async () => {
      // SO 99999000007 has ticket_status=pending, stage2_status=pending,
      // and NO auth_code. Per Tyler's 2026-04-28 always-on requirement the
      // Intake tab is clickable + the iframe loads + the confirm POST
      // succeeds in this state. Pre-auth fields (auth_code, etc.) are
      // simply absent from the prefill payload.
      const previewRes = await preview(TICKET_AHS.submissionId);
      expect(previewRes.status).toBe(200);
      expect(previewRes.body.branch).toBe(TICKET_AHS.branch);

      const confirmRes = await confirm(TICKET_AHS.submissionId, {
        payload: previewRes.body.derivedDefaults ?? {},
        smartsheetUrlSubmitted: previewRes.body.url,
      });

      if (confirmRes.status !== 200) {
        throw new Error(
          `confirm failed: status=${confirmRes.status} body=${JSON.stringify(confirmRes.body)}`
        );
      }

      expect(confirmRes.body?.intakeForm?.submissionId).toBe(TICKET_AHS.submissionId);
      expect(confirmRes.body?.intakeForm?.payload?.__branch).toBe(TICKET_AHS.branch);
      expect(confirmRes.body?.intakeForm?.smartsheetUrlSubmitted).toContain(
        `IH%20Service%20Order%20Number=${TICKET_AHS.serviceOrder}`
      );

      const [row] = await db
        .select()
        .from(intakeForms)
        .where(eq(intakeForms.submissionId, TICKET_AHS.submissionId));
      expect(row).toBeTruthy();
      expect(row.id).toBe(confirmRes.body.intakeForm.id);
    },
    20000
  );

  it(
    `returns a 409 ALREADY_RECORDED (NOT a 500 with "Failed to record intake form") on a duplicate submit — the production red-toast bug class`,
    async () => {
      // Even when the agent rage-clicks "I submitted Smartsheet" the second
      // request must not surface the catch-all 500. It must return the
      // structured 409 the UI was designed around. Without this assertion
      // a regression that drops the existing-check would silently revert
      // to the very failure mode Tyler reported.
      await clearIntakeRows([TICKET_SPHW.submissionId]);

      const previewRes = await preview(TICKET_SPHW.submissionId);
      expect(previewRes.status).toBe(200);

      const first = await confirm(TICKET_SPHW.submissionId, {
        payload: previewRes.body.derivedDefaults ?? {},
        smartsheetUrlSubmitted: previewRes.body.url,
      });
      expect(first.status).toBe(200);

      const second = await confirm(TICKET_SPHW.submissionId, {
        payload: previewRes.body.derivedDefaults ?? {},
        smartsheetUrlSubmitted: previewRes.body.url,
      });

      // The bug Tyler reported would manifest as either status=500 with
      // error="Failed to record intake form" OR a successful duplicate
      // insert (silently corrupting the audit trail). Neither is allowed.
      expect(second.status).toBe(409);
      expect(second.body?.code).toBe("ALREADY_RECORDED");
      expect(second.body?.error).not.toContain("Failed to record intake form");
    },
    20000
  );
});
