# VRS Digital Authorization Platform

## Overview
A full-stack web application for Sears Home Services that replaces the call-in authorization process with a digital submission workflow. Two interfaces: mobile-first PWA for field technicians and desktop dashboard for VRS agents/admins.

## Tech Stack
- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: JWT-based authentication with bcryptjs
- **Routing**: wouter (frontend), Express (backend)

## Project Architecture

### Database Tables
- `users` - All users (technicians, vrs_agents, admins, super_admin) with role-based access, isActive toggle, isSystemAccount flag for protected accounts
- `technicians` - Field technicians synced from Snowflake (ldapId, name, phone, district, managerName, techUnNo, isActive, lastSyncedAt)
- `submissions` - Authorization requests with unified single-stage review workflow (ticketStatus: queued/pending/completed/rejected/invalid, technicianLdapId, phoneOverride, rejectionReasons JSON array, agentNotes, reassignmentNotes, reviewedBy, reviewedAt, resubmissionOf for linked resubmissions, appealNotes for resubmission context, invalidReason/invalidInstructions, legacy stage1Status/stage2Status for backward compat)
- `vrs_agent_specializations` - Agent division assignments
- `sms_notifications` - Twilio SMS notification log
- `daily_rgc_codes` - Daily RGC codes for B2B (future)

### Key Files
- `shared/schema.ts` - Drizzle ORM schema definitions and Zod validation schemas
- `server/storage.ts` - Database storage layer with IStorage interface
- `server/routes.ts` - Express API routes
- `server/middleware/auth.ts` - JWT authentication and role-based middleware
- `client/src/App.tsx` - React app entry with routing

### API Endpoints (Implemented)
- POST /api/auth/register - Create new user (technician self-registration only)
- POST /api/auth/login - Authenticate and receive JWT (checks isActive)
- GET /api/auth/me - Get current user (protected)
- POST /api/submissions - Create submission (technician only, ticketStatus=queued, assignedTo=null, enters shared division queue)
- GET /api/submissions - List submissions (division-filtered queue for agents, personal pending/completed, supports ?ticketStatus, ?completedToday=true, ?applianceType)
- GET /api/submissions/:id - Get submission detail (access-controlled: agent sees own + shared queued by division)
- PATCH /api/submissions/:id/claim - Claim queued ticket: ticketStatus queued→pending, assignedTo=agent, agent status→working
- PATCH /api/submissions/:id/process - Unified approve/reject/invalid (body: {action, rejectionReasons?, agentNotes?, authCode?}), approve→completed, reject→rejected (tech resubmits new ticket), invalid→invalid, SMS sent, agent status→online
- GET /api/submissions/:id/history - Get submission history chain with reviewer names, resubmission count
- PATCH /api/submissions/:id/reassign - Release pending ticket back to queue (vrs_agent own ticket, body: {notes?}), ticketStatus→queued, assignedTo cleared
- GET /api/agent/stats - Queue count, personal pending count, completed today count
- GET /api/agent/rgc-status - Check if agent needs to enter today's RGC code
- POST /api/agent/verify-rgc - Verify agent's RGC code entry (body: {code: "5digits"})
- POST /api/admin/rgc-code - Set daily RGC code (admin only, body: {code: "5digits", date: "YYYY-MM-DD"})
- GET /api/admin/rgc-code?date=YYYY-MM-DD - Get RGC code for specific date (admin only)
- POST /api/uploads/request-url - Get presigned upload URL (technician only, JSON body: {name, size, contentType})
- GET /objects/{*objectPath} - Serve uploaded files from cloud storage
- GET /api/admin/users - List all users (admin only)
- POST /api/admin/users - Admin create any user type
- PATCH /api/admin/users/:id - Update user details (admin only, supports name, email, password, role, phone, racId, isActive)
- GET /api/admin/users/:id/specializations - Get agent divisions (admin only)
- PATCH /api/admin/users/:id/specializations - Set agent divisions (admin only, body: {divisions: string[]})
- PATCH /api/users/me - Self-update firstLogin, lastSeenVersion (authenticated)
- POST /api/auth/tech-login - LDAP technician passwordless login (body: {ldapId})
- PATCH /api/tech/update-phone - Technician phone update
- POST /api/admin/sync-technicians - Sync technicians from Snowflake (admin only)
- GET /api/admin/technician-metrics - Get technician sync info (admin only)
- POST /api/shsai/query - Query SHSAI service order history (vrs_agent only, body: {serviceOrder})
- POST /api/shsai/followup - Send follow-up question to SHSAI session (vrs_agent only, body: {sessionId, trackId, threadId, message})
- PATCH /api/agent/status - Agent self-toggle online/offline (vrs_agent only, body: {status: "online"|"offline"})
- PATCH /api/admin/users/:id/status - Admin force agent status (admin/super_admin, body: {status: "online"|"working"|"offline"})
- GET /api/admin/agent-status - Live list of all agents with name, LDAP ID, status, divisions (admin only)

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
- `/agent/dashboard` - VRS Agent dashboard (sidebar nav, unified Queue/My Tickets/Completed tabs, claim-to-process workflow, large checkbox action UI, auth code by warranty type)
- `/admin/dashboard` - Admin dashboard (sidebar nav, user management table, division assignments, analytics)

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

