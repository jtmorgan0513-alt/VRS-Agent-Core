# VRS Digital Authorization Platform

## Overview
The VRS Digital Authorization Platform is a full-stack web application designed for Sears Home Services. It digitalizes the authorization process, moving away from traditional call-in methods. The platform features two distinct interfaces: a mobile-first Progressive Web Application (PWA) for field technicians and a desktop dashboard for VRS agents and administrators. This system aims to streamline workflows, improve efficiency in authorization requests, and enhance communication between technicians and agents.

## User Preferences
- I prefer clear and concise communication.
- I appreciate explanations that are straightforward and to the point.
- I value a structured and organized approach to development tasks.
- I expect the agent to ask for clarification if instructions are ambiguous.
- I prefer detailed explanations for complex solutions or significant changes.

## System Architecture
The application is built with a robust architecture utilizing a modern tech stack. The backend is powered by Node.js, Express, and TypeScript, while the frontend is developed with React, Vite, TailwindCSS, and shadcn/ui. PostgreSQL is used as the database, managed with Drizzle ORM. Authentication is handled via JWT with bcryptjs.

Key architectural patterns include:
- **Role-Based Access Control (RBAC):** Users (technicians, VRS agents, admins, super_admins) have distinct roles with varying access permissions.
- **Two-Stage Submission Review:** Authorization requests, particularly for AHS/First American warranties, undergo a two-stage review process to manage initial approval and subsequent authorization code entry.
- **Real-time Communication:** A WebSocket server (ws library) facilitates live push notifications for critical events like new tickets, claimed tickets, and agent status changes, ensuring immediate updates across the platform.
- **Resubmission Auto-Assignment:** When a technician resubmits a rejected ticket, it auto-assigns back to the original reviewing agent (pending status, bypasses queue) if the agent is online or working. If the agent is offline, the resubmission routes to the general queue to avoid delays. Only the resubmission goes back — previous attempts stay as-is. Includes ownership validation (tech can only resubmit their own tickets) and a blue "Resubmission" badge in the agent's ticket list.
- **Unified Ticket Workflow:** Submissions progress through defined `ticketStatus` states (queued, pending, completed, rejected, invalid) managed by agents.
- **Division Auto-Assignment:** Admins and super_admins automatically access all divisions, while VRS agents can select their specializations, influencing ticket routing.
- **Division Correction:** Agents can correct the appliance type mid-review, with intelligent handling of ticket ownership based on their assigned divisions.
- **Comprehensive Onboarding & Help System:** Features first-login wizards, "What's New" modals, contextual help tooltips, and a searchable Help Center to guide users.
- **Mobile-First Design:** The technician PWA and agent/admin dashboards are designed with responsiveness in mind, adapting to various screen sizes.
- **Dark Mode:** App-wide dark mode toggle via `ThemeProvider` (`client/src/components/theme-provider.tsx`) using Tailwind's `darkMode: ["class"]`. Persists user preference to `localStorage` (key `vrs-theme`) with OS preference fallback. Toggle buttons in tech header (icon-only), agent sidebar footer, and admin sidebar footer.

**Frontend Pages:**
- **Technician:** Login, Home, Submission Form, History, Submission Detail, Help Center.
- **VRS Agent:** Login, Dashboard (unified Queue, My Tickets, Completed views + dedicated NLA Queue, NLA My Tickets, NLA Completed sub-tabs), supporting claim-to-process workflow, division correction. SHSAI panel is suppressed for NLA tickets.
- **Admin:** Login, Dashboard (user management, division assignments, analytics with resubmission rate tracking, district-level rollup, and NLA analytics card, real-time agent status, ticket overview with FIFO queue and request type filter (All/Authorization Only/NLA Only), clickable audit trail per ticket, technician feedback management, export with CSV + XLSX).
- **Technician Feedback:** Technicians can submit feedback (issue, improvement, general) with priority and optional attachments from /tech/feedback. Admins manage feedback from the "Technician Feedback" view in the admin dashboard with status tracking (new, in_progress, resolved, dismissed) and admin notes.

