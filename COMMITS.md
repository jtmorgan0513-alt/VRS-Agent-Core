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

