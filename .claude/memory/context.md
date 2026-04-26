# Session Context
> Last updated: 2026-04-25

## Current State
- Platform is deployed on Replit with PostgreSQL (Neon)
- Warranty providers: Sears Protect, AHS, First American all live
- NLA parts entry: Split into NLA vs Available sections on submission form
- Agent notifications: Working for online + working agents, admins, super_admins
- Upload diagnostics: Logging to server console via `[UPLOAD-DIAGNOSTIC]` prefix
- HEIC photo upload fix deployed for iPhone users

## Recent Changes
- **Calculator + Intake Form plan drafted** (2026-04-25) — `docs/superpowers/plans/2026-04-25-calculator-and-intake-form.md`. Awaiting Tyler's D1–D4 scope decisions before execution. Verified live with Playwright: Smartsheet form pre-fill works via URL params with column-label keys (e.g. `?IH Service Order Number=1234-56789012` populates input ID `7wk8nOo52`); both Smartsheet form and the calculator are iframe-able (no X-Frame-Options); calculator is a Streamlit app at `repairreplacecalculator.replit.app` with no URL-param auth and no form-POST endpoint (auth runs over WebSocket). Snapshot of default-state form fields saved at `docs/intake_form_default_snapshot.yml` (46 questions total, 5 always-visible).
- **Pre-submit review dialog** (2026-04-23) — Kenneth Hokanson (tech) asked for a confirmation step because techs forget estimate screenshots. Added AlertDialog to `tech-submit.tsx` that opens on Submit and shows service order, phone, appliance, warranty, request type, description preview, photo counts, video/voice status, NLA parts, plus soft warnings (short description, single issue photo, NLA without part numbers). Tech chooses "Go back & edit" or "Confirm & submit." Does NOT bypass existing button-disabled guards — works on top of them.
- **Task 4 (post-submission notes) implemented** (2026-04-23) — `shared/schema.ts` adds `submission_notes` table. `server/storage.ts` adds `createSubmissionNote` / `getSubmissionNotes`. `server/routes.ts` adds `POST|GET /api/submissions/:id/notes`. `client/src/pages/submission-detail.tsx` adds Notes Card with textarea + post button. Tyler must run `npm run db:push` in Replit to apply the schema migration.
- **Task 3 (Auth vs NLA routing guidance) implemented** (2026-04-23) — Red warning banner added to `tech-submit.tsx` (after NLA info banner, ~line 867) that fires when `parts_nla` + AHS or FA warranty is selected. New "Which pathway do I use?" how-to item added to `howToGuidesItems` in `help-center.tsx` before the NLA entry. Banner is informational only — no submit block.
- **Task 2 (wait-time expectations in SMS + Help Center) implemented** (2026-04-23) — `buildSubmissionReceivedMessage` added to `server/sms.ts` with three-branch logic (NLA / AHS-FA external / standard). Called non-blocking from `POST /api/submissions` create handler in `server/routes.ts` (after `storage.createSubmission`, before WebSocket broadcast). Help Center FAQ "How long does approval usually take?" entry expanded with per-provider breakdown in `client/src/pages/help-center.tsx`.
- **Per-file upload failure UI + retry in tech-submit.tsx** (2026-04-23) — `handlePhotosSelect` now tracks per-file failures in `failedUploads` state. Failed files render as red-bordered list items under each photo section (issue/estimate) with Retry and Dismiss buttons. Retry reuses `uploadSinglePhoto` and moves succeeded files into the grid without requiring reselection. Replaces aggregate toast with actionable per-file UI. Task 1 of pilot-feedback-fixes plan.
- **Added rejection reason preview to tech history list** (2026-04-16) — previously rejected tickets only showed a red badge with no reason in the list; techs had to open each one. Now shows compact `Reason: ...` line under the card for `rejected` / `rejected_closed` statuses, using `rejectionReasons` (JSON) with fallback to `stage1RejectionReason`.
- **Fixed resubmit form silent failure for AHS / First American tickets** (2026-04-16) — `tech-resubmit.tsx` Zod schema only allowed `sears_protect`, so clicking "Resubmit to VRS" on an AHS rejected ticket silently failed validation (warrantyType field not rendered → no FormMessage shown). Expanded enum to match `tech-submit.tsx`.
- iPhone photo upload HEIC MIME type fix (accept empty `f.type`)
- Upload diagnostics endpoint added (`POST /api/uploads/report-error`)
- WebSocket notifications fixed for agents in "working" status
- Admin/super_admin now always receive WebSocket notifications (skip status check)
- AHS and First American warranty providers enabled on submission form
- NLA parts entry split into NLA parts and Available parts sections
- All display code handles both old array and new `{"nla":[], "available":[]}` format

## Safety Guardrails
- `drizzle.config.ts`: `strict: true` + `verbose: true` — `db:push` prompts on destructive changes
- `shared/schema.ts`: Header with 7 safety rules — never rename/retype/remove columns
- `server/seed.ts`: `cleanupTestSubmissions()` skipped in production; one-time migrations are flag-gated
- `server/storage.ts`: `deleteUser()` refuses system accounts, logs cascading submission deletes
- `server/routes.ts`: DELETE user blocks self-delete + super_admin deletion
- All PKs are `serial` — never change to varchar/UUID

## Active Issues
- Monitor Scott Sancinito (`ssancin`, user 167) upload attempts post-HEIC fix
- Vite HMR WebSocket connection fails in Replit dev environment (cosmetic only)
