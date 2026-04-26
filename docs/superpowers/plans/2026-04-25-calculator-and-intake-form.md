# 2026-04-25 — Calculator Toggle + Smartsheet Intake Form Pre-Fill + Completion Gate

> Status: Draft, awaiting Tyler's review
> Author: Tyler Morgan + Claude
> Estimated effort: ~6–8 dev days for this phase

## Background

VRS agents currently process tickets in VRS, then re-key the same data into the **Smartsheet "VRS Unrep Intake Form 2.0"** (form ID `aa5f07c589b64ae993f5f75e20f71d5f`). They also use a separate **Streamlit Repair/Replace Calculator** at `repairreplacecalculator.replit.app` — opened in another browser tab — to compute the un-economical dollar amount that becomes the "Un-Economical Calculator Total Cost" / "SHW Uneconomical Amount" field on the intake form.

Tyler authored a comprehensive backend integration spec — `VRS_Smartsheet_Integration_Proposal.docx` (2026-04-25) — that proposes direct Smartsheet REST API row-writes from VRS. **That work is blocked** on (a) Smartsheet API token from Todd Pennington and (b) ~3–4 weeks of dev. This plan is the **interim solution** Tyler is shipping now.

### Today's pivot

Instead of API row-writes, VRS will:
1. Open the actual Smartsheet form **inside the agent dashboard** (iframe, in the existing right-side panel that today holds SHSAI / "Sasha")
2. **Pre-fill** the form via URL query params using human-readable column labels (verified live: `?IH Service Order Number=1234-56789012` populates the field)
3. Force completion of the intake form **before** the agent can claim another ticket
4. Surface the calculator **inside the same panel** (toggleable with SHSAI) so agents stop alt-tabbing

## Verified facts (probed live with Playwright on 2026-04-25)

| Claim | Status |
|---|---|
| Smartsheet form URL pre-fill works via column-label query params (URL-encoded) | ✅ Verified — input `7wk8nOo52` (Smartsheet's internal ID for "IH Service Order Number") received the value `1234-56789012` from query string |
| Smartsheet form has no `X-Frame-Options` / CSP `frame-ancestors` block | ✅ Verified via curl — iframe-able from VRS origin |
| Smartsheet form has **46 total questions**, **5 always-visible**, **41 conditional** | ✅ Verified — see `docs/intake_form_default_snapshot.yml` |
| Calculator URL `?username=&password=` does anything | ❌ Verified — does nothing, calc author did not wire URL-param auth |
| Calculator login is a standard form-POST | ❌ Verified — it's a Streamlit app; auth runs over WebSocket (`/_stcore/stream`); no POST endpoint to inject credentials into |
| Calculator iframe-able from VRS | ✅ Verified — no `X-Frame-Options` block |

## Goals (this phase)

1. **Right-panel toggle: SHSAI ↔ Calculator** — same 40% panel real estate already used by SHSAI in `agent-dashboard.tsx` (state `shsaiVisible`, lines 235–241; render block at line 3013+).
2. **Intake form workflow** — after every ticket is resolved (approve/reject/invalid/Stage 2 complete), agent must complete the intake form before they can claim another ticket. Form is pre-filled with everything VRS knows; agent fills the rest in a guided panel; final review happens in the live Smartsheet form iframe.
3. **Completion gate** — server-side enforcement on `PATCH /api/submissions/:id/claim`.

## Non-goals (this phase)

- Calculator auto-login (see Phase 2 below — three viable paths, none possible in this phase without external dependencies)
- Direct Smartsheet API row-write (see Phase 3 — original proposal's path; blocked on Todd's API token)
- 1099-ISP Contractor support (proposal Phase 1 is W2-only)
- AHS / First American / Kenmore IW (out of scope for proposal Phase 1)

## Open scope decisions (must resolve before execution)

These three items are scope choices, not technical questions. Surfaced explicitly so they don't get implicitly decided wrong.

### D1 — Technician review step

Tyler's first message: *"fully fill out the form, **show it to the technician for review**, and then ultimately submit it so he can move on to the next ticket."*

Plan currently has **agent-only review** in the iframe modal. Three options:

- **a)** Agent-only (current plan). Fastest to ship.
- **b)** Tech sees a read-only summary on their device after the agent submits — SMS link to a `/intake-preview/<token>` page with "Looks right" / "Something's wrong" buttons. Adds 1 day. Tech can flag issues but not block.
- **c)** Tech actually approves before Smartsheet submission — agent's submit button is gated until tech confirms. Adds 1.5 days. Strongest guard, slows agent throughput.

### D2 — "Quiz the agent" UX

