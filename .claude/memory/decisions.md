# Architectural Decisions

Use this format for new entries:

```
### ADR-NNN: Title
**Date**: YYYY-MM-DD
**Status**: Active | Superseded | Deprecated
**Context**: What prompted this decision?
**Decision**: What was decided?
**Consequences**: What are the trade-offs?
```

---

### ADR-001: Part Numbers Storage Format
**Date**: 2026-04-16
**Status**: Active
**Context**: NLA submissions needed to distinguish between parts that are unavailable (NLA) and parts that are available but must stay on the order.
**Decision**: Store as JSON object `{"nla": [...], "available": [...]}` in the existing `partNumbers` text column. Backward compatible — old array format `["PART1", "PART2"]` still parses and displays correctly.
**Consequences**: All display code (agent dashboard, tech detail, XLSX export) must handle both formats.

### ADR-002: Upload Diagnostics as Server Logs Only
**Date**: 2026-04-16
**Status**: Active
**Context**: iPhone photo uploads were failing with zero server-side visibility. Needed diagnostics without adding database complexity.
**Decision**: Fire-and-forget `POST /api/uploads/report-error` endpoint that logs `console.error("[UPLOAD-DIAGNOSTIC]", ...)`. No database table, no retention policy.
**Consequences**: Diagnostics only visible in deployment logs. Sufficient for debugging since upload failures are infrequent.

### ADR-003: Admin Notification Without Status Toggle
**Date**: 2026-04-16
**Status**: Active
**Context**: Admins had no online/offline toggle, so their `agentStatus` defaulted to "offline" and they were excluded from all WebSocket broadcasts.
**Decision**: Broadcast functions check role separately — admins/super_admins skip status check entirely and always receive notifications when connected via WebSocket.
**Consequences**: Admins cannot opt out of notifications while on the dashboard. Acceptable since they are supervisory.
