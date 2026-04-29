# Commits — Calculator + Intake Form (2026-04-26)

> **Tyler:** This branch is intentionally uncommitted per ground rule. Below are
> the suggested per-task commits in order, with the file lists I touched. Run
> these in sequence on the feature branch you want to merge.
>
> ⚠️ **Run `npm run db:push` before deploy** (see CHANGELOG Deployment Notes).
> ⚠️ **Do NOT mix unrelated changes into these commits** — every file listed
> here is in scope for the calculator + intake form plan.

---

## Commit 1 — T0: Smartsheet intake field map

```
docs(intake): capture verbatim Smartsheet intake form field map + branch metadata

Tyler walked through the live "VRS Unrep Intake Form 2.0" Smartsheet form and
confirmed which questions appear per warranty branch (AHS, SPHW, SHW, SRW, ISP).
Captured here as the source of truth that feeds the front-end fieldset and the
server-side allow-list. Branches still flagged INCOMPLETE will need a follow-up
walk before going GA.

Refs: docs/superpowers/plans/2026-04-25-calculator-and-intake-form.md (T0)
```

Files:
- `docs/intake_form_field_map.md` (new)
- `docs/intake_form_default_snapshot.yml` (extended)

---

## Commit 2 — T1: Schema + storage

```
feat(schema): add intake_forms + agent_external_credentials tables (additive)

intake_forms records each completed Smartsheet intake submission per ticket
and is the source of truth for the new claim-gate. agent_external_credentials
holds per-agent encrypted calculator credentials (AES-256-GCM, scrypt key
derivation, see server/services/crypto.ts in commit 6). 7 new IStorage
methods added with Drizzle DatabaseStorage implementations:
claimSubmission (atomic), getMissingIntakeForAgent, getIntakeFormBySubmission,
createIntakeForm, getAgentCredential, upsertAgentCredential,
deleteAgentCredential.

Requires: npm run db:push before deploy (see CHANGELOG Deployment Notes).
Refs: plan T1
```

Files:
- `shared/schema.ts` (additive — two new tables, insert schemas, types)
- `server/storage.ts` (additive — 7 new IStorage methods + DatabaseStorage impls)

---

## Commit 3 — T4: Smartsheet pre-fill service + intake routes

```
feat(intake): server-side pre-fill URL builder + intake-form routes

server/services/smartsheet.ts builds the column-label-keyed Smartsheet pre-fill
URL with a hard-coded allow-list (ALLOWED_COLUMN_LABELS) so payload shape from
the client cannot smuggle arbitrary fields. Two new endpoints:
- POST /api/submissions/:id/intake-form/preview → returns { url, params, branch, warnings }
- POST /api/submissions/:id/intake-form/confirm → inserts intake_forms row

Both endpoints require ownership of the submission (assigned_to = me OR
reviewed_by = me) or admin role.

Refs: plan T4
```

Files:
- `server/services/smartsheet.ts` (new)
- `server/routes.ts` (additive — 2 new routes near end + loadOwnedSubmission helper)

---

## Commit 4 — T5: Atomic claim + intake gate

```
feat(claim): atomic UPDATE-WHERE claim + 24h intake-form gate

PATCH /api/submissions/:id/claim is now race-safe (UPDATE WHERE
ticket_status = 'queued' atomic in storage.claimSubmission) AND gates new
claims for vrs_agent users on completing the Smartsheet intake form for any
non-NLA ticket they reviewed in the last 24h. Returns 409 with structured
{ code: "INTAKE_REQUIRED" | "ALREADY_CLAIMED", blockingSubmissionId? }.
Admins bypass the intake gate.

Refs: plan T5
```

Files:
- `server/routes.ts` (intake-gate insertion + atomic claim swap inside existing /claim handler)
  - All other server/routes.ts changes ride along with commits 3 and 6 — this commit
    is purely the changes inside the /claim handler.

---

## Commit 5 — T2 + T3: Right-panel tabs + intake fieldset (frontend)

```
feat(agent): tabbed right panel (SHSAI / Calculator) + intake form fieldset

Adds a Tabs control at the top of the agent dashboard's right panel with
"Service Order History" (default, the existing SHSAI flow) and "Calculator"
(iframe of repairreplacecalculator.replit.app) as the two tabs. Tab choice
persists per-agent via localStorage (agent:${user.id}:rightPanel). Existing
button-show-shsai / button-hide-shsai test IDs are preserved.

Adds branch-aware intake fieldset (data-driven from
client/src/lib/intake-form-config.ts) inserted above the Review Actions card
on pending non-NLA tickets. "Submit Intake to Smartsheet" is hard-block-gated
on missing required fields and opens the IntakeFormReviewModal.

Refs: plan T2, T3
```

Files:
- `client/src/lib/intake-form-config.ts` (new)
- `client/src/components/intake-form-fieldset.tsx` (new)
- `client/src/components/intake-form-review-modal.tsx` (new — also used in commit 6)
- `client/src/pages/agent-dashboard.tsx` (state + Tabs + fieldset insertion + claim 409 handler + modal mount)

---

## Commit 6 — TD3b: Calculator credentials + auto-login (frontend + server)

```
feat(calculator): encrypted per-agent credentials + iframe auto-login bridge

Per-agent calculator credentials encrypted server-side with AES-256-GCM
(scrypt(SESSION_SECRET, perRowSalt) key derivation). 4 new endpoints:
- GET /api/agent/credentials/calculator (existence + maskedUsername)
- POST /api/agent/credentials/calculator (save / replace)
- DELETE /api/agent/credentials/calculator
- POST /api/agent/credentials/calculator/reveal (decrypt for postMessage)

Calculator iframe sends postMessage envelope on load with credentials,
falling back to URL params (?username=&password=) and final-fallback
copy-to-clipboard buttons in the Settings dialog. Settings gear is rendered
inside the Calculator tab.

Also adds GET /api/agent/intake-status for the dashboard to query the gate
state out-of-band.

Refs: plan TD3b
```

Files:
- `server/services/crypto.ts` (new)
- `server/routes.ts` (4 calc-credential routes + intake-status route at end)
- `client/src/components/calculator-iframe.tsx` (new)
- `client/src/components/calculator-settings-dialog.tsx` (new)
- `client/src/pages/agent-dashboard.tsx` (CalculatorIframe + CalculatorSettingsDialog mount)

---

## Commit 7 — T6: Smoke test + checklist

```
test(intake): pre-fill URL builder smoke test + manual smoke checklist

scripts/test-intake-url.ts is runnable via `tsx scripts/test-intake-url.ts`
and exercises buildIntakeFormUrl across all 5 branches.
docs/intake_form_smoke_checklist.md walks the manual end-to-end pass for
post-deploy verification.

Refs: plan T6
```

Files:
- `scripts/test-intake-url.ts` (new)
- `docs/intake_form_smoke_checklist.md` (new)

---

## Commit 8 — T7: CHANGELOG + memory

```
docs: changelog + memory updates for calculator + intake form release

Refs: plan T7
```

Files:
- `CHANGELOG.md` (Unreleased section extended)
- `.claude/memory/context.md` (Recent Changes entry)
- `.claude/memory/todos.md` (mark plan execution Done)
- `.claude/memory/decisions.md` (ADR for crypto + claim-gate choices)
- `COMMITS.md` (this file)

---

# 2026-04-26 — Stage 3 reordering follow-up
# (Tyler asked: "Smartsheet should be the LAST step, gated behind a successful
#  Authorize and Send.")

## Commit 9 — T8: tighten claim-gate predicate + add intake-form-status route

```
feat(intake): tighten claim-gate to authorized-only + add per-submission status route

- storage.getMissingIntakeForAgent: predicate narrowed from
  ticket_status IN ('completed','rejected','invalid','approved')
  to ticket_status = 'approved' AND auth_code IS NOT NULL.
  Rejected / invalid tickets no longer block the agent's next claim
  (they never needed a Smartsheet row in the first place).
- New GET /api/submissions/:id/intake-form-status — single source of
  truth for whether the new Stage 3 card should render. Returns
  { required, recorded, reason?, intakeForm? }. Same gating logic,
  scoped to one submission.

No schema changes (reuses existing ticket_status, auth_code, intake_forms).
```

Files:
- `server/storage.ts` (`getMissingIntakeForAgent` predicate tightened, doc-comment added)
- `server/routes.ts` (new `GET /api/submissions/:id/intake-form-status` route)

---

## Commit 10 — T9: required Smartsheet success attestation in intake review modal

```
feat(intake): require checkbox attestation before recording intake row

The "I submitted Smartsheet" button is now disabled until the agent
ticks "I confirmed the Smartsheet success page appeared after clicking
Submit inside the form above." Guards against the audit row in
intake_forms being recorded when the agent skipped Smartsheet's own
Submit button inside the iframe.

Checkbox state resets when the modal opens.
```

Files:
- `client/src/components/intake-form-review-modal.tsx`

---

## Commit 11 — T10: 3-stage progressive disclosure + sidebar badge + post-Authorize redirect

```
feat(agent-dashboard): Stage 3 Smartsheet Intake replaces Stage 2 after Authorize & Send

- Resolution panel now follows 3-stage progressive disclosure:
    Stage 1 (Submission Review)  : pending + !submissionApprovedAt
    Stage 2 (Authorization)      : pending +  submissionApprovedAt
    Stage 3 (Smartsheet Intake)  : approved + auth_code + non-NLA + no intake row
- Stage 3 card lives in the same resolution-panel slot Stage 2 used to,
  with its own 3-segment progress bar (green/green/blue), an
  "Authorization Sent" callout, the existing IntakeFormFieldset, and
  the existing Submit-Intake-to-Smartsheet button.
- Once recorded, Stage 3 collapses to a "Smartsheet Intake Recorded"
  success card so the agent can see the gate has released.
- Pending Smartsheet Intake (N) sidebar item — surfaces the same set
  the claim-gate uses, click-through routes to most-recent blocking
  submission and switches to My Tickets so Stage 3 auto-renders.
- processMutation.onSuccess: a successful "approve" on a non-NLA ticket
  now keeps the ticket selected so the resolution panel re-renders
  into Stage 3, then scrolls Stage 3 into view. Stage 1
  ("approve_submission") behavior unchanged. Reject / invalid /
  reject_and_close clear selection as before.
- Existing 2-stage progress bar extended to 3 segments for non-NLA
  warranties so the journey is visible from the start.
- Server query is the single source of truth via the new
  /intake-form-status endpoint — UI never re-derives the gate locally.

Test IDs added: card-stage3-intake, card-stage3-recorded,
progress-stage3, text-stage3-context, text-stage3-recorded,
nav-pending-intake, badge-pending-intake-count.
```

