# Changelog

All notable changes to the VRS Digital Authorization Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Technician submission form auto-saves drafts**: The new-submission form now continuously saves a draft to the device (text fields, model/SO, part numbers, uploaded photos, video, voice note, AI-enhanced description) so techs no longer lose their work if they back out to TechHub, switch apps, refresh, or the app reloads. When they return, a "Draft restored" banner appears with a "Start fresh" button to discard. The draft is cleared automatically on successful submission. Per-user (drafts are namespaced by user ID so devices shared by multiple techs don't leak content).
- **Reject & Close suppresses cash-call line for AHS / First American and infestation cases**: SMS to the technician (and the agent-side preview) no longer says "You may offer the customer a cash call estimate" when the warranty is American Home Shield or First American, or when the reason text or agent's note mentions infestation. Updated in `server/sms.ts`, `client/src/lib/smsPreview.ts`, and the agent dashboard preview wiring.
- **Admin Ticket Overview lightbox stays open while navigating photos**: Clicking the prev/next chevrons used to close the entire ticket dialog. The lightbox is now rendered in a portal with explicit pointer-event handling and the dialog ignores outside interactions while the lightbox is open.

### Added
- **Live SMS preview pane on every agent action form**: Agents now see a live, auto-updating preview of the exact SMS the technician will receive — across all 6 action forms (Stage 1 reject, reject & close, mark invalid, Stage 1 approve / approve_submission, Stage 2 auth-code approval, and all NLA actions). The preview renders below the message textarea with character + segment count, so agents can avoid duplicating boilerplate (e.g. "Order from TechHub") that the system auto-includes. New files: `client/src/lib/smsPreview.ts` (pure preview-string builders mirroring server templates) and `client/src/components/sms-preview.tsx` (styled preview box).
- **Renamed "Message to Technician" → "Additional context (optional)"** with helper text on every action form, explaining what the tech will already see automatically vs. what the agent should add. Reduces redundant duplication of boilerplate. NLA forms keep the field as required and label it "Additional context for the technician *".

### Changed
- **Standardized "Message to Technician" branding across SMS and in-app**: Previously the same `technicianMessage` field appeared to techs under four different labels — "Agent message:", "Agent notes:", "Instructions:", and "Agent Message:" — depending on which action path was used. All channels now use a consistent, branded prefix:
  - **`Feedback from VRS — Action required:`** when the tech needs to do something (Stage 1 reject + resubmit, NLA reject + resubmit, NLA part-found-tech-orders).
  - **`Feedback from VRS:`** for informational messages (reject and close, NLA P-card confirm).
  - **No prefix** on approval paths (Stage 1 approve, final approve / auth code, NLA approval) — the agent's optional note is appended inline as an extra paragraph since "feedback" wording felt awkward on positive outcomes. If the agent leaves the note blank, the SMS is just the standard approval text with no extra section.
  - Updated in `server/sms.ts` (`buildNlaApprovalMessage`, `buildAuthCodeMessage`), six call sites in `server/routes.ts` (lines ~1233, 1328, 1347, 1555, 1611, 1630), and three rendered labels in `client/src/pages/submission-detail.tsx` (NLA tech-orders, rejected, rejected_closed). Two agent-side preview labels in `client/src/pages/agent-dashboard.tsx` (lines ~1993, 3170) were also unified to "Message to Technician:" for clarity to the agent.

### Fixed
- **Per-file upload failure visibility**: When a photo fails to upload, the file now appears in a red-bordered list under the photo grid with a Retry button, instead of only showing an aggregate toast. Techs can retry individual files without reselecting the ones that already succeeded.
- **Resubmit form silently failed for AHS / First American tickets**: The Zod schema on `client/src/pages/tech-resubmit.tsx` only allowed `warrantyType: "sears_protect"`, so form validation silently rejected rejected AHS/FA tickets on submit (no visible error — the field isn't rendered). Technicians had to create a new ticket instead. Schema now matches `tech-submit.tsx` and accepts all three providers.

### Added
- **Rejection reason shown in technician history list**: Previously techs had to tap through to each rejected ticket's detail page to see why it was rejected. The history list now shows a compact `Reason: …` line (2-line clamp, destructive color) under cards with `rejected` or `rejected_closed` status. Reads from `rejectionReasons` (JSON array) with safe fallback to `stage1RejectionReason`.

### Added
- Schema safety rules header in `shared/schema.ts` (never rename/retype/remove columns)
- `strict: true` and `verbose: true` in `drizzle.config.ts` for destructive change prompts
- Self-delete prevention on `DELETE /api/admin/users/:id`
- Super admin deletion prevention on `DELETE /api/admin/users/:id`
- System account guard in `storage.deleteUser()` (throws instead of silently proceeding)
- Cascade deletion logging in `storage.deleteUser()` — warns with count of affected submissions
- Production guard on `cleanupTestSubmissions()` — skipped when `NODE_ENV=production`
- Schema & Data Safety sections in `CLAUDE.md` and `replit.md`

## [0.1.0] - 2026-04-16

### Added
- **Core Platform**: Full-stack authorization request management (Express + React + PostgreSQL)
- **Technician PWA**: Mobile-first submission form with photo/video/voice note uploads, AI description enhancement, submission history, and detail view
- **Agent Dashboard**: Real-time ticket queue with claim-to-process workflow, division-based routing, SHSAI integration panel, and notification sounds (5 tones)
- **Admin Dashboard**: User management, analytics, agent status monitoring, ticket overview with audit trail, CSV/XLSX export, technician sync from Snowflake
- **NLA Workflow**: Dedicated Parts No Longer Available queue with 8 resolution actions, P-card escalation system, and NLA-specific analytics
- **Two-Stage Review**: AHS and First American warranties support internal approval + external auth code entry
- **Warranty Providers**: Sears Protect, American Home Shield, and First American all enabled for technician submissions
- **Split NLA Parts Entry**: Separate sections for NLA parts (unavailable) and other required parts (available) on the submission form
- **Real-Time Notifications**: WebSocket-based sound dings, toasts, and browser notifications for new tickets, claimed tickets, and queue changes — for agents, admins, and super_admins
- **Upload Diagnostics**: Client-side upload error reporting endpoint (`POST /api/uploads/report-error`) logs failure details server-side with `[UPLOAD-DIAGNOSTIC]` prefix
- **iPhone HEIC Fix**: Photo upload file filter accepts empty MIME types (common on iOS HEIC photos)
- **Resubmission System**: Technicians can resubmit rejected tickets; auto-assigns to original reviewer if online
- **Division Correction**: Agents can correct appliance type mid-review with intelligent ownership handling
- **RGC Code System**: Daily rotating codes required before agents can process tickets
- **Notification Sound System**: 5 tone options (Chime, Bell, Pulse, Cascade, Alert) with per-user volume control
- **Dark Mode**: App-wide dark mode toggle persisted to localStorage with OS preference fallback
- **Onboarding**: First-login wizard, What's New modal, contextual help tooltips, searchable Help Center
- **SMS Notifications**: Twilio-based notifications to technicians on ticket status changes
- **Technician Feedback**: In-app feedback submission with admin management (status tracking, notes)
- **Test Cleanup**: Automatic purge of test submissions (testtech1/tmorri1) on every server restart
- **Mobile Touch Targets**: 44px minimum touch targets on technician login page
