# VRS Digital Authorization Platform

## Overview
A full-stack web application for Sears Home Services that replaces the call-in authorization process with a digital submission workflow. Two interfaces: mobile-first PWA for field technicians and desktop dashboard for VRS agents/admins.

## Tech Stack
- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: JWT-based authentication with bcryptjs
- **Routing**: wouter (frontend), Express (backend)
- **Real-time**: WebSocket (ws library) for live push notifications

## Project Architecture

### Database Tables
- `users` - All users (technicians, vrs_agents, admins, super_admin) with role-based access, isActive toggle, isSystemAccount flag for protected accounts
- `technicians` - Field technicians synced from Snowflake (ldapId, name, phone, district, managerName, techUnNo, isActive, lastSyncedAt)
- `submissions` - Authorization requests with two-stage review for AHS/First American warranties (ticketStatus: queued/pending/completed/rejected/invalid, submissionApproved bool + submissionApprovedAt for Stage 1 tracking, technicianLdapId, phoneOverride, rejectionReasons JSON array, agentNotes, reassignmentNotes, reviewedBy, reviewedAt, resubmissionOf for linked resubmissions, appealNotes for resubmission context, invalidReason/invalidInstructions, legacy stage1Status/stage2Status for backward compat)
- `vrs_agent_specializations` - Agent division assignments
- `sms_notifications` - Twilio SMS notification log
- `daily_rgc_codes` - Daily RGC codes for B2B (future)

### Key Files
- `shared/schema.ts` - Drizzle ORM schema definitions and Zod validation schemas
- `server/storage.ts` - Database storage layer with IStorage interface
- `server/routes.ts` - Express API routes
- `server/middleware/auth.ts` - JWT authentication and role-based middleware
- `server/websocket.ts` - WebSocket server with JWT auth, client tracking, broadcast helpers
- `client/src/App.tsx` - React app entry with routing
- `client/src/lib/websocket.ts` - Frontend WebSocket client with auto-reconnect, notification ding
- `client/src/lib/auth.tsx` - AuthContext, AuthProvider, useAuth hook, getToken
- `client/src/lib/queryClient.ts` - API request helpers with JWT auth headers
- `client/src/components/bottom-nav.tsx` - Mobile bottom navigation
- `client/src/pages/agent-dashboard.tsx` - VRS Agent dashboard with unified Queue/My Tickets/Completed workflow
- `client/src/pages/admin-dashboard.tsx` - Admin dashboard with user management and division assignments

