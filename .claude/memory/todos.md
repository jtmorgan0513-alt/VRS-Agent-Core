# Tasks

## In Progress
- [ ] Calculator + Intake Form plan execution — `docs/superpowers/plans/2026-04-25-calculator-and-intake-form.md`. **Blocked on Tyler's D1–D4 decisions.** D1=tech review step? D2=quiz UX shape? D3=defer credential storage table? D4=Task 0 budget 1d vs 2d?

## Blocked
- Phase 2 calculator auto-login — pending decision between (a) get calc owner to add `?token=` param, (b) build VRS-distributed Chrome extension, (c) fork the Replit. Needs an external conversation first.
- Phase 2 Smartsheet redirect-URL completion — needs Todd Pennington to flip a setting in form properties.
- Phase 3 direct Smartsheet API row-write — original proposal path; needs API token from Todd Pennington.

## Done
- [x] Drafted Calculator + Intake Form plan (2026-04-25). Verified Smartsheet pre-fill + iframe behavior live via Playwright. Plan covers Phase 1 (this PR), Phase 2 (deferred auto-login + redirect URL), Phase 3 (proposal's API path).
- [x] Task 2 — pilot-feedback-fixes (implemented 2026-04-23)
- [x] Task 3 — pilot-feedback-fixes (implemented 2026-04-23)
- [x] Task 4 — pilot-feedback-fixes (implemented 2026-04-23)
- [x] Pre-submit review dialog (Kenneth Hokanson field feedback) — implemented 2026-04-23
- [x] Task 1 (per-file upload failure UI + retry) — implemented in `client/src/pages/tech-submit.tsx` (2026-04-23)
- [x] Show rejection reason on tech history list cards — previously only a red badge, no reason text; tech had to drill into each ticket to see why it was rejected (2026-04-16)
- [x] Fix resubmit form silent failure for AHS / First American rejected tickets — schema only allowed `sears_protect`, so Zod silently blocked submit on the day AHS was enabled (2026-04-16)
- [x] Fix iPhone photo upload HEIC MIME type filtering (2026-04-16)
- [x] Add client-side upload diagnostics logging (2026-04-16)
- [x] Fix real-time notifications for agents in "working" status (2026-04-16)
- [x] Fix real-time notifications for admins/super_admins (2026-04-16)
- [x] Add notification subscriptions to admin dashboard (2026-04-16)
- [x] Enable AHS and First American warranty submissions (2026-04-16)
- [x] Split NLA parts entry into NLA and Available Parts sections (2026-04-16)
