# Session Context

## Current State
- Platform is deployed on Replit with PostgreSQL (Neon)
- Warranty providers: Sears Protect, AHS, First American all live
- NLA parts entry: Split into NLA vs Available sections on submission form
- Agent notifications: Working for online + working agents, admins, super_admins
- Upload diagnostics: Logging to server console via `[UPLOAD-DIAGNOSTIC]` prefix
- HEIC photo upload fix deployed for iPhone users

## Recent Changes
- iPhone photo upload HEIC MIME type fix (accept empty `f.type`)
- Upload diagnostics endpoint added (`POST /api/uploads/report-error`)
- WebSocket notifications fixed for agents in "working" status
- Admin/super_admin now always receive WebSocket notifications (skip status check)
- AHS and First American warranty providers enabled on submission form
- NLA parts entry split into NLA parts and Available parts sections
- All display code handles both old array and new `{"nla":[], "available":[]}` format

## Active Issues
- Monitor Scott Sancinito (`ssancin`, user 167) upload attempts post-HEIC fix
- Vite HMR WebSocket connection fails in Replit dev environment (cosmetic only)
