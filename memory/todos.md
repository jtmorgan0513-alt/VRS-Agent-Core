# Active Tasks & Blockers

Track what needs to be done, what's in progress, and what's blocked.

---

## In Progress
_(none currently)_

## To Do
- [ ] Monitor upload diagnostics logs for Scott Sancinito's next upload attempt to confirm HEIC fix resolved his issue
- [ ] Verify admin WebSocket notifications are working in production (toast + sound on new ticket)

## Completed (Recent)
- [x] Fix iPhone photo upload HEIC MIME type filtering (2026-04-16)
- [x] Add client-side upload diagnostics logging (2026-04-16)
- [x] Fix real-time notifications for agents in "working" status (2026-04-16)
- [x] Fix real-time notifications for admins/super_admins (2026-04-16)
- [x] Add notification subscriptions to admin dashboard (new_ticket, ticket_queued, pending_tickets) (2026-04-16)
- [x] Enable AHS and First American warranty submissions (2026-04-16)
- [x] Split NLA parts entry into NLA and Available Parts sections (2026-04-16)

## Blocked
_(none currently)_

## Known Issues
- Vite HMR WebSocket connection fails in Replit dev environment (cosmetic — does not affect app functionality)
- E2E tests cannot reliably verify WebSocket-driven toasts across separate browser contexts (testing limitation, not a bug)