Tyler used the word "quiz" twice. Two valid implementations:

- **a)** Static form with required asterisks and a disabled Submit button (current plan). Familiar, fast.
- **b)** Guided step-through — "field 3 of 12: Reason for Calling? [dropdown]" → next → next. Forces conscious choice on every field, harder to skip. +1–2 days UX work.

### D3 — `agent_external_credentials` table (calculator credential storage)

Tyler's first message: *"set up some sort of setting to where they can save that to their agent portal and that be injected into fields and log in automatically for each individual agent."*

Plan currently **defers** this. Reasoning: without a working calc auto-login mechanism (Phase 2 not yet decided), storing third-party passwords-at-rest is a liability with zero benefit — the saved creds wouldn't be used by anything.

- **a)** Defer (current plan). Build the table when Phase 2 lands and we know which auto-login path consumes the creds.
- **b)** Build the table + settings UI now. Agent can save creds. Nothing reads them yet. Pro: ready when Phase 2 ships. Con: storing real creds nobody uses is a perfect target for a leak with zero defensive payoff.
- **c)** Build the settings UI but store only in browser `localStorage` (encrypted with a per-session key). Pro: no server-side liability. Con: doesn't sync across devices.

### D4 — Task 0 budget (1 day vs 2 days)

The form has 46 questions, 41 conditional, 4 Proc ID categories, and cascading sub-branches (e.g., Pre-Existing → Comments). Combinatorially that's ~30–50 distinct form states to enumerate. 1 day is tight.

- **a)** Time-box at 1 day, capture one category fully, ship Phase 1a covering only SPHW; expand later.
- **b)** Budget 2 days, capture all four categories before any other task starts.

Recommendation: **(b)**. The field map is the contract for everything downstream — getting it wrong means every downstream task is wrong. Better to over-invest here.

## Architecture

### Right panel: SHSAI ↔ Calculator toggle

`agent-dashboard.tsx` already has `shsaiVisible: boolean`. Replace with `rightPanelView: "shsai" | "calculator" | "hidden"`. Tabs at the top of the right panel switch between the two. Calculator tab renders `<iframe src="https://repairreplacecalculator.replit.app/" sandbox="allow-scripts allow-same-origin allow-forms" />`. **No auto-login** — agent logs in once per browser session, Streamlit's session cookie persists across iframe reloads. Tab choice persisted in `localStorage` per agent.

### Intake form data model