## NLA (Parts No Longer Available)
- "nla" is a standalone agent specialization/division, independent of appliance type divisions.
- NLA tickets (`requestType === "parts_nla"`) route to agents with the "nla" specialization via WebSocket `broadcastToNlaDivisionAgents(applianceType, event)`.
- Agent dashboard has dedicated NLA sub-tabs (NLA Queue, NLA My Tickets, NLA Completed) in the sidebar, using amber-colored badges and `Package` icon.
- NLA tickets are excluded from standard queue/pending/completed counts; separate `getNlaQueuedCount`, `getNlaPendingCount`, `getNlaCompletedTodayCount` storage methods provide NLA-specific counts.
- `getNlaQueuedCount(divisions?)` and `getNlaCompletedTodayCount(agentId?, divisions?)` accept optional appliance-type divisions array for division-based filtering.
- **NLA Division Filtering:** NLA agents only see NLA tickets matching their appliance type specializations. Generalists (agents with all appliance divisions) see all NLA tickets. Division filters in sidebar are visible for NLA views. Claim guard checks agent's appliance divisions against ticket's applianceType.
- Admin ticket overview supports filtering by request type (All / Authorization Only / NLA Only).
- Admin analytics includes an NLA Parts Submissions card (Today/Week/Month/All Time).
- XLSX export (`/api/admin/export-xlsx`) produces a 2-sheet workbook: Sheet 1 "Authorization Tickets" and Sheet 2 "NLA Parts Tickets" with Part Numbers, NLA Resolution, Found Part Number columns. Uses `exceljs` package.
- Admins and super_admins automatically receive "nla" division assignment via seed.ts.
- **NLA Resolution Actions:** Dedicated `/api/submissions/:id/process-nla` route (separate from standard `/process` route). Eight NLA-specific actions: `nla_replacement_submitted`, `nla_replacement_tech_initiates`, `nla_part_found_vrs_ordered`, `nla_part_found_tech_orders`, `nla_reject`, `nla_invalid`, `nla_escalate_to_pcard`, `nla_pcard_confirm`. Dropdown UI uses Select component with verbose management-specified labels.
- **Mandatory Instructions for Technician:** `technicianMessage` field is required for all NLA actions. Backend returns 400 if empty; frontend disables submit buttons and shows toast validation.
- **P-Card System:** `canOrderParts` boolean on users table. Only P-card agents can finalize `part_found_vrs_ordered` actions. Non-P-card agents escalate to P-card agents (`nla_escalate_to_pcard` action), which sends the ticket back to the NLA queue with `nlaEscalatedBy` set. Escalated tickets show "Ready for Order" badge in queue and are restricted to P-card agents for claiming.
- **P-Card Admin Toggle:** Admin user management includes a P-card toggle (visible for vrs_agent/admin roles). P-card badge displayed in user list.
- **Technician NLA Detail:** Completed NLA tickets display resolution type (including replacement_tech_initiates), part number (for tech_orders), and agent instructions on the technician submission detail page.

## Ticket Timing
- `claimedAt` timestamp records when an agent first claims a ticket, set in claim route and resubmission auto-assignment.
- Admin ticket overview timing columns: Queue Wait (createdAt → claimedAt), Handle Time (claimedAt → statusChangedAt), Total Time (createdAt → statusChangedAt).
- Graceful fallbacks for tickets without claimedAt (pre-existing data).

## Notification Sound System
- 5 tone options: Chime, Bell, Pulse, Cascade, Alert — selectable by admins in the sidebar sound controls.
- Volume slider 0–100%.
- Settings saved server-side in `system_settings` table (`notification_tone`, `notification_volume`) via `/api/settings/notification-tone` GET/PUT.
- All agents load settings on dashboard init via `loadNotificationSettings()` in `client/src/lib/websocket.ts`.

## External Dependencies
- **Twilio:** Used for sending SMS notifications to technicians.
- **Snowflake:** Integrates for synchronizing technician data into the platform's database. Also provides ProcID (CMB_THD_PTY_ID) and Client Name lookup per service order via `fetchProcIdForServiceOrder` in `server/services/snowflake.ts`, stored as `procId` and `clientNm` on the submissions table.
- **SHSAI Service:** An external AI service for querying service order history and handling follow-up questions during the authorization process.
- **LDAP Service:** Utilized for secure authentication of technicians (passwordless) and verifying credentials for agents and administrators.