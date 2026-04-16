# Session Context

## Current State
- Platform is deployed on Replit with PostgreSQL (Neon)
- Warranty providers: Sears Protect, AHS, First American all live
- NLA parts entry: Split into NLA vs Available sections on submission form
- Agent notifications: Working for online + working agents, admins, super_admins
- Upload diagnostics: Logging to server console via `[UPLOAD-DIAGNOSTIC]` prefix
- HEIC photo upload fix deployed for iPhone users

## Recent Changes
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