### API Endpoints (Implemented)
- POST /api/auth/register - Create new user (technician self-registration only)
- POST /api/auth/login - Authenticate and receive JWT (checks isActive)
- GET /api/auth/me - Get current user (protected)
- POST /api/auth/tech-login - LDAP technician passwordless login (body: {ldapId})
- POST /api/submissions - Create submission (technician only, ticketStatus=queued, assignedTo=null, enters shared division queue)
- GET /api/submissions - List submissions (division-filtered queue for agents, personal pending/completed, supports ?ticketStatus, ?completedToday=true, ?applianceType)
- GET /api/submissions/:id - Get submission detail (access-controlled: agent sees own + shared queued by division)
- PATCH /api/submissions/:id/claim - Claim queued ticket: ticketStatus queued→pending, assignedTo=agent, agent status→working
- PATCH /api/submissions/:id/process - Unified approve/reject/invalid/approve_submission (body: {action, rejectionReasons?, agentNotes?, authCode?}), approve→completed, reject→rejected (tech resubmits new ticket), invalid→invalid, approve_submission→sets submissionApproved=true (ticket stays pending for Stage 2 auth code entry), SMS sent, agent status→online (except approve_submission keeps agent working)
- GET /api/submissions/:id/history - Get submission history chain with reviewer names, resubmission count
- PATCH /api/submissions/:id/reassign - Release pending ticket back to queue (vrs_agent own ticket, body: {notes?}), ticketStatus→queued, assignedTo cleared
- PATCH /api/submissions/:id/correct-division - Agent corrects appliance type mid-review (pending tickets only, body: {newDivision}). If agent has new division: keeps ticket. If not: releases to queue, broadcasts ticket_queued
- GET /api/agent/stats - Queue count, personal pending count, completed today count
- GET /api/agent/rgc-status - Check if agent needs to enter today's RGC code
- POST /api/agent/verify-rgc - Verify agent's RGC code entry (body: {code: "5digits"})
- PATCH /api/agent/status - Agent self-toggle online/offline (vrs_agent only, body: {status: "online"|"offline"})
- POST /api/admin/rgc-code - Set daily RGC code (admin only, body: {code: "5digits", date: "YYYY-MM-DD"})
- GET /api/admin/rgc-code?date=YYYY-MM-DD - Get RGC code for specific date (admin only)
- POST /api/uploads/request-url - Get presigned upload URL (technician only, JSON body: {name, size, contentType})
- GET /objects/{*objectPath} - Serve uploaded files from cloud storage
- GET /api/admin/users - List all users (admin only)
- POST /api/admin/users - Admin create any user type
- PATCH /api/admin/users/:id - Update user details (admin only, supports name, email, password, role, phone, racId, isActive)
- GET /api/agent/specializations - Get own divisions (vrs_agent only)
- PATCH /api/agent/specializations - Set own divisions (vrs_agent only, body: {divisions: string[]})
- GET /api/admin/users/:id/specializations - Get agent divisions (admin only)
- PATCH /api/admin/users/:id/specializations - Set agent divisions (admin only, body: {divisions: string[]})
- PATCH /api/users/me - Self-update firstLogin, lastSeenVersion (authenticated)
- PATCH /api/tech/update-phone - Technician phone update
- POST /api/admin/sync-technicians - Sync technicians from Snowflake (admin only)
- GET /api/admin/technician-metrics - Get technician sync info (admin only)
- POST /api/shsai/query - Query SHSAI service order history (vrs_agent only, body: {serviceOrder})
- POST /api/shsai/followup - Send follow-up question to SHSAI session (vrs_agent only, body: {sessionId, trackId, threadId, message})
- PATCH /api/admin/users/:id/status - Admin force agent status (admin/super_admin, body: {status: "online"|"working"|"offline"})
- GET /api/admin/agent-status - Live list of all agents with name, LDAP ID, status, divisions (admin only)

### WebSocket Architecture
- **Server** (`server/websocket.ts`): Runs on `/ws` path, JWT token as URL query param for authentication
- **Client tracking**: Map<userId, {ws, role, divisions[], agentStatus}> — updated on connect/disconnect
- **Broadcast helpers**: `broadcastToAgent(userId, event)`, `broadcastToDivisionAgents(division, event)`, `broadcastToAdmins(event)`, `updateClientStatus(userId, status)`
- **Events**:
  - `new_ticket` — sent to online agents in matching division on ticket creation
  - `ticket_claimed` — sent to all division agents when a ticket is claimed (removes from queue)
  - `ticket_queued` — sent to division agents when ticket returns to queue (reject/reassign/division correction)
  - `agent_status_changed` — sent to admins when agent status changes
  - `pending_tickets` — sent to agent when going online if queue has matching unassigned tickets
- **Frontend** (`client/src/lib/websocket.ts`): Auto-reconnect with exponential backoff, Web Audio API notification ding, `useWebSocket` hook
- **Agent dashboard**: Toast notifications (8s) for new_ticket/ticket_claimed/ticket_queued/pending_tickets with query cache invalidation
- **Admin dashboard**: Subscribes to `agent_status_changed` to auto-refresh agent status list
- **Logout**: WebSocket disconnected via dynamic import of `disconnectWs()` in auth.tsx

### Division Correction
- Agent can correct appliance type (division) on pending tickets they own via "Correct" dropdown next to Appliance Type in ticket detail
- Confirmation dialog before applying
- If agent has the new division in their specializations: keeps ticket ownership
- If agent does NOT have the new division: ticket released to queue (ticketStatus=queued, assignedTo=null), agent status→online, ticket_queued broadcast sent to agents in new division
- Correction recorded in agentNotes with old/new division labels

