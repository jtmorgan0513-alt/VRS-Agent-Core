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

### ADR-010: AES-256-GCM + scrypt(SESSION_SECRET, perRowSalt) for agent credential storage
**Date**: 2026-04-26
**Status**: Active
**Context**: TD3b in the calculator + intake form plan required at-rest encryption for per-agent calculator credentials. We need to decrypt on every iframe load so an envelope/KMS round-trip per request is too expensive, and we don't want to add a new managed-secret dependency.
**Decision**: Use Node's built-in `crypto` AES-256-GCM. Derive a per-row encryption key via `scrypt(SESSION_SECRET, perRowSalt, 32)` — `SESSION_SECRET` is already managed in Replit Secrets, already required for JWT signing, and rotating it already invalidates all sessions, so binding credential decryption to the same secret has no new operational cost. Per-row 16-byte salt prevents key reuse across rows. Store base64(ciphertext), base64(iv), base64(authTag), base64(salt) in `agent_external_credentials`. Pack BOTH per-field GCM auth tags into a single 32-byte base64 column (with xor'd IVs across the two ciphertexts) so the schema only needs one auth_tag column instead of two.
**Consequences**:
- (+) Zero new infra. Server never logs cleartext.
- (+) Rotating SESSION_SECRET invalidates stored credentials AND sessions atomically — agents are re-prompted to log in AND to re-save calculator credentials. Acceptable given the rarity of secret rotation.
- (−) No HSM-grade isolation. A server-side process compromise would let the attacker decrypt all stored credentials — this is documented and accepted in the threat model since the alternative is to not store calculator credentials at all and force agents to type them every time.
- (−) The xor'd IV trick needs a brief comment in `crypto.ts` so future maintainers don't think the IV is being reused naively.

**Browser-side handling (added 2026-04-26 after architect review):** the iframe `src` is the calculator base URL ONLY — credentials are never appended as query params (would leak to history + remote access logs). The `postMessage` envelope's `targetOrigin` is pinned to the parsed calculator origin (never `"*"`), so a navigated/compromised iframe will not receive credentials. Final fallback is the agent manually copying via the iframe header's Copy buttons (clipboard write).

### ADR-011: Atomic UPDATE-WHERE claim + 24h intake-form gate (vrs_agent only)
**Date**: 2026-04-26
**Status**: Active
**Context**: T5 in the calculator + intake form plan required two protections on `PATCH /api/submissions/:id/claim`: (1) prevent two agents from racing to claim the same row; (2) prevent agents from racking up unfinished intake forms by gating new claims on completing the Smartsheet intake form for any recently-reviewed non-NLA ticket.
**Decision**: Replace the read-then-update sequence with `storage.claimSubmission(id, agentId)` which executes `UPDATE submissions SET ... WHERE id = $1 AND ticket_status = 'queued' RETURNING *` — atomic at the DB level, no advisory locks needed. Add `storage.getMissingIntakeForAgent(agentId)` which scans for submissions reviewed by this agent in the last 24h with `ticket_status != 'queued'`, `request_type != 'parts_nla'`, and no matching `intake_forms` row. Apply the gate ONLY for `vrs_agent` role; admins/super_admins bypass (they're often picking up someone else's queue or covering escalations and asking them to fill an unrelated intake form would be wrong). On 409, frontend auto-routes to the blocking submission and pops the intake review modal.
**Consequences**:
- (+) Race-free claim with zero coordination overhead.
- (+) Gate is psychologically and operationally aligned: agents finish what they started before grabbing the next one.
- (+) Clean 409 contract with structured codes (`INTAKE_REQUIRED`, `ALREADY_CLAIMED`) and `blockingSubmissionId`.
- (−) Gate state is computed on every claim attempt — O(N) over recent reviews. Negligible at current volume; if it becomes hot we'd add a `pending_intake_count` denormalized counter on `users`.
- (−) The existing claim-route code path was rewritten — care taken to keep auth checks identical and to handle the case where the row was already claimed between auth checks and atomic UPDATE (returns 409 ALREADY_CLAIMED rather than 200).

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

### ADR-004: Schema and Data Safety Guardrails
**Date**: 2026-04-16
**Status**: Active
**Context**: Two AI agents (Replit Agent + Claude AI) both modify code. Schema changes via Drizzle `db:push` can silently drop columns/data. Seed.ts runs on every restart with potentially destructive operations.
**Decision**: Multi-layer protection: (1) `drizzle.config.ts` uses `strict: true` + `verbose: true` to force confirmation on destructive changes. (2) `shared/schema.ts` has a safety header with explicit rules. (3) `cleanupTestSubmissions()` gated behind `NODE_ENV !== "production"`. (4) `deleteUser()` in storage refuses system accounts and logs cascading deletes. (5) Delete user API blocks self-delete and super_admin deletion.
**Consequences**: Schema changes require explicit confirmation. Test cleanup won't run in production. Accidental user deletion is harder. Both AI agents have documented rules in their respective instruction files.