Files:
- `client/src/pages/agent-dashboard.tsx`

---

## Commit 12 — T11: docs (CHANGELOG + memory + COMMITS.md)

```
docs: stage 3 reordering — changelog, ADR-012, todos, COMMITS

Refs: stage-3 reordering follow-up
```

Files:
- `CHANGELOG.md` (Changed entry under [Unreleased])
- `.claude/memory/context.md` (Recent Changes entry)
- `.claude/memory/todos.md` (mark Stage 3 reordering Done)
- `.claude/memory/decisions.md` (ADR-012: Stage 3 reordering rationale)
- `COMMITS.md` (this file)

---

## Commit 13 — Stage 3 dual-render race fix (post-architect-review)

```
fix(agent-dashboard): prevent dual-render of Stage 1/2 + Stage 3 during cache invalidation

selectedSubmission and intakeFormStatusQuery come from two separate queries.
During the brief invalidation window after Authorize & Send, the per-submission
intake-form-status endpoint can already report required=true while the cached
selectedSubmission still reports ticketStatus='pending', causing both cards to
render simultaneously for a few hundred ms.

Tighten the Stage 1/2 (non-NLA) render predicate to require
!stage3Required && !stage3Recorded so Stage 3 truly replaces Stage 2 in the
resolution-panel slot. NLA Stage 1/2 unaffected — NLA tickets never trigger
Stage 3.

Surfaced by architect review of the Stage 3 reordering follow-up.
```

Files:
- `client/src/pages/agent-dashboard.tsx` (Stage 1/2 card render predicate tightened, comment block added)
- `.claude/memory/decisions.md` (ADR-012 amended with race-fix note + per-submission-vs-per-agent predicate clarification)

---

# 2026-04-26 — Tyler's 4-decision directive (gate retirement + auto-open + max-derivation)
# (Tyler decisions D1–D4: keep audit trail, rip out 24h gate, auto-open modal
#  on Authorize & Send, maximize auto-population.)

## Commit 14 — Tyler D1+D2: keep audit trail, rip out 24h claim gate

```
feat(intake): retire 24h "intake missing" claim gate; keep audit trail (ADR-013)

Tyler decided the 24h gate was friction without value: the intake_forms
audit row is still useful as a paper trail, but agents should never be
blocked from claiming the next ticket. The gate is removed end-to-end:

Server:
- PATCH /api/submissions/:id/claim — gate block (lines 1156-1173) removed,
  replaced with a comment block referencing ADR-013. Atomic UPDATE-WHERE
  race protection between concurrent agents is preserved.
- IStorage.getMissingIntakeForAgent + DatabaseStorage impl removed.
- GET /api/agent/intake-status endpoint removed (was only consumed by the
  sidebar badge).
- Per-submission GET /api/submissions/:id/intake-form-status retained — it
  still drives the Stage 3 fallback card visibility on the selected ticket.

Client:
- Sidebar "Pending Smartsheet Intake" badge + nav-pending-intake item +
  badge-pending-intake-count removed.
- missingIntakeQuery / missingIntakeCount / missingIntakeMostRecent state
  removed.
- claimMutation 409 INTAKE_REQUIRED branch + intakeBlockingSubmissionId
  state removed. The fetch bypass is preserved for future structured 409s
  (e.g. ALREADY_CLAIMED race-loser).
- All ["/api/agent/intake-status"] cache invalidations removed (parent +
  modal). Per-submission status query is what now drives Stage 3 visibility.
```

Files:
- `server/storage.ts` (IStorage decl + DatabaseStorage method removed; tombstone comments)
- `server/routes.ts` (gate block in /claim removed; orphaned /api/agent/intake-status route removed; comment refresh)
- `client/src/pages/agent-dashboard.tsx` (sidebar badge + missingIntakeQuery + intakeBlockingSubmissionId + 409 handler all stripped; modal mount simplified)
- `client/src/components/intake-form-review-modal.tsx` (intake-status invalidation removed)

---

## Commit 15 — Tyler D3: auto-open intake modal on successful Authorize & Send

```
feat(agent): auto-open intake review modal post-Authorize for non-NLA tickets

Replaces the previous "scroll Stage 3 card into view" UX with directly
opening the IntakeFormReviewModal so the agent doesn't have to hunt for
the card. Stage 3 fieldset card still renders underneath as the fallback
re-open path if the agent dismisses the modal (Tyler D2 — see ADR-013).
Re-open button relabeled "Re-open intake form" to reflect its new role.

processMutation.onSuccess flow:
- approve_submission (Stage 1 mid-flow) — selection kept, no modal (unchanged).
- approve on non-NLA — selection kept; setIntakeModalOpen(true) fires after
  the cache invalidation lands so the per-submission intake-form-status
  query has time to flip required=true.
- approve on NLA / reject / invalid / reject_and_close — selection cleared
  (unchanged).
```

Files:
- `client/src/pages/agent-dashboard.tsx` (processMutation.onSuccess + Stage 3 button label + comment block)

---

## Commit 16 — Tyler D4: maximize intake-form auto-population

```
feat(intake): maximize server-side auto-population for intake fieldset

Extends buildIntakeFormUrl to derive far more fields server-side from the
submission row, so agents have less to type post-Authorize. Strictly
additive — every default still loses to an explicit agent value in the
payload. Modal exposes the new derived defaults via onPreviewLoaded so
the parent can seed the Stage 3 fallback fieldset state.

Defaults added per branch:
- SHW: "Reason for Calling VRS Hotline SHW" preselected by request type
  (authorization → "Un-economical to Repair";
   infestation_non_accessible → "Customer Abuse/Neglect Not Covered.";
   parts_nla → "Un-Repairable Sealed System").
  "SHW Uneconomical to Repair Calculated Amount" pre-filled from
  submission.estimateAmount when the dominant reason is selected.
- SPHW: "VRS Tech Repair/Replacement Review Decision" defaults to
  "Repair Product"; "Pre-Existing Condition SPHW" defaults to "No";
  "Comments to support repair or replace decision" auto-populated from
  submission.agentNotes.
- AHS: "Reason for calling the VRS Hotline AHS" pre-fills with truncated
  submission.issueDescription (200ch) so the agent has something to edit
  instead of a blank field.

Always-visible "IH Unit Number" now resolves from the technicians table
via LDAP id lookup (preview + confirm routes).

BuildIntakeFormUrlInput extended with estimateAmount, agentNotes,
requestType, issueDescription. BuildIntakeFormUrlResult adds
derivedDefaults — the subset of params that came from server-side
defaults rather than the agent's payload. Modal forwards these to the
parent via the new optional onPreviewLoaded callback so the Stage 3
fallback fieldset stays in sync with the modal.
```

Files:
- `server/services/smartsheet.ts` (BuildIntakeFormUrlInput + result extended; SHW/SPHW/AHS branch defaults)
- `server/routes.ts` (preview + confirm routes resolve techUnNo via storage.getTechnicianByLdapId)
- `client/src/components/intake-form-review-modal.tsx` (onPreviewLoaded callback added; PreviewResponse extended)
- `client/src/pages/agent-dashboard.tsx` (modal mount wires onPreviewLoaded to merge into intakeValues for unset keys)

---

## Commit 17 — Tyler 4-decision directive: docs

```
docs: ADR-013 + CHANGELOG + memory + COMMITS for the 4-decision directive
```

Files:
- `CHANGELOG.md` (Unreleased entry)
- `.claude/memory/decisions.md` (ADR-013: gate retirement rationale)
- `.claude/memory/context.md` (Recent Changes entry)
- `COMMITS.md` (this file)


---

## Test ticket seeding (manual, not committed)

`scripts/seed-test-tickets.ts` — idempotent seed script for 3 end-to-end test
submissions. Skips any service_order that already exists. Run manually:

```
tsx scripts/seed-test-tickets.ts
```

Creates (if missing):
- `users` row id=103: name=TEST_TECH_1, role=technician, rac_id=TEST_TECH_1
- `technicians` row ldap_id=test_tech_1, tech_un_no=T_TEST_001
- Submission 73: SO 99999000001, sears_protect, queued, proc_id=SPRCLL
- Submission 74: SO 99999000002, american_home_shield, queued, proc_id=AHSCLL
- Submission 75: SO 99999000003, sears_protect, approved, auth_code='TEST-AUTH-001',
  proc_id=SPRCLL (assigned_to was set manually post-seed for whichever test
  agent will exercise the Stage 3 landing path)

All three issue_descriptions are prefixed with `[TEST]` for grep-ability.

### Cleanup SQL (run when done testing)

```sql
-- Remove the 3 seeded submissions (and any cascade-related rows).
DELETE FROM submission_notes WHERE submission_id IN (
  SELECT id FROM submissions WHERE service_order LIKE '99999%' AND issue_description LIKE '[TEST]%'
);
DELETE FROM sms_notifications WHERE submission_id IN (
  SELECT id FROM submissions WHERE service_order LIKE '99999%' AND issue_description LIKE '[TEST]%'
);
DELETE FROM submissions
 WHERE service_order LIKE '99999%'
   AND issue_description LIKE '[TEST]%';

-- Remove the seeded technician + user (only if no other submissions reference them).
DELETE FROM technicians WHERE ldap_id = 'test_tech_1';
DELETE FROM users WHERE rac_id = 'TEST_TECH_1';
```

### Walkthrough notes (April 2026)