### Frontend Pages
- `/` - Landing page (choose user type: Field Technician, VRS Agent, Administrator)
- `/tech/login` - Technician LDAP login (mobile-first, no password)
- `/agent/login` - VRS Agent login (LDAP ID + password, "VRS Agent Portal")
- `/admin/login` - Admin login (LDAP ID + password, "VRS Administration")
- `/tech` - Technician home dashboard (stats, recent submissions)
- `/tech/submit` - New submission form (request type toggle, appliance type, warranty provider with B2B Coming Soon badges)
- `/tech/history` - Submission history list
- `/tech/submissions/:id` - Submission detail/status view (pending, approved, rejected, auth code states)
- `/tech/help` - Help Center page (tabbed: Getting Started, How-To Guides, FAQs, Troubleshooting, searchable accordion)
- `/agent/dashboard` - VRS Agent dashboard (sidebar nav, unified Queue/My Tickets/Completed tabs, claim-to-process workflow, large checkbox action UI, auth code by warranty type, division correction)
- `/admin/dashboard` - Admin dashboard (sidebar nav, user management table, division assignments, analytics, real-time agent status)

### Onboarding & Help System
- First-login wizard: role-based step-by-step modal (5 slides tech, 5 agent, 4 admin)
- What's New modal: shown when app version changes (VITE_APP_VERSION env var)
- Contextual help tooltips: "?" icons next to key UI elements with explanations
- Help Center: comprehensive tabbed page with accordion Q&A, search filter
- Restart Tutorial: available in sidebar footer (agent/admin) and tech home header
- User fields: firstLogin (boolean, default true), lastSeenVersion (varchar)

### Auth Flow
- JWT tokens stored in localStorage
- AuthContext provides user/token/login/logout/refreshUser
- queryClient injects Authorization header via getToken()
- Role-based routing: technicians -> /tech, agents -> /agent/dashboard, admins -> /admin/dashboard
- Bottom navigation (Home, Submit, History, Help) on technician pages only
- Deactivated users (isActive=false) get 403 on login
- Logout disconnects WebSocket

### Unified Ticket Workflow
- ticketStatus values: queued (unassigned, in shared division queue), pending (claimed by agent), completed (approved), rejected (terminal — tech resubmits new ticket), invalid (terminal)
- Claim: queued→pending, agent status→working
- Process: approve→completed, reject→rejected, invalid→invalid, approve_submission→submission approved (ticket stays pending)
- Reject behavior: stays rejected (does NOT return to queued — tech must submit new ticket)
- **Two-stage review (AHS/First American)**: Stage 1 = submission review (approve_submission/reject/invalid); Stage 2 = authorization code entry (approve with external auth code). Agent stays in "working" status between stages. Progress bar shown in UI.
- **Single-stage review (Sears Protect/PA/Legacy)**: Approve with auto RGC code in one step
- Auth code logic: Sears Protect/PA/Legacy = auto RGC read-only; AHS/First American = RGC + external code input; skip for non-authorization requestType
- Reassign: agent releases own pending ticket back to queue
- Division Correction: agent changes appliance type; keeps or releases ticket depending on specializations

### Seed Users
- admin@vrs.com / admin123 (admin)
- tech1@vrs.com / tech123 (technician, tmorri1)
- agent1@vrs.com / agent123 (vrs_agent, specializations: refrigeration, laundry)
- agent2@vrs.com / agent123 (vrs_agent, generalist - all divisions)
- VRS_MASTER / VRS!M@ster2026#Secure (super_admin, isSystemAccount=true, hidden from user list)

## External Dependencies
- **Twilio**: For sending SMS notifications to technicians and for password reset functionalities
- **Snowflake**: Used for synchronizing technician data into the platform's database
- **SHSAI Service**: An external AI service integrated via direct API calls for service order history queries and follow-up questions during the authorization process
- **LDAP Service**: Used for passwordless authentication of technicians and for verifying agent/admin credentials

## User Preferences
- I prefer clear and concise communication.
- I appreciate explanations that are straightforward and to the point.
- I value a structured and organized approach to development tasks.
- I expect the agent to ask for clarification if instructions are ambiguous.
- I prefer detailed explanations for complex solutions or significant changes.