```ts
// shared/schema.ts — new table
export const intakeForms = pgTable("intake_forms", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  agentId: integer("agent_id").notNull().references(() => users.id),
  payload: jsonb("payload").notNull(),                 // canonical form data, keyed by Smartsheet column label
  smartsheetUrlSubmitted: text("smartsheet_url_submitted"),  // the pre-filled URL agent reviewed
  agentConfirmedAt: timestamp("agent_confirmed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

One intake form per submission. `ON DELETE CASCADE` matches `submission_notes` precedent (2026-04-23). No new column on `submissions` — we query by FK.

**Defer:** `agent_external_credentials` table. Without a working calculator auto-login mechanism, storing third-party passwords is liability with zero benefit. Revisit when Phase 2 is unblocked.

### Resolution panel field expansion

The intake form has 41 conditional fields. Today's VRS resolution panel only collects: approve/reject/invalid + rejection reasons + comments + Stage 2 fields. The new fields per `VRS_Smartsheet_Integration_Proposal.docx` §5.1 need to be added to the resolution panel, conditional on Proc ID category.

**This is gated on Task 0** (field-map capture) — see Tasks below. Without the full conditional tree we can't build a hard-block validation correctly.

### Pre-fill URL builder (server-side)

```ts
// server/services/smartsheet.ts (new file)
export function buildIntakeFormUrl(submission: Submission, formData: IntakeFormPayload): string {
  const FORM_ID = "aa5f07c589b64ae993f5f75e20f71d5f";
  const params = new URLSearchParams();
  for (const [columnLabel, value] of Object.entries(formData)) {
    if (value != null && value !== "") params.set(columnLabel, String(value));
  }
  return `https://app.smartsheet.com/b/form/${FORM_ID}?${params.toString()}`;
}
```

Column labels come from `docs/intake_form_field_map.md` (Task 0 output). Server-side because the payload mapping logic is reused by tests + future API path.

### Completion confirmation (honor system, this phase)

After agent reviews the pre-filled form in the iframe modal and clicks Smartsheet's Submit, VRS shows: **"Did Smartsheet confirm submission? [Yes — continue] [No — reopen form]"**. "Yes" creates the `intake_forms` row and unlocks claim. Auditable via `agentConfirmedAt`. Phase 2 upgrades this to a verified callback.

### Server-side claim gate

`PATCH /api/submissions/:id/claim` checks: does the requesting agent have any submission with `processedAt IS NOT NULL` AND no corresponding `intake_forms` row? If yes → `409 Conflict { code: "INTAKE_REQUIRED", submissionId: <blocking id> }`. Frontend handles 409 by routing the agent back to the blocking submission's intake-form panel.

The gate runs in `storage.claimSubmission()` (single transaction, prevents race) — not just in the route handler.

## Tasks

### Task 0 — Capture full field map (1 day, **blocking**)

Walk the live Smartsheet form via Playwright. For every Proc ID category (SPHW, PA 2.0, SHW, Invalid) and every dropdown branch within, snapshot the revealed fields. Produce `docs/intake_form_field_map.md`:

```
| Smartsheet Label | Type | Required | Conditional on | VRS source |
|---|---|---|---|---|
| VRS Tech ID | dropdown | yes | always | agent.ldapId |
| IH Unit Number | dropdown | yes | always | technicians.techUnNo |
| ...
| Reason for Calling VRS Hotline PA/SPHW | dropdown | yes | Proc ID category = SPHW or PA | new agent input |
| Pre-existing Issue Comments | text | yes | Pre-Existing Condition SPHW = Yes | new agent input |
```

This is the contract for everything else. **Do not start Task 3 until this exists.**

### Task 1 — DB schema (0.5 day)

- Add `intakeForms` table to `shared/schema.ts`
- Add `createIntakeForm`, `getIntakeForm(submissionId)`, `getMissingIntakeFor(agentId)` to `IStorage` + `DatabaseStorage`
- Document `npm run db:push` requirement in CHANGELOG (matches `submission_notes` precedent — db:push deferred to Tyler-on-Replit)

### Task 2 — Calculator toggle UI (0.5 day)

- Replace `shsaiVisible: boolean` with `rightPanelView: "shsai" | "calculator" | "hidden"` in `agent-dashboard.tsx`
- Tabs component at top of right panel (shadcn `Tabs`)
- Calculator tab renders sandboxed iframe
- Persist last-selected tab in `localStorage` keyed by `agent:${user.id}:rightPanel`
- Existing `button-show-shsai` / `button-hide-shsai` test IDs preserved; new `button-show-calculator`

### Task 3 — Resolution-panel field expansion (2–3 days)

Builds on Task 0's field map. For each Proc ID category branch, render the appropriate conditional fields under the existing process / approve / reject UI. **Hard-block validation:** "Submit Intake" button disabled until every required field for the active branch is filled. Notes textarea auto-pasted from the agent's existing notes field.

Implementation: a single `<IntakeFormFieldset proc_id_category={...} value={...} onChange={...} />` component driven by a config object derived from the field map. No per-field hardcoded JSX — keep it data-driven so regenerating the field map auto-updates the UI.

### Task 4 — Pre-fill URL + iframe modal (1 day)

- `server/services/smartsheet.ts` — `buildIntakeFormUrl(submission, formData)`
- `POST /api/submissions/:id/intake-form/preview` — returns the pre-fill URL (server-built; client never sees the field-mapping logic)
- `POST /api/submissions/:id/intake-form/confirm` — agent confirms Smartsheet submission, creates the row, broadcasts WS event so admin dashboard updates
- New `IntakeFormReviewModal` component — opens iframe with pre-fill URL, Submit/Cancel buttons, "Did Smartsheet confirm?" prompt after submit click

### Task 5 — Server-side claim gate (0.5 day)

- `storage.claimSubmission()` rejects with `INTAKE_REQUIRED` error if agent has unfinished intake forms (single transaction)
- `PATCH /api/submissions/:id/claim` returns `409 { code, blockingSubmissionId }` on that error
- Frontend `useMutation` onError handler — if 409 with `INTAKE_REQUIRED`, toast + auto-route to blocking submission's intake form

### Task 6 — Tests + smoke (1 day)

- Backend: unit test `buildIntakeFormUrl` with each Proc ID category fixture
- Backend: integration test for the claim-gate (create submission → process → attempt claim of new ticket → 409 → submit intake → claim succeeds)
- Frontend: Playwright smoke for the agent flow (claim → process → intake form auto-opens → all required fields enforced → submit → next claim succeeds)
- Manual: load agent dashboard in Replit, run through one full SPHW + one PA + one SHW ticket end-to-end

### Task 7 — Memory + changelog updates (mandatory, per repo CLAUDE.md §1)

- `CHANGELOG.md` entry under `[Unreleased]`
- `.claude/memory/context.md` — current state additions
- `.claude/memory/decisions.md` — three decisions: (a) honor-system completion vs redirect URL, (b) defer `agent_external_credentials`, (c) iframe + pre-fill instead of API row-write
- `.claude/memory/todos.md` — mark Phase 2 / Phase 3 items as deferred

## Phase 2 (deferred — separate plan when unblocked)

**Calculator auto-login.** Three paths, in order of cleanliness:

1. **Calculator owner adds `?token=<jwt>` URL param.** ~20 lines of Streamlit-side Python (`st.query_params` + `streamlit-authenticator`). VRS mints short-lived JWT per agent per session. Iframe loads `?token=<jwt>`, calc validates and skips Sign In. **Best long-term, requires finding the calc owner.** Same kind of ask as Todd Pennington — different person.
2. **VRS-distributed Chrome extension.** Content script injects credentials into the calculator iframe regardless of origin. Reads creds from VRS via tiny authenticated endpoint. ~3–5 days dev + sideload zip for pilot, Chrome Web Store later. Permanent solution that doesn't depend on the calc owner.
3. **Forking the calculator's Replit and pointing agents at the fork.** Tyler doesn't control upstream but could fork. Adds maintenance burden but delivers Path 1 unilaterally.

**Smartsheet completion verification (replace honor-system).** Smartsheet form settings let owner set a thank-you redirect URL. Point it at `/api/intake-forms/confirm-redirect?submissionId=<id>&token=<hmac>`. Replaces the "Did Smartsheet confirm?" honor button with a real callback. Requires Todd Pennington to flip one setting on the form.

## Phase 3 — Original proposal path (deferred, separate plan)

When Tyler has the Smartsheet API token from Todd:
- Replace iframe pre-fill with server-side row write via Smartsheet REST API
- All conditional resolution-panel work from Phase 1 above is reused — same field set, same validation, same data model
- Drop the iframe modal entirely
- ~1 week additional dev once API access lands

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Smartsheet renames a column → pre-fill breaks silently | Medium | Server-side smoke job: weekly fetch the form, parse rendered HTML, alert if any expected label is missing |
| Honor-system "Did it confirm?" gameable by agents | Low | Audit log + admin dashboard flag for agents whose intake-form `agentConfirmedAt` consistently precedes any actual Smartsheet activity (cross-check post Phase 3) |
| Streamlit calc session expires mid-ticket → agent loses calc state | Medium | Tolerable; agent re-logs. Long-term fix is Phase 2 Path 1 (token auth → no expiry from VRS angle) |
| Conditional field tree has edge cases not captured in Task 0 | Medium | Task 6 manual smoke + README note that field map must be regenerated whenever Smartsheet form is edited |
| Cross-origin iframe sandbox flags break Smartsheet form interactions | Low | Verified iframe-able with default flags; if Smartsheet adds frame headers later, fall back to `window.open()` popup |
| Agent processes ticket then never returns to complete intake → can't claim → support ticket | Medium | "Resume incomplete intake" link in agent home view; admin can override-clear via existing reassign endpoint |

## Open questions for Tyler before implementation starts

(See **Open scope decisions** section above for D1–D4. Items below are smaller confirmations.)

5. **Honor-system vs redirect URL for completion confirm** — Phase 1 ships honor-system; ask Todd for redirect URL in parallel and upgrade in Phase 2. Tyler agrees? (Default: yes, ship honor system now.)
6. **Calculator phase** — confirm Phase 2 calc auto-login is deferred this PR, calc tab ships with no auto-login. (Tyler's 2026-04-25 message implied yes.)
7. **Excel field source-of-truth** — Tyler mentioned an "intake Excel" in Downloads on 2026-04-25 that I couldn't locate. Proposal contains the same field data, but if the Excel has additional fields the proposal omits, send it. (Otherwise Task 0's Playwright walk is the canonical source.)

## Implementation sequencing

```
Days 1–2: Task 0 (field map walk via Playwright — see D4)
Day 3: Task 1 (schema) + Task 2 (calc toggle)
Days 4–5: Task 3 (resolution fields — UX shape depends on D2)
Day 6: Task 4 (pre-fill URL + modal — adds tech-review path if D1=b/c)
Day 7: Task 5 (claim gate)
Day 8: Task 6 (tests + smoke)
Day 9: Task 7 (memory/changelog) + PR review fixes
```

Total: ~9 dev days assuming D1=a, D2=a, D3=a, D4=b. Each "b/c" choice on D1/D2/D3 adds 1–2 days.

Per repo CLAUDE.md, plan-driven execution with subagents per task + reviewer pass after each (matches 2026-04-23 pilot-feedback-fixes pattern).
