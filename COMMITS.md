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