### Seed Users
- admin@vrs.com / admin123 (admin)
- tech1@vrs.com / tech123 (technician, tmorri1)
- agent1@vrs.com / agent123 (vrs_agent, specializations: refrigeration, laundry)
- agent2@vrs.com / agent123 (vrs_agent, generalist - all divisions)
- VRS_MASTER / VRS!M@ster2026#Secure (super_admin, isSystemAccount=true, hidden from user list)

### Key Files
- `client/src/lib/auth.tsx` - AuthContext, AuthProvider, useAuth hook, getToken
- `client/src/lib/queryClient.ts` - API request helpers with JWT auth headers
- `client/src/components/bottom-nav.tsx` - Mobile bottom navigation
- `client/src/pages/login.tsx` - Login page
- `client/src/pages/tech-home.tsx` - Technician home dashboard
- `client/src/pages/tech-submit.tsx` - Submission form
- `client/src/pages/tech-history.tsx` - Submission history
- `client/src/pages/submission-detail.tsx` - Submission detail/status
- `client/src/pages/agent-dashboard.tsx` - VRS Agent dashboard with unified Queue/My Tickets/Completed workflow
- `client/src/pages/admin-dashboard.tsx` - Admin dashboard with user management and division assignments

## Build Phases
- Phase 1: Database schema + Express server + Auth routes [COMPLETE]
- Phase 2: Mobile submission form + submission API + auto-assignment [COMPLETE]
- Phase 3: Desktop Stage 1 queue + approval flow [COMPLETE]
- Phase 4: Desktop Stage 2 queue + auth code flow + Twilio integration [COMPLETE]
- Phase 5: Admin user management + division assignments [COMPLETE]
- Phase 6: Polish, PWA manifest, responsive refinements [COMPLETE]

