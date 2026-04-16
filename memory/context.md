# Session Context

Persistent context that carries across work sessions.

---

## Active Users & Accounts
- **Admin login**: `sysadmin` / `VRS2026!` (super_admin, user ID 10)
- **Agent login**: `/agent/login` with username/password
- **Tech login**: `/tech/login` with LDAP ID only (no password)
- **Test tech accounts**: `testtech1`, `tmorri1` — submissions auto-cleaned on restart

## Key User Reports
- **Scott Sancinito** (`ssancin`, user ID 167): Reported complete photo upload failure on iPhone. Zero server logs — failure was client-side. Root cause: HEIC files with empty MIME type being silently filtered out. Fix deployed (accept `f.type === ""`). Upload diagnostics endpoint added for future visibility.

## Current Production State
- Deployed on Replit with PostgreSQL (Neon)
- Warranty providers: Sears Protect, AHS, First American all live
- NLA parts entry: Split into NLA vs Available sections
- Agent notifications: Working for online + working agents, admins, super_admins
- Upload diagnostics: Logging to server console via `[UPLOAD-DIAGNOSTIC]` prefix

## Service Order Format
- Pattern: `DDDD-SSSSSSSS` (e.g., `8175-12345678`)
- District code = first 4 digits

## WebSocket Broadcast Rules
- `broadcastToDivisionAgents`: Sends to vrs_agent (online/working), admin, super_admin matching division
- `broadcastToNlaDivisionAgents`: Same role/status rules, but also requires "nla" division + appliance type match
- Admins get all divisions on connect (including "nla")
- Offline agents are excluded; admins skip status check

## NLA Actions Requiring RGC
`nla_replacement_submitted`, `nla_replacement_tech_initiates`, `nla_part_found_vrs_ordered`, `nla_part_found_tech_orders`, `nla_pcard_confirm`, `nla_escalate_pcard`