End-to-end walkthrough of Ticket 1 (SO 99999000001) using the seeded admin
account (rac_id `TESTADMIN`, password `VRS2026!`) confirmed:
- Stage 1 -> Stage 2 transition works.
- Stage 2 authorize+send completes successfully.
- **Decision 3 auto-open works:** the intake review modal opened automatically
  after the Stage 2 success toast (~350ms after onSuccess).
- The fallback "Re-open intake form" button was NOT visible after the modal was
  closed because Ticket 1 had transitioned to `ticket_status='completed'` —
  the resolution panel hides the fallback for completed tickets. Use Ticket 3
  (SO 99999000003, `ticket_status='approved'`, no `intake_forms` row) to
  exercise the fallback path on the Stage 3 landing.

Note: the `intake_forms` table does not exist in the dev DB at the time of
writing (db:push was paused per Tyler's directive), so the
`/api/submissions/:id/intake-form-status` endpoint reports "no intake form"
for every ticket and the fallback button visibility depends only on
`ticketStatus`. This matches the design intent: the modal can always be
re-opened from the resolution panel as long as the agent still owns the
ticket.


================================================================================
DEFERRED WORK — RUN BEFORE NEXT PROD DEPLOY (added 2026-04-26)
================================================================================

`npm run db:push` was paused per Tyler's directive during the additive-only
session. The following tables defined in `shared/schema.ts` do NOT yet exist
in the dev (or prod) database and MUST be created before deploying:

  * `intake_forms`              — backs the intake review/confirm flow
  * `agent_external_credentials` — backs Calculator saved-credentials flow

Impact while these tables are missing:
  * `/api/submissions/:id/intake-form-status` returns benign "no row" responses
    (the storage layer + dashboard tolerate this).
  * `/api/agent/credentials/calculator/reveal` throws on the SELECT and returns
    HTTP 500. The Calculator iframe component now catches this gracefully and
    falls back to the manual sign-in path (no red banner) — see
    `client/src/components/calculator-iframe.tsx`. Once the table exists this
    fallback becomes a true "no creds saved yet" empty state.
  * `/api/agent/credentials/calculator` (GET) likewise returns 500 until the
    table exists; the Settings dialog should also tolerate this.

Required step before next deploy:

    npm run db:push       # or: npm run db:push --force  if Drizzle prompts

Verification after push:

    psql "$DATABASE_URL" -c "\dt intake_forms"
    psql "$DATABASE_URL" -c "\dt agent_external_credentials"

Both should appear in the public schema. After that, the Calculator "Save
credentials" flow and the intake_forms persistence become fully functional in
addition to the already-working iframe + auto-open behaviour.

No data migration is required — both tables are new and start empty.

---

## Hotfix — Proc ID prefill verbatim passthrough (post-audit, 2026-04-26 PM)

```
fix(intake): pass submission.procId through to Smartsheet prefill verbatim

The hand-curated PROC_ID_LABEL table in server/services/smartsheet.ts only
enumerates ~23 of the ~80+ Smartsheet "Proc ID/Third Part ID" dropdown
options (verified live 2026-04-25). The previous prefill builder gated on
that table — any procId we hadn't manually labeled was silently omitted
from the prefill URL, leaving the required Smartsheet dropdown blank.

This bit every warranty family. Surfaced via AHSCLL: Snowflake's
CMB_THD_PTY_ID returns AHSCLL for AHS-family service orders, but AHSCLL
is not in our 23-entry subset, so every AHS ticket prefilled with that
field empty.

Fix: pass submission.procId through verbatim. Prefer the richer label
("AHS000-American Home Shield") when our table happens to know one;
otherwise fall through to the raw Snowflake-sourced value. Smartsheet's
own dropdown is the arbiter — values flowing through real service orders
are by definition options Smartsheet's data accepts.

PROC_ID_LABEL and lookupProcIdLabel are NOT removed — kept for branch-
routing nuance, future label enrichment, and existing call sites. The
gate is removed; the lookup stays.

Refs: post-build audit Critical finding C2.
```

Files:
- `server/services/smartsheet.ts` (modified — `procIdValue = procIdLabel ?? submission.procId`)
- `scripts/test-intake-url.ts` (modified — added `AHSCLL` passthrough case + `ZZZ999` verbatim case; removed obsolete "is omitted" assertion)

No schema changes. No db:push required. No client changes (the only client surface was
the warning strip in `intake-form-review-modal.tsx`, which still functions for the
remaining `Some Bogus Field` allow-list warnings).

---

## Hotfix — IH Tech Ent ID + VRS Tech ID source split (post-audit, 2026-04-26 PM)

```
fix(intake): split VRS Tech ID and IH Tech Ent ID sources

Smartsheet's "VRS Unrep Intake Form 2.0" has two LDAP-shaped columns
that we were collapsing onto one source:

  - "VRS Tech ID"      — should be the authenticated VRS agent's racId
                         (the agent calling on behalf of the field tech).
  - "IH Tech Ent ID"   — should be the field tech's LDAP id (the value
                         that used to drive "VRS Tech ID" alone).

This corrects the audit semantic so the intake row attributes the call
to the agent who placed it while still recording the field tech's
identifier on the row.

Implementation:
  - server/services/smartsheet.ts: add "IH Tech Ent ID" to the allow-list,
    add `authUserRacId?: string | null` to BuildIntakeFormUrlInput, split
    the always-visible defaults so VRS Tech ID = authUserRacId (uppercased)
    and IH Tech Ent ID = submission.technicianLdapId (uppercased). VRS Tech
    ID falls back to technicianLdapId when authUserRacId is missing so the
    column is never silently blank. Also added "racId" to the submission
    Pick for future readers/observability.
  - server/routes.ts: both intake routes (preview + confirm) do one extra
    storage.getUser(authReq.user!.id) call and pass the agent's racId
    through to the URL builder.
  - scripts/test-intake-url.ts: 3 new test blocks — split-source case,
    fallback case, and URL-encoding case for the new column.

No schema changes. No db:push. No client changes. Smartsheet form
definition is unmodified — we only changed what we prefill INTO it.

Refs: post-build audit follow-up (Tyler 2026-04-26 PM).
```

Files:
- `server/services/smartsheet.ts` (modified — `ALLOWED_COLUMN_LABELS` += "IH Tech Ent ID"; `BuildIntakeFormUrlInput` += `racId` Pick + `authUserRacId`; defaults split into `vrsTechId` / `ihTechEntId`)
- `server/routes.ts` (modified — both intake routes do `storage.getUser(authReq.user!.id)` and pass `authUserRacId`)
- `scripts/test-intake-url.ts` (modified — 3 new blocks: split-source, fallback, URL encoding)

Verification: `npx tsx scripts/test-intake-url.ts` all-green; live curl walk
of SO 99999000001 / 99999000002 / 99999000003 against the preview endpoint
as TESTADMIN confirms both columns populate correctly with the agent's
racId in VRS Tech ID and the field tech's LDAP in IH Tech Ent ID.

---

## Schema push 2026-04-27 — created intake_forms table; resolves audit finding C1; explicitly approved by Tyler this session.

**Operation:** `npx drizzle-kit push --force`

**Tables created (both were missing from dev DB; both already declared in `shared/schema.ts`):**
- `intake_forms` (7 cols, 2 FKs — `submission_id` ON DELETE CASCADE → submissions, `agent_id` → users)
- `agent_external_credentials` (11 cols, 1 unique constraint on `(user_id, service)`, 1 FK ON DELETE CASCADE → users) — declared by the TD3b calculator-credentials feature; also missing from dev DB drift; Tyler explicitly approved including it in this push since `db:push` has no per-table flag.

**Operations on existing tables:** none. Zero `ALTER`s to users / submissions / technicians / etc. Zero drops, renames, or column changes. Existing row counts unchanged (submissions=8, users=93).

**Verification:**
- Both tables present in `information_schema.tables` after push.
- POST `/api/submissions/77/intake-form/confirm` (SO 99999000005, AHSCLL, pre-claimed by VRS_MASTER, run as TESTADMIN) returned **200** with new `intake_forms.id=1` row containing the full prefilled Smartsheet URL. Previously this would have returned 500 "Failed to record intake form" because the table did not exist.
- Repeat POST returned **409 ALREADY_RECORDED** — idempotency guard works correctly against the now-existing table.

---

## Auto-close 2026-04-27 — intake form modal: probe build (Option B / interim)

**Scope authorized by Tyler this session.** Goal: remove the manual "I submitted Smartsheet" footer and have the modal auto-close once Smartsheet's post-submit thank-you screen renders. Hard constraints: additive only; no Smartsheet form definition changes; manual confirm path must remain functional during the probe; design for a clean swap to Option D when Todd Pennington enables the post-submit redirect URL.

**Approach (interim):** **Option B — iframe `onLoad` event counter.** Smartsheet does not natively emit `postMessage` on form submit, so the only in-browser cross-origin signal available is the iframe load event. Skip load #1 (initial form render); fire confirm on load #2 (post-submit thank-you navigation).

**Approach (planned permanent — pending Todd):** **Option D — Smartsheet post-submit redirect URL.** Smartsheet form thank-you redirects to a backend endpoint `/api/intake-forms/confirm-redirect?submissionId=<id>&token=<hmac>`. Server inserts the `intake_forms` audit row, then signals the iframe parent (postMessage from same-origin redirect page, or short poll on intake-form status). Bulletproof — eliminates the entire `onLoad` heuristic. Requires Todd to flip one Smartsheet form setting; Tyler is meeting Todd this afternoon.

**Architecture for clean swap:** the modal will expose a single `handleSmartsheetSuccess()` function. In Option B the trigger source is `iframe onLoad >= 2`. In Option D the trigger source becomes a `window.message` listener (or short poll on `/api/submissions/:id/intake-form/status`). Cutover = replacing the trigger wire-up; the success handler stays put.

**Step 1 (this commit) — probe build:**
- `client/src/components/intake-form-review-modal.tsx` (modified — add `useRef` import; add `loadCountRef`; reset on modal open/close; iframe `onLoad` handler logs `[INTAKE-PROBE]` events with `loadCount`, `timestamp`, `submissionId`, `branch`, `iframeSrc`, `note`).
- Manual footer (Cancel / "I submitted Smartsheet" / attestation checkbox) **fully retained and unchanged.** Probe logs ONLY — zero behavior change.
- Walk plan: Tyler opens SO 99999000005 (id=77, AHSCLL — pre-claimed by VRS_MASTER), opens the intake modal, fills + submits the Smartsheet form, observes browser console. Expected pattern: `loadCount: 1` on initial render, `loadCount: 2` after Smartsheet's Submit. Anything else = stop and report rather than ship the cutover.

**Step 2 (post-probe verification) — cutover (NOT in this commit):**
- Strip `[INTAKE-PROBE]` `console.log`.
- Wire `onLoad >= 2` to call `handleSmartsheetSuccess()` (latched via `confirmedRef` so it only fires once per modal open; treats 409 ALREADY_RECORDED as success).
- Remove DialogFooter entirely (Cancel button, "I submitted Smartsheet" button, attestation checkbox + label).
- Modal still dismissable via Esc / overlay click / dialog X.
- Audit row in `intake_forms` continues to be written — just no longer gated on a manual click.

**Risks documented to Tyler before proceeding:**
- Assumes Smartsheet's post-submit thank-you triggers a full iframe navigation. Probe verifies this assumption.
- If Smartsheet form is ever swapped to a multi-page variant, the "Next page" nav would false-fire auto-close. Current intake form is single-page.
- Form validation errors do NOT trigger nav (no false-fire there).

**No git commits. No schema changes. No Smartsheet form definition changes. No backend changes.**

---

## Auto-close 2026-04-27 — modal footer: Cancel button removed

**Scope authorized by Tyler this session.** Concern: an agent fat-fingering "Cancel" mid-walk would discard in-progress work (Smartsheet form filled inside the iframe but not yet submitted). Single-element removal — surgical, additive-safe, no behavior change to the success path.

**Edit:** `client/src/components/intake-form-review-modal.tsx` — removed the `<Button variant="outline" data-testid="button-intake-cancel">Cancel</Button>` element. Replaced with an inline comment documenting the rationale and the remaining dismissal vectors. The wrapping `<div className="flex items-center gap-2">` is retained (no layout shift).

**Retained — no changes to:**
- The "I submitted Smartsheet" button (`button-intake-confirm`) and its handler `onConfirm` — the manual confirm path remains the source of truth.
- The attestation checkbox (`checkbox-smartsheet-success-confirmed`) and its label.
- The "Open in new tab" link.
- The probe instrumentation (`[INTAKE-PROBE]` console.logs on iframe `onLoad`) — Tyler's walk verification of the `loadCount: 1 → 2` pattern is still pending.
- All Stage 2 cutover work (auto-close on `loadCount >= 2`, full footer removal) deferred until probe verifies the assumption.

**Modal dismissal — fallback paths (unchanged, all still functional):**
- Dialog's built-in close X (top-right of `DialogContent`).
- Esc key (Radix Dialog default).
- Overlay click (Radix Dialog default — clicking outside the modal).

**Risk surface:**
- Test ID `button-intake-cancel` no longer exists in the DOM. If any test or other component references it, those references will need updating. (Quick grep recommended before next deploy.)
- No test-id collisions, no shape changes, no API changes.

**No git commits. No schema changes. No Smartsheet form definition changes. No backend changes. No auto-close behavior added yet.**

---

## Layout 2026-04-27 — agent ticket resolution page: 50/50 column split

**Scope authorized by Tyler this session.** The right panel (Service Order History / Calculator tabs) was set to 40% width and the embedded Sears Repair/Replace Calculator sign-in form was visibly cramped. Goal: balanced two-column layout giving both panels equal horizontal space. Strictly additive — no fields, sections, or controls removed; just two width-token swaps.

**Edits — `client/src/pages/agent-dashboard.tsx`:**
- Line ~1503: `md:w-[60%]` → `md:w-1/2` on the left panel's `ScrollArea` (ticket details). Inline comment added explaining the rationale and confirming responsive/scroll behavior is preserved.
- Line ~3233: `w-[40%]` → `md:w-1/2` on the right panel's container `div` (test-id `panel-shsai`).

**Constraints honored:**
- (a) Additive only — no DOM removals, no field/section/control changes. Only two Tailwind width tokens swapped.
- (b) Internal scroll behavior preserved. Left panel still wraps its content in `<ScrollArea>`. Right panel's tab content (`Tabs > TabsContent` with internal `<ScrollArea>` for SHSAI; `<CalculatorIframe>` flex-1 for Calculator) is unchanged.
- (c) Responsive behavior preserved. Below the `md` breakpoint: left panel reverts to `w-full`, right panel is `hidden md:flex` so it disappears entirely — same stack/collapse behavior as before. The change only affects `md` and up.
- (d) **No touch** to the intake form modal, prefill logic, Smartsheet service, or the in-flight `[INTAKE-PROBE]` auto-close work. Single file edited, two lines changed.

**Test ID surface:** unchanged (`panel-shsai`, `tab-shsai`, `tab-calculator`, `button-show-shsai`, `button-hide-shsai`, `button-shsai-refresh` all intact).

**No git commits. No schema changes. No backend changes. No JS logic changes — pure Tailwind width swap.**

---

## Refactor 2026-04-27 — intake form: modal popup → third right-panel tab

**Scope authorized by Tyler this session.** The Smartsheet intake form was previously rendered inside `IntakeFormReviewModal` — a popup dialog that auto-opened 350ms after Authorize & Send. Per Tyler's new direction, the modal is retired and the form now lives as a third tab in the right-side panel of the ticket resolution page, sitting next to Service Order History (SHSAI) and Calculator.

### Four product calls Tyler made (recorded for posterity)

| # | Question | Decision |
|---|---|---|
| Q1 | Tab visibility | **CONDITIONAL + PRE-AUTH GHOST** — third tab always renders for predictable order; `disabled` until intake-form-status reports `required` or `recorded` |
| Q2 | Auto-tab-select behavior | **AUTO-SELECT ONCE, THEN RESPECT USER** — post-Authorize timer auto-switches once; manual tab clicks during the 350ms window cancel the pending switch; selection change re-arms |
| Q3 | Success-banner persistence | **PERSIST FROM SERVER** — banner reads `intake_forms.createdAt` via the per-submission status query, so it shows on every re-visit; tab choice falls back to last-used localStorage (no auto-default to Intake on re-visit) |
| Q4 | Plan doc cleanup | **MARK CANCELLED** — append "ON HOLD 2026-04-27" note in `docs/superpowers/plans/2026-04-25-calculator-and-intake-form.md` next to the redirect-URL section, preserving Todd Pennington's context |

### Files touched

| File | Change |
|---|---|
| `client/src/components/intake-form-tab.tsx` | **NEW** — replaces the modal. Three modes: pre-auth ghost empty state / required (iframe + attestation + button) / recorded (iframe + green banner above). Mirrors modal's preview load semantics, anti-feedback-loop guard on `onPreviewLoaded`, and confirm POST flow. |
| `client/src/components/intake-form-review-modal.tsx` | **DELETED** — retired. The Option B onLoad probe instrumentation died with it. |
| `client/src/pages/agent-dashboard.tsx` | Removed `IntakeFormReviewModal` import, `intakeModalOpen` state, the `<IntakeFormReviewModal>` element block (~40 lines), and the "Re-open intake form" button + wrapping flex div (~25 lines). Added `IntakeFormTab` import, extended `RightPanelView` union with `"intake"`, widened the localStorage allowlist, added `pendingIntakeAutoFireRef` + `handleRightPanelViewChange` for the Q2 cancellable auto-fire, added the third `<TabsTrigger value="intake" disabled={...}>` and `<TabsContent value="intake">`, and replaced the post-Authorize `setIntakeModalOpen(true)` call with `setShsaiVisible(true) + setRightPanelView("intake")` (gated by the pending-fire flag). |
| `docs/superpowers/plans/2026-04-25-calculator-and-intake-form.md` | Appended ON HOLD note next to the Smartsheet thank-you redirect section (line 215) so Todd Pennington's context isn't lost. |

### Auto-close probe / Option B — CANCELLED

The interim Option B work (iframe `onLoad` counter logging `[INTAKE-PROBE]` to console, intended to detect Smartsheet's post-submit thank-you nav and auto-fire `handleSmartsheetSuccess()`) is N/A — there is no modal to close. The probe instrumentation was deleted along with `intake-form-review-modal.tsx`. The session-level evidence (one `loadCount: 1` capture from SO 99999000004, no `loadCount: 2` ever observed) is now historical-only; future redirect-URL work (formerly Option D, see plan doc note) is paused pending Todd Pennington and a separate UX decision about whether to keep the attestation checkbox as belt-and-suspenders.

### Constraints honored

- **Additive on the data layer.** No schema changes. The `intake_forms` table, `agent_external_credentials` table, and all server endpoints (`/api/submissions/:id/intake-form-status`, `/preview`, `/confirm`) are byte-identical to before. `buildIntakeFormUrl` and the prefill logic are untouched.
- **No deletions of existing functionality.** The intake form itself, prefill logic, attestation checkbox, "I submitted Smartsheet" button, and confirm endpoint all stay — they just live in a tab now instead of a modal. The IntakeFormFieldset card on the resolution panel stays as the working-payload editor; only its trailing "Re-open intake form" button was removed (modal it pointed at no longer exists).
- **Cancel button** stays removed (already done in the prior modal-era session — no change here).
- **Responsive collapse preserved.** The right panel still uses `hidden md:flex md:w-1/2`; below the md breakpoint the right panel disappears and the intake tab disappears with it. Same as today's behavior for SHSAI / Calculator.
- **Smartsheet form definition** untouched. `aa5f07c589b64ae993f5f75e20f71d5f` is unchanged.

### Test ID surface

**Removed** (modal-only): `dialog-intake-review`, `text-intake-modal-title`, `button-intake-cancel` (already gone), `button-open-intake-review`.

**Preserved (now in tab instead of modal)**: `iframe-intake-smartsheet`, `checkbox-smartsheet-success-confirmed`, `label-smartsheet-success-confirmed`, `container-intake-confirm-attestation`, `link-intake-open-new-tab`, `button-intake-confirm`, `loading-intake-preview`, `error-intake-preview`, `warnings-intake-preview`.

**New**: `tab-intake`, `panel-intake-tab`, `intake-tab-empty-state`, `banner-intake-recorded`, `text-intake-recorded`.

### Risk surface

- Tests / scripts referencing `IntakeFormReviewModal`, `dialog-intake-review`, `button-open-intake-review`, or `intakeModalOpen` will fail. (Recommend a quick grep before next deploy.)
- The new tab calls `/intake-form/preview` whenever `payload` changes (same as the modal did when open). Because the tab's `forceMount` keeps it alive across tab switches, the preview refetches even when the tab isn't visible — bandwidth is identical to the modal era (modal also polled while open). If this becomes a perf concern, add a `tab === 'intake'` gate to the preview useEffect.
- `pendingIntakeAutoFireRef` correctness depends on `handleRightPanelViewChange` being the ONLY caller for tab changes from the user. Direct `setRightPanelView(...)` calls inside other components or future code would bypass the cancellation. (Currently zero such direct callers exist outside this file.)

**No git commits. No schema changes. No backend changes. No Smartsheet form definition changes.**

---

## Requirement change 2026-04-28 — intake form tab: ALWAYS-ON (overrides Q1 pre-auth ghost)

**Scope authorized by Tyler this session.** Tyler's new direction OVERRIDES the prior Q1 = CONDITIONAL + PRE-AUTH GHOST decision documented above. The Intake Form tab must be active and clickable from the moment an agent opens a ticket — not after Authorize, not after an auth code is issued. Same enabled state as Service Order History and Calculator. The Smartsheet iframe loads immediately on ticket open with whatever prefill values are available; pre-auth fields (auth code, etc.) are simply absent from the prefill payload but the form still loads and is usable for everything else.

### Files touched

| File | Change |
|---|---|
| `client/src/pages/agent-dashboard.tsx` | Removed the `disabled={!stage3Required && !stage3Recorded}` prop from the `<TabsTrigger value="intake">` element (line ~3358 area). Replaced the prior Q1 comment block with a new comment documenting Tyler's 2026-04-28 override. The `stage3Required` / `stage3Recorded` derived values themselves are RETAINED — they still drive the legacy Stage 3 fieldset card (lines 2496/2545/2573) which is unaffected by this change. |
| `client/src/components/intake-form-tab.tsx` | (a) Removed the `if (!required && !recorded) return;` early-exit gate from the preview-loading useEffect so the POST `/api/submissions/:id/intake-form/preview` call always fires for any non-NLA ticket, regardless of authorize state. (b) Removed the entire empty-state branch that rendered `<intake-tab-empty-state>` with the "Authorize the ticket first" copy; the component now always renders the iframe + footer (or the loading/error states). (c) Dropped the now-unused `ClipboardList` lucide-react import. |

### Server-side — UNCHANGED

- `POST /api/submissions/:id/intake-form/preview` — already had no auth-status gating; just builds the URL from current submission + payload via `buildIntakeFormUrl`. No change required.
- `POST /api/submissions/:id/intake-form/confirm` — already only blocks on existing intake_forms row. Pre-Authorize confirm is now allowed by the UI; server already accepted it.
- `GET /api/submissions/:id/intake-form-status` — UNCHANGED. Still returns `required:false, reason:"no_auth_code"` pre-Authorize. The UI no longer uses `required` to gate the iframe; it only uses `recorded` (and the resulting `recordedAt`) to drive the green success banner above the iframe.

### Test ID surface

**Removed**: `intake-tab-empty-state` (the old gated empty state — no longer rendered for any ticket state).

**Preserved**: `tab-intake`, `panel-intake-tab`, `iframe-intake-smartsheet`, `checkbox-smartsheet-success-confirmed`, `button-intake-confirm`, `loading-intake-preview`, `error-intake-preview`, `warnings-intake-preview`, `banner-intake-recorded`, `text-intake-recorded`, `link-intake-open-new-tab`.

### Verification

E2E test against ticket 80 (SO 99999000007, ticket_status=pending, stage1=approved, stage2=pending, no auth_code, request_type=authorization) confirmed:
- `tab-intake` rendered with `disabled=null` and `aria-disabled=null` pre-Authorize (active Radix tab trigger).
- Clicking the tab immediately rendered `iframe-intake-smartsheet` with src beginning `https://app.smartsheet.com/b/form/aa5f07c589b64ae993f5f75e20f71d5f?...` (prefill params present).
- `intake-tab-empty-state` was NOT in the DOM (old empty state confirmed gone).
- `checkbox-smartsheet-success-confirmed` and `button-intake-confirm` rendered alongside the iframe (footer attestation+submit available pre-Authorize).
- `GET /api/submissions/80/intake-form-status` returned `{required:false, recorded:false, reason:"no_auth_code"}` — the server-side gating is unchanged and still informational; the UI no longer uses it to gate the iframe.
- Tab-switch round-trip (Intake → SHSAI → Intake) preserved iframe state (no flash of loading or empty state).

### Constraints honored

- **Additive only on the data layer.** No schema changes. No new endpoints. No changes to `intake_forms`, `agent_external_credentials`, or any storage interface.
- **Smartsheet form definition untouched.** Form id `aa5f07c589b64ae993f5f75e20f71d5f` and prefill column names unchanged.
- **No regressions to in-flight bug fix work.** The earlier 2026-04-28 fixes in this session — (a) `intake-form-status` accepting `ticketStatus="completed"` in addition to `"approved"` (server/routes.ts line ~3526), and (b) the `selectedSubmissionSnapshotRef` fallback in agent-dashboard.tsx (lines ~617-622) preventing the right panel from unmounting during the post-Authorize submissions refetch window — REMAIN in place. Both still drive correct behavior in the post-Authorize path even though the new always-on tab no longer depends on the `required` flag.
- **No git commits. No schema changes. No backend changes. No Smartsheet form definition changes.**

### Risk surface

- The preview POST now fires on every ticket open (previously only fired when intake was `required` or `recorded`). Bandwidth impact: one additional POST per ticket open for tickets that aren't yet at the post-Authorize stage. The endpoint is fast (single submission lookup + URL build) and the response is small (~1KB). Monitor server load if many agents open many fresh tickets in rapid succession; if it becomes a concern, consider response caching keyed on `(submissionId, payload-hash)`.
- Pre-Authorize `confirm` POSTs are now possible from the UI. The server allows them (no auth-status gating in the confirm handler). If product later wants to BLOCK pre-Authorize confirms, that gate would need to be added server-side, NOT client-side (client-side gates would need to be re-added too). For now, by Tyler's 2026-04-28 directive, this is intentional.
- The `stage3Required` / `stage3Recorded` derived values in agent-dashboard.tsx still gate the legacy Stage 3 fieldset card (lines 2496/2545/2573). That card is now redundant with the always-on Intake Form tab. Not removed in this change (additive-only constraint), but a future cleanup should consider deleting the fieldset card entirely. Flagged for Tyler's review.

**No git commits. No schema changes. No backend changes. No Smartsheet form definition changes.**


## 2026-04-28 — Intake form CONFIRM endpoint diagnostics + vitest+supertest regression harness

Tyler reported that after the always-on Intake Form tab shipped, clicking "I submitted Smartsheet" inside the iframe surfaced a red toast in the bottom-right:

> **Could not record intake** — Failed to record intake form

The toast description ("Failed to record intake form") is the verbatim `error` string returned by `POST /api/submissions/:id/intake-form/confirm` from its 500-level catch branch. Tyler had previously verified Fix A (`intake-form-status` route accepting both `approved` and `completed`) and Fix B (`selectedSubmissionSnapshotRef` panel-unmount fallback in agent-dashboard.tsx) and explicitly noted those did NOT solve this failure — the POST itself was 500-ing on the server.

The original handler at `server/routes.ts:3603-3676` had a single catch-all that emitted only `"Intake form confirm error: <stack>"` with no breadcrumb of WHICH step (parse → ownership → existing-check → ih-unit lookup → racId lookup → URL builder → DB insert) actually blew up. Without that breadcrumb every production failure looked identical and was un-fixable.

### Files touched (additive only — zero schema changes, zero Smartsheet form changes, zero modifications to the preview endpoint)

| File | Change |
|------|--------|
| `server/routes.ts` (3606-3733, was 3603-3676) | Replaced the single try/catch with a per-step structured-log instrumentation. Every branch now emits `[intake-confirm reqId=<id> userId=<id> subId=<id> op=<step>] status=<state> ...` so a grep of the workflow log instantly tells us where the failure landed. The `op` codes are: `parse-id`, `zod-parse`, `ownership`, `existing-check`, `ih-unit-lookup`, `racid-lookup`, `build-url`, `db-insert`, `ok`, `unhandled`. The 500 response now also returns a `code` discriminator (`BUILD_URL_ERROR` / `DB_INSERT_ERROR` / `UNHANDLED`) so the toast can eventually surface a more specific cause without leaking server internals. |
| `server/routes.ts` (ih-unit-lookup branch) | Wrapped the previously-unguarded `getTechnicianByLdapId` call in its own try/catch. A flake on this lookup used to bubble up to the catch-all 500 with no breadcrumb; now it logs `op=ih-unit-lookup status=warn` and degrades gracefully (the `IH Unit Number` field becomes blank in the recorded URL but the `intake_forms` row still saves). |
| `server/routes.ts` (db-insert branch) | Wrapped `storage.createIntakeForm` in its own try/catch. Emits the full pg error: `code=<sqlstate> detail=<detail> constraint=<name> msg=<message>`. This is the most likely root-cause vector for the production failure (FK violation, JSONB type mismatch, etc) and was previously invisible. |
| `tests/intake-confirm.test.ts` (new, 195 lines) | vitest+supertest harness with three tests: (1) SO 99999000006 SPHW post-Authorize confirm succeeds, (2) SO 99999000007 AHS PRE-Authorize confirm succeeds (proves the always-on tab requirement — confirm works without auth_code), (3) duplicate confirm returns 409 ALREADY_RECORDED, NOT a 500 with "Failed to record intake form" (locks in the bug class against regression). All three exercise the LIVE running dev server on `localhost:5000` so the same Express stack, same DB connection, and same seeded test fixtures (SO 99999000006/99999000007) are hit as the live UI. |
| `vitest.config.ts` (new, 24 lines) | Vitest configuration: forks pool, 30s timeout, `@shared` alias for shared/schema imports. |
| `package.json` (auto) | Added `vitest`, `supertest`, `@types/supertest` as dev deps via the package management tool. |

### Run the harness

```
npx vitest run tests/intake-confirm.test.ts
```

### Verified PASSING (2026-04-28 04:35 UTC)

```
 RUN  v4.1.5 /home/runner/workspace
 ✓ tests/intake-confirm.test.ts (3 tests) 217ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  1.32s
```

Sample structured log emitted during a successful confirm (visible in workflow log under "Start application"):

```
[intake-confirm reqId=intake-confirm:1777350912362:u146nl userId=86 subId=79 op=ok] status=success intakeFormId=7 branch=SPHW
[intake-confirm reqId=intake-confirm:1777350912470:7qv5uz userId=86 subId=79 op=existing-check] status=duplicate existingId=9 agentId=86
```

### Why the harness alone does not "fix" Tyler's reported failure

The harness exercises the endpoint with the same payload shape the live UI sends (`previewBody.derivedDefaults` as `payload`, `previewBody.url` as `smartsheetUrlSubmitted`) and CANNOT reproduce the 500 against the seeded fixtures. That means one of two things is true:

1. Tyler's production failure is hitting an edge case the seeded fixtures do not cover (a real ticket with `technician_ldap_id` pointing at a missing technicians row, a real submission row whose `procId` triggers a code path my fixtures avoid, a JSONB payload key with a value type the schema rejects, an upstream Snowflake-sourced character that breaks `encodeURIComponent`, etc).
2. Fix A + Fix B already silently fixed the underlying cause and Tyler's most recent test was against a stale browser/session.

Either way, the structured logs above are now the diagnostic. The next time Tyler clicks "I submitted Smartsheet" and sees the red toast, the workflow log will contain a single line of the form `[intake-confirm reqId=... op=<step>] status=fail err=<reason>` pointing at the exact failing step. That line is what we will fix.

### Hard-rule compliance

- No commits to version control.
- No schema changes (intake_forms unchanged; no new columns; no new constraints).
- No Smartsheet form definition changes.
- Server data layer additive only (the new try/catch wrappers preserve every existing success path; the new tests do not mutate any seeded fixture beyond the intake_forms cleanup they own).
- COMMITS.md appended only after the harness passed (3/3 verified in two consecutive runs).

**No version-control commits. No schema changes. No Smartsheet form definition changes.**


---

## 2026-04-28 — Tyler "Two things" (A: keep-ticket-open after Approve/Reject + B: fixture broadening for Failed-to-record bug)

### Context
Tyler sent two requirements simultaneously:
- **A.** "The ticket review screen must NOT clear after Approve or Reject. After either outcome, the agent stays on the same ticket with all ticket details visible, the Intake Form tab active, and the Smartsheet iframe loaded. The intake form is filled out next to the submitted ticket info. ONLY when the user clicks I submitted Smartsheet does the screen close out and return the user to the queue / next ticket."
- **B.** "Do NOT ask Tyler to click anything. Broaden the test fixtures yourself to reproduce in code... vary technician_ldap_id, vary previewBody.url shapes, vary the JSONB payload key set... If still no repro, change the structured log to fire on EVERY confirm attempt (not just failures) and dump the full payload."

### Part A — keep-ticket-open after Approve/Reject

**File: `client/src/pages/agent-dashboard.tsx`**

1. **`processMutation.onSuccess` (lines 777-840):**
   - Renamed `justAuthorized` → `justResolved`.
   - Extended the `keepSelected` predicate so EITHER `selectedAction === "approve"` OR `selectedAction === "reject"` (on non-NLA tickets) preserves `selectedId` and triggers the auto-tab-switch to Intake Form.
   - Scope is intentionally limited: `reject_and_close` (permanent closure) and `invalid` (bogus ticket marker) still clear selection because no Smartsheet intake is appropriate. `approve_submission` (Stage 1 mid-flow on 2-stage warranties) still uses keepSelected but does NOT auto-switch tabs (agent is still mid-flow and hasn't issued the auth code yet).
   - Captures the fresh `{ submission: updated }` server response into `selectedSubmissionSnapshotRef.current` so the post-action snapshot reflects `ticketStatus="completed"` / `"rejected"` instead of the pre-action `"pending"`. This hides the action button stripe immediately after the action; otherwise the persisted detail pane would still show Approve/Reject buttons on a just-resolved ticket.

2. **Snapshot architecture (lines 595-641):**
   - Renamed line 592 `selectedSubmission` → `selectedSubmissionFromQuery` (the raw query lookup).
   - Made `selectedSubmission` an alias for `selectedSubmissionFromQuery ?? selectedSubmissionSnapshotRef.current` — i.e. the snapshot-falling-back value is now the PUBLIC name, so all 127+ JSX read sites (`selectedSubmission.foo`) automatically pick up the snapshot fallback when the My Tickets refetch (filtered to `ticketStatus="pending"`) evicts the just-resolved row.
   - Result: BOTH the left-side detail pane gate (line 1578) AND the right-side 3-tab panel survive the eviction, satisfying Tyler's "stay on the same ticket" requirement end-to-end.
   - `effectiveSelectedSubmission` retained as a backward-compat alias.
   - List-level UI iterates the `submissions` array directly (not `selectedSubmission`), so the row still correctly disappears from My Tickets and reappears in Completed — the snapshot fallback is scoped to the detail pane only.

3. **`IntakeFormTab.onConfirmed` callback (lines 3596-3614):**
   - Added `setSelectedId(null)` and `setLocalAgentStatus("online")` so the close-out fires HERE (when the agent confirms Smartsheet submission) instead of in `processMutation.onSuccess`.
   - The screen now ONLY clears when the agent clicks "I submitted Smartsheet", returning them to the queue / next ticket. This is the exact UX Tyler specified.

**Architect-review fix included:** the architect flagged that `effectiveSelectedSubmission` existed but only the right-panel mount gate used it — the left-side detail pane still gated on the raw `selectedSubmission`, so the screen would have STILL gone blank post-action. The rename described above closes that gap with zero-touch on the 127 JSX call sites.

### Part B — diagnostics + fixture broadening for "Failed to record intake form"

**File: `server/routes.ts` (lines 3625-3641)**

Added an `op=entry` log line that fires on EVERY confirm attempt (not just failures) and dumps the full `req.body` JSON (capped at 4000 chars to bound log volume) plus the user-agent string. This is the byte-for-byte payload-replay capability Tyler asked for — any future production red-toast can be reproduced in vitest by copy-pasting the entry-log body into a new test fixture. Auth tokens live in the Authorization header (not the body) so this does NOT leak credentials. The intake_forms.payload column already stores this same data as the permanent audit trail.

Privacy note (architect flagged): payload values can include free-text technician comments. If retention/access policy on the workflow logs becomes a concern, gate this log behind an env flag (e.g. `INTAKE_DEBUG_LOG=full`) and default to redacted (keys + size + body hash). Not gated yet because Tyler's instruction was explicit: "dump the full payload."

**File: `tests/intake-confirm.test.ts` (3 → 17 tests)**

Original 3 core regression tests retained. Added 14 new edge-case fixture tests probing every plausible failure-mode branch in the handler. None reproduced a 500 with "Failed to record intake form":

- **E1** Bogus `technician_ldap_id` (no row in technicians table) — degrades gracefully via the wrapped ih-unit-lookup branch; 200 with blank `IH%20Unit%20Number=` in the URL. Mutation/restore via `setTech()` on submission 79.
- **E2** Malformed `smartsheetUrlSubmitted` (not a URL) — 400 zod-parse, never 500.
- **E3** Numeric payload values (`z.union([z.string(), z.number()])` accepts both) — 200; numeric value round-trips through JSONB.
- **E4** Payload keys NOT on `ALLOWED_COLUMN_LABELS` — 200; bogus keys are silently dropped from the URL but stored verbatim in the JSONB audit blob.
- **E5** Missing `smartsheetUrlSubmitted` — 200; falls back to server-built URL.
- **E6** Non-numeric submission ID — 400 parse-id, never 500.
- **E7** Non-existent submission ID — 404 ownership, never 500.
- **E8** Disallowed payload value type (object) — 400 zod-parse, never 500.
- **E9** Unicode + emoji + accented characters in payload values — 200; UTF-8 round-trips intact.
- **E10** Very large payload value (10KB string) — 200; Postgres JSONB has no practical max for this size.
- **E11** Empty body `{}` — 200; payload defaults to `{}`, server-built URL is used.
- **E12** Concurrent duplicate confirms (Promise.all) — exactly one 200 + one 409 (or both 200 if the race-window is wider than the existing-check); never 500. The schema has no unique constraint backing the existing-check, so the test asserts only the no-500 invariant rather than the exact split.
- **E13** Payload keys with dots/slashes/brackets in their names — 200; non-allow-list keys stored verbatim in JSONB.
- **E14** TOCTOU race coverage (architect-recommended): submission ID for a non-existent row — 404 short-circuits the FK race window via the ownership check. Documents the contract; any future refactor that drops the ownership check would flip this assertion to 500 and surface the regression.

`beforeAll` snapshots the `technician_ldap_id` for both seed tickets (79 SPHW, 80 AHS) so any fixture mutation done by E1 can be reverted in `afterAll` — the dev DB looks exactly the way the seed left it after the suite runs.

### Test results

```
Test Files  1 passed (1)
     Tests  17 passed (17)
  Duration  1.59s
```

Two consecutive clean runs. Every test asserts the no-500 invariant explicitly. The new entry log was verified firing in the workflow log: `[intake-confirm reqId=intake-confirm:... op=entry] body={"payload":{...},"smartsheetUrlSubmitted":"..."} ua=...`

### Current bug status

Still NOT reproduced in vitest. The handler is robust against every payload shape and edge case I can enumerate. If the bug fires again in production, the new entry log will show the exact request body that triggered it, and a new fixture replaying that body byte-for-byte can be added to the suite in minutes.

### Tyler's hard rules — observed

- No version-control commits.
- No schema changes (no DDL, no new columns, no new tables).
- No Smartsheet form definition changes.
- Server data layer additive only (the entry log is pure side-effect; the test fixture broadening adds NO permanent rows beyond the intake_forms cleanup the suite owns; the E1 fixture mutation on technicians_ldap_id is reverted in afterAll).
- Frontend changes additive: extended a predicate, renamed a query-result variable, added a snapshot refresh in mutation onSuccess, added two state-clearing calls in IntakeFormTab.onConfirmed. No deletions, no behavioral changes outside the documented requirement.
- COMMITS.md appended only after harness passed (17/17 verified twice).

**No version-control commits. No schema changes. No Smartsheet form definition changes.**


---

## 2026-04-28 — Tyler clarification: uniform close-out across all reject variants

### Context
Tyler answered my Reject-scope clarification: "All three reject-shaped actions (reject, reject_and_close, mark_invalid) should keep the ticket open and load intake. Tyler said whatever the outcome — uniform close-out flow. Agent fills the intake form for every outcome, clicks I submitted Smartsheet, screen returns to queue. No special-case branching by reject variant."

### Change
**File: `client/src/pages/agent-dashboard.tsx` (lines 800-830)**

Extended the `justResolved` predicate from `(approve | reject)` to ALL terminal outcomes: `approve | reject | reject_and_close | invalid`. The matching `keepSelected` and auto-tab-switch behavior now fires uniformly. (The codebase action-type union spells the third reject variant as `"invalid"`, not `"mark_invalid"` — the action label string is "Marked Invalid" but the discriminator value is `"invalid"`. Using the discriminator value here.)

The only exception remains `approve_submission` (Stage 1 mid-flow on 2-stage warranties) — keepSelected stays true so the agent doesn't lose the ticket while issuing the auth code, but no auto-tab-switch fires because the Intake Form tab isn't relevant until after the FINAL Approve / Reject / Close / Invalid decision.

Comment block updated to document the uniform-close-out contract explicitly so future readers don't reintroduce per-variant branching.

### Test results
```
Test Files  1 passed (1)
     Tests  17 passed (17)
  Duration  1.54s
```

All 17 tests still pass. Server-side route is unchanged (no test surface affected).

### Tyler's hard rules — observed
- No version-control commits.
- No schema changes.
- No Smartsheet form definition changes.
- Frontend additive: predicate extension + comment update only.
- COMMITS.md appended only after harness re-passed (17/17).

**No version-control commits. No schema changes. No Smartsheet form definition changes.**


---

## 2026-04-28 — Tyler URGENT pilot-feedback hotfix (Tier 1 + Tier 2: cross-tech draft contamination)

### Context
Multiple techs blocked from submitting after a prior tech NLA-completed (`part_found_vrs_ordered`) the same SO days earlier. Confirmed victims: David Wiggins on SO 7435-13629175, the bgambre-pattern tech on SO 8206-13641761. Server-side `users` and `technicians` tables verified clean — no `rac_id` duplicates, no LDAP collisions. The contamination vector is on the client: `tech-submit.tsx` was persisting an in-progress draft to `localStorage[vrs_tech_submit_draft_v1_<userId>]` without stamping it with the saving tech's identity, and `auth.tsx` `logout()` wasn't clearing the draft on session teardown. When two techs ended up sharing client storage (mechanism still under investigation; Tyler ruled out the district-pool theory), tech B would auto-hydrate tech A's draft on their next form mount and submit under their own JWT — but using A's photos/text/SO, producing the 409 "already submitted" red toast on the affected service order.

Tyler greenlit Tier 1 (client-side identity stamp + blocking Resume/Start-fresh dialog + cross-key sweep on logout) AND Tier 2 (server-side log-only diagnostic in POST /api/submissions to surface JWT.id vs users.id-by-ldapId mismatches in prod). Tier 3 (server-side rejection on mismatch) explicitly NOT in scope.

### Tier 1 — client-side defenses

**File: `client/src/lib/draft-identity.ts` (new, ~95 lines)**
- Pure helper module so the validation is unit-testable in isolation, independent of React state.
- `parseAndValidateDraft(raw, currentUser)` returns `{ ok: true, draft }` or `{ ok: false, reason }` where reason ∈ `no_draft | parse_error | missing_identity | id_mismatch | ldap_mismatch`. Identity match requires both `userId === current.id` AND (when current ldap is non-null) `ldapId === current.ldapId`. Legacy drafts (no identity stamp) are rejected as `missing_identity`.
- `stampDraftIdentity(body, currentUser)` wraps the persisted body with `identity: { userId, ldapId }`.
- `clearAllTechSubmitDrafts(storage)` enumerates and removes every `vrs_tech_submit_draft_v1_*` key, returning the count. Used by `logout()` as a belt-and-suspenders sweep so even if a draft slipped past identity validation, it can't survive the next session boundary.

**File: `client/src/pages/tech-submit.tsx`**
- Save effect now wraps every persisted draft via `stampDraftIdentity({...}, { id: user.id, ldapId: user.racId ?? user.ldapId })`. (Note: `/api/auth/me` returns the LDAP under both `racId` and `ldapId` keys for tech users — using `(user as any).ldapId ?? user.racId` so either source resolves correctly.)
- Load effect now calls `parseAndValidateDraft` instead of doing inline JSON.parse + auto-hydrate. Anything other than a clean identity match (including pre-hotfix legacy drafts) is treated as not-mine: localStorage key is evicted and a `console.warn` records the reason for browser-log forensics.
- Auto-hydrate REMOVED. A passing-validation draft is held in new `pendingDraft` state and rendered into a blocking AlertDialog with two buttons: **Resume draft** / **Start fresh**. Until the tech picks one, the autosave effect is gated off via the new `draftDecisionMadeRef` so an in-flight form change can't overwrite the prior draft mid-decision.
- Existing `draftRestored` banner + "Start fresh" button preserved for the post-resume state — same UX as before once the user has explicitly resumed.

**File: `client/src/lib/auth.tsx`**
- `logout()` now imports `clearAllTechSubmitDrafts(localStorage)` and runs it before removing the JWT. This is the additional defense layer for the case where the inheritance vector is somehow upstream of `localStorage`-keying-by-user-id (e.g. a service worker pre-caching the page state).

### Tier 2 — server-side diagnostic

**File: `server/storage.ts`**
- Added `getTechUserByLdapId(ldapId): Promise<User | undefined>` to `IStorage` and `DatabaseStorage`. Lookup-only counterpart to the existing `getOrCreateTechUser` — returns the `users` row whose `racId` matches the given ldap, or undefined. Pure additive method, no schema changes.

**File: `server/routes.ts`**
- `POST /api/submissions` now performs an identity-mismatch check after `getUser(authReq.user.id)`. If `getTechUserByLdapId(authReq.user.ldapId)` returns a row whose `id` differs from the JWT-bound `id`, a `[identity-mismatch]` warning is logged with both ids, the ldap, and the submission SO. Behavior is unchanged — pure log-only diagnostic. When the bug fires again in prod, this log line tells us exactly whose JWT was used to submit on whose behalf, surfacing the inheritance mechanism we've been missing.

### Tests

**File: `tests/draft-identity.test.ts` (new, 13 unit tests)**
- Covers every validation reason (no_draft, parse_error, missing_identity for legacy drafts AND non-numeric userId, id_mismatch by name in the Hector→David scenario, ldap_mismatch, ok-on-match).
- Covers the null-ldap admin/agent edge case (legacy users without an LDAP can't be locked out by the ldap check).
- Covers `stampDraftIdentity` round-trip with both tech and null-ldap users.
- Covers `clearAllTechSubmitDrafts` selectivity: only `vrs_tech_submit_draft_v1_*` keys are removed, `vrs_token` and unrelated keys are preserved; correct count returned; zero-draft case handled.

### Test results

```
Test Files  2 passed (2)
     Tests  30 passed (30)
  Duration  2.09s
```

13 new draft-identity tests + 17 existing intake-confirm tests, all green. No regression in the intake-confirm suite — the new Tier 2 logger does not interfere with normal submission flow (the existing route handler path is unchanged for the matching-identity case, which is every existing test fixture). Workflow restarted clean on :5000 between edits.

### Tyler's hard rules — observed
- No version-control commits.
- No schema changes (additive storage method only; zero DDL).
- No Smartsheet form definition changes.
- No republish (Tyler will handle).
- COMMITS.md appended only after harness re-passed (30/30 verified).

**No version-control commits. No schema changes. No Smartsheet form definition changes. No republish.**


---

## 2026-04-28 — Tyler pilot-feedback Task A: NLA SMS copy stopgap

### Context
Pilot techs reported confusion on NLA (Parts Not Available) tickets: they were standing by at the customer's home for hours waiting for a sourcing decision because the existing SMS copy told them turnaround was "1–2 business days" AND a follow-up "claim" SMS told them "DO NOT LEAVE THE SITE." Tyler's correction: real-world NLA sourcing turnaround is **same-day**, and the right behavior is for the tech to reschedule the call for later that day and move on to their next stop — they get texted with the sourcing decision when it lands. This is a stopgap; the real fix is the Communication Settings module (Task B, in progress).

### Scope
Two server-side files. Copy + one routing condition. NO frontend, NO schema, NO Smartsheet form, NO new endpoints. NLA-only — non-NLA flows are byte-for-byte unchanged.

### Changes

**File: `server/sms.ts` (NLA branch of `buildSubmissionReceivedMessage`, "message 1")**

Stripped the "typical turnaround is 1–2 business days" wait copy. New NLA wait copy:

> "NLA submission received by the VRS parts team. Typical turnaround is same-day. Reschedule this call for later today and move on to your next stop — you'll receive a follow-up text with the sourcing decision."

The full assembled SMS still wraps with `VRS Submission received for SO#${serviceOrder}` on top and `You will receive a follow-up text when the decision is made.` on the bottom (those wrappers are channel-agnostic and weren't in scope). Comment block in code identifies this as a Tyler Task A stopgap and points future readers at the Communication Settings module as the real fix, so it doesn't drift into "permanent" status by accident.

**File: `server/routes.ts` (claim handler in `POST /api/submissions/:id/claim`, "message 2")**

Added `const isNla = submission.requestType === "parts_nla";` and wrapped the entire claim-SMS construction + `sendSms(...)` call in `if (!isNla) { ... }`. For NLA tickets, the claim SMS — which contains "Stand by for confirmation" + "DO NOT LEAVE THE SITE" — is now suppressed entirely. Rationale: the new message 1 already tells the NLA tech to reschedule and move on; sending message 2 minutes later that contradicts that ("stand by, do not leave") was a primary source of the pilot confusion. NLA flows still receive `buildNlaApprovalMessage` later when the parts team has a sourcing decision, so no notification is dropped — only the misleading interim "claim" SMS.

Two-stage AHS / First American claim SMS: untouched.
Standard non-NLA claim SMS: untouched.
Resubmission claim SMS (routes.ts:700): out of scope for Task A — that's the resubmit path, not the initial-claim path. Easy to extend if Tyler scopes it later.

### Decisions baked in (Tyler approved all 5)
1. Message 2 killed entirely for NLA, not patched.
2. NLA detection uses `submission.requestType === "parts_nla"` (matches every other NLA-branching call site in the codebase).
3. In-code comment block tags both edits as Task A stopgap pointing at Task B.
4. Resubmit-claim SMS at routes.ts:700 left alone (out of scope).
5. No frontend / no schema / no Smartsheet-form changes.

### Test results
```
Test Files  2 passed (2)
     Tests  30 passed (30)
  Duration  2.59s
```

13 draft-identity tests + 17 intake-confirm tests, all green. The SMS module has no unit-test surface in the existing suite — `buildSubmissionReceivedMessage` is a pure-string-builder and the claim-handler change is a routing condition, both verifiable by inspection. Workflow restarted clean on :5000 between edits, browser console clean.

### Tyler's hard rules — observed
- No version-control commits.
- No schema changes.
- No Smartsheet form definition changes.
- No republish (Tyler will handle).
- COMMITS.md appended only after harness re-passed (30/30).

**No version-control commits. No schema changes. No Smartsheet form definition changes. No republish.**


---

## 2026-04-28 — Tyler Phase A approval: test-ticket seed expansion

### Context
Tyler needs end-to-end test coverage on the intake-form flow before Task B Phase C ships. Existing `scripts/seed-test-tickets.ts` covered 3 of the 5 states he wants (fresh queued × 2 + pre-approved). Added the 2 missing states (pending NLA + rejected/resubmittable) so the full intake flow can be exercised against deterministic SOs that don't touch prod data.

### Scope
Pure additive on the test-data layer. NO schema change. NO production-row touch. Test SO range `99999000001-99999000005`, all flagged with `[TEST]` in `issue_description` for easy grep + cleanup. Extension of an existing test script — no new scripts created.

### Changes

**File: `scripts/seed-test-tickets.ts`**
- Added SO_4 = "99999000004" and SO_5 = "99999000005" constants.
- Extended `TicketSpec` interface with three new optional fields: `requestType?: "authorization" | "parts_nla"`, `ticketStatus` enum widened to include `"rejected"`, `stage1Status?` (full enum), `stage1RejectionReason?`. All optional with defaults that preserve original 3-ticket behavior.
- `ensureSubmission` now reads `spec.requestType ?? "authorization"`, `spec.stage1Status ?? (isApproved ? "approved" : "pending")`, and writes `spec.stage1RejectionReason ?? null`. Existing 3 ticket specs unchanged in behavior since they don't set these new fields.
- Header docstring updated to document the 5 ticket scenarios (#4 and #5 added).
- Two new `ensureSubmission(...)` calls appended in `main()`:
  - **SO 99999000004** — `requestType: "parts_nla"`, `ticketStatus: "queued"`, refrigeration, Sears Protect. Lets Tyler drive the new Task A NLA SMS copy (same-day turnaround, suppressed claim SMS) end-to-end.
  - **SO 99999000005** — `ticketStatus: "rejected"`, `stage1Status: "rejected"`, with `stage1RejectionReason: "Photos missing — please retake compressor closeup and model plate."`. Drives the tech resubmit + intake reopen flow against a previously-rejected ticket.

### Re-seed / verification

Pre-existing rows in the dev DB had been walked through to `ticketStatus="completed"` by prior end-to-end testing. Wiped the test SOs (with FK-safe cascade to `sms_notifications` and `intake_forms`) and re-ran the seed to land fresh-state rows. Verification SELECT confirmed:

```
 id | service_order |  request_type | ticket_status | stage1_status | stage2_status |  auth_code   | ldap
----+---------------+---------------+---------------+---------------+---------------+--------------+-------------
 84 | 99999000001   | authorization | queued        | pending       | pending       | (null)       | test_tech_1
 85 | 99999000002   | authorization | queued        | pending       | pending       | (null)       | test_tech_1
 86 | 99999000003   | authorization | approved      | approved      | approved      | TEST-AUTH-001| test_tech_1
 87 | 99999000004   | parts_nla     | queued        | pending       | pending       | (null)       | test_tech_1
 88 | 99999000005   | authorization | rejected      | rejected      | pending       | (null)       | test_tech_1
```

### Cleanup SQL (run any time to fully purge test rows)

```sql
BEGIN;
DELETE FROM sms_notifications
 WHERE submission_id IN (SELECT id FROM submissions WHERE service_order LIKE '99999000%');
DELETE FROM intake_forms
 WHERE submission_id IN (SELECT id FROM submissions WHERE service_order LIKE '99999000%');
DELETE FROM submissions WHERE service_order LIKE '99999000%';
-- (technicians + users rows for test_tech_1 / TEST_TECH_1 left in place; reusable across seed runs)
COMMIT;
```

To re-seed any time after cleanup: `npx tsx scripts/seed-test-tickets.ts` (idempotent — skips existing rows; if you wipe first the script will create fresh rows in the desired test states).

### Test-tech credentials

- **Tech LDAP** (for `/tech/submit` form): `test_tech_1` (display name `TEST_TECH_1`, district `8175`, tech_un_no `T_TEST_001`, phone `555-0100`).
- **Tech user-table password** (if the flow asks for one): `disabled-test-account-no-login` — literal string, hashed at seed time. Marked `isActive: true`, `firstLogin: false`, `mustChangePassword: false` so it won't gate on password-rotation prompts.
- **Agent dashboard login** (for the review side of the flow, unchanged from existing): `testagent1 / TestAgent2026!` — pre-existing account from `server/seed.ts`.
- **Test SOs**: `99999000001` (fresh SP), `99999000002` (fresh AHS, two-stage), `99999000003` (pre-approved SP), `99999000004` (pending NLA), `99999000005` (rejected/resubmittable).

### Tyler's hard rules — observed
- No version-control commits.
- No schema changes (all columns referenced already exist in `submissions`).
- No Smartsheet form changes.
- No republish.
- Additive on data layer (test-only SO range, easy purge query above).
- COMMITS.md updated only after seed verified via SELECT.

**No version-control commits. No schema changes. No Smartsheet form definition changes. No republish.**


---

## 2026-04-28 — Tyler request: real-format VRS Tech ID for test technician

### Context
Tyler asked for the test tickets to use a real VRS Tech ID format so the intake-form IH Unit Number lookup (server/routes.ts:3610 / :3713 — `tech.techUnNo` resolved by `technician_ldap_id`) shows a believable value during end-to-end testing, not a placeholder string like `T_TEST_001`.

### Format chosen
**`9999001`** — 7-digit zero-padded numeric (matches the real VRS Tech ID format observed across 1,721 production technician rows; samples: `0934786`, `0024588`, `0017152`). Reserved range `9999xxx` is well above the real-tech maximum (`0999706`), so collision with a real technician is mathematically impossible.

### Changes

**File: `scripts/seed-test-tickets.ts`**
- `TECH_UN_NO` constant changed from `"T_TEST_001"` to `"9999001"`. In-code comment block documents the rationale and the reserved-range guarantee.
- `ensureTechnicianRow()` extended: when the row already exists, it now checks `existing.techUnNo !== TECH_UN_NO` and runs an idempotent `UPDATE` to conform the value. This means the seed script can now be re-run any time `TECH_UN_NO` changes and the technicians row catches up automatically — no manual SQL needed for future format changes.

### Verification

Re-ran `npx tsx scripts/seed-test-tickets.ts`:
```
[update] technicians row for test_tech_1 (id=10992): tech_un_no T_TEST_001 -> 9999001
```

Then verified the intake-form lookup resolves correctly via JOIN against the same path the route handler walks (`technicians.tech_un_no` keyed by `submission.technician_ldap_id`):

```
 service_order |  request_type | ticket_status | technician_ldap_id | ih_unit_lookup
---------------+---------------+---------------+--------------------+----------------
 99999000001   | authorization | pending       | test_tech_1        | 9999001
 99999000002   | authorization | queued        | test_tech_1        | 9999001
 99999000003   | authorization | approved      | test_tech_1        | 9999001
 99999000004   | parts_nla     | queued        | test_tech_1        | 9999001
 99999000005   | authorization | rejected      | test_tech_1        | 9999001
```

All 5 test SOs now pre-fill IH Unit Number = `9999001` in the Smartsheet intake URL. Submission IDs and SO numbers unchanged from prior seed expansion (84-88).

### Tyler's hard rules — observed
- No version-control commits.
- No schema changes (only data update on existing `technicians.tech_un_no` column).
- No Smartsheet form changes.
- No republish.
- Test-data layer additive (the technicians row was already a test row; this just conforms its display value).

**No version-control commits. No schema changes. No Smartsheet form definition changes. No republish.**