## Recent Changes
- 2026-02-10: Phase 1 complete - Database schema, storage layer, JWT auth routes
- 2026-02-10: Phase 2 complete - Mobile submission form, submission API with auto-assignment, technician home/history/detail pages, JWT auth context
- 2026-02-11: Phase 3 complete - VRS Agent desktop dashboard with sidebar navigation, split-panel queue/detail layout, Stage 1 approve/reject workflow, role-based routing
- 2026-02-11: Phase 4 complete - Stage 2 auth code queue with batch processing banner, warranty provider counts, Twilio SMS service, SMS triggers on Stage 1 and Stage 2 actions
- 2026-02-11: Phase 5 complete - Admin dashboard with user management table (CRUD, status toggle), division assignment page with checkbox grid, separate /admin route, isActive field on users, deactivated login check
- 2026-02-11: Phase 6 complete - PWA manifest (VRS Submit, Sears blue #003366), install prompt banner, admin analytics (submission counts, approval rates, processing times), confirmation modals for destructive actions (reject, deactivate), session expiration handling (401 redirect to login), user-facing 404 page
- 2026-02-18: Snowflake technician sync + LDAP login - technicians table synced from Snowflake via key-pair auth, passwordless LDAP login flow with dual-tab login page, shadow user creation for FK compatibility, phone override support, admin technician sync dashboard section
- 2026-02-19: Master admin account + super_admin role - isSystemAccount flag, VRS_MASTER account hidden from user list, protected from modification/deletion, super_admin bypasses all role checks, LDAP ID login with forced password change for CSV-imported users
- 2026-02-19: SHSAI direct API integration - replaced iframe with direct API calls to SHSAI service (init session + prompt), auto-queries on Stage 2 ticket selection, follow-up chat input, retry on error, fresh session per ticket
- 2026-02-19: Password reset features - Admin permission check (admins can only reset agent/tech passwords, super_admin can reset anyone), self-service forgot password via SMS (6-digit code, 15-min expiry, Twilio), forgot password UI on agent/admin login pages, passwordResetToken/passwordResetExpires columns added to users
- 2026-02-19: Shared division queue workflow - Tickets submit unassigned (assignedTo=null), Stage 1 is shared division queue filtered by agent specializations, Stage 1 approval assigns ticket to approving agent, Stage 2 is personal queue, removed My Assignments toggle, admin reassign endpoint for Stage 2 tickets, division-based stats counting, multi-agent division assignments in admin dashboard, ticket deletion restricted to admin/super_admin only
- 2026-03-02: VRS team feedback batch - Video on resubmit (persist original, allow replace/remove), appeal notes field on resubmit form, submission history thread view (chronological timeline on tech detail page), resubmission limit (max 3, enforced server-side), "Invalid" Stage 1 status (reason dropdown, instructions textarea, SMS notification, no resubmit allowed), invalid status display across agent dashboard and tech views
- 2026-03-04: Agent Status System + Queue Filtering Fix - agentStatus column on users (online/working/offline, default offline), PATCH /api/agent/status (agent self-toggle online/offline), PATCH /api/admin/users/:id/status (admin force status), GET /api/admin/agent-status (live agent list with divisions), auto-set working on ticket open, auto-reset to online after Stage 1/2 review, login popup asking agent to go online, persistent offline banner, online/offline toggle in sidebar header with colored status dots, admin Agent Status tab with force-offline, division filtering enforced strictly (no divisions = empty queue, 403 on out-of-division ticket access), Dishwasher label updated to "Dishwasher / Compactor"
- 2026-03-04: Inline division assignment in Create/Edit User dialog - Division checkboxes shown inside user dialog when role is VRS Agent, divisions auto-loaded when editing existing agent, saved alongside user create/update via chained API calls, Generalist (All Divisions) toggle, scrollable dialog for smaller screens
- 2026-03-04: Unified single-stage ticket workflow - Replaced two-stage (Stage 1 + Stage 2) system with unified ticketStatus flow (queued→pending→completed/rejected/invalid). New columns: ticketStatus, rejectionReasons, agentNotes, reassignmentNotes, reviewedBy, reviewedAt. New endpoints: PATCH /claim (agent claims queued ticket), PATCH /process (unified approve/reject/invalid). Agent dashboard tabs: Queue/My Tickets/Completed. Large checkbox action UI (Approve/Reject/Invalid). Rejection reason checkboxes (No pictures sent, Picture doesn't show voltage, Need more pictures, Incomplete pictures, Video blurry). Auth code logic by warranty: Sears Protect/PA/Legacy = auto RGC read-only, AHS/First American = RGC + external code input, skip for non-authorization requests. Mid-ticket reassignment: agent can release own pending ticket back to queue. Rejected tickets stay rejected (tech resubmits new ticket). Tech pages updated for ticketStatus with backward compat.
