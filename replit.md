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
- `users` - All users (technicians, vrs_agents, admins) with role-based access, isActive toggle
- `submissions` - Authorization requests with two-stage review workflow
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
- POST /api/submissions - Create submission (technician only, auto-assigns to VRS agent)
- GET /api/submissions - List submissions (filtered by role, supports ?allQueue=true, ?completedToday=true, ?stage1Status, ?stage2Status, ?applianceType)
- GET /api/submissions/:id - Get submission detail (access-controlled)
- PATCH /api/submissions/:id/stage1 - Approve/reject Stage 1 + Twilio SMS (vrs_agent only, body: {action, rejectionReason?})
- PATCH /api/submissions/:id/stage2 - Send auth code + Twilio SMS (vrs_agent only, body: {authCode})
- GET /api/agent/stats - Agent queue count, stage2 count, completed today count
- GET /api/agent/warranty-counts - Warranty provider counts for Stage 2 queue (supports ?allQueue=true)
- POST /api/uploads/request-url - Get presigned upload URL (technician only, JSON body: {name, size, contentType})
- GET /objects/{*objectPath} - Serve uploaded files from cloud storage
- GET /api/admin/users - List all users (admin only)
- POST /api/admin/users - Admin create any user type
- PATCH /api/admin/users/:id - Update user details (admin only, supports name, email, password, role, phone, racId, isActive)
- GET /api/admin/users/:id/specializations - Get agent divisions (admin only)
- PATCH /api/admin/users/:id/specializations - Set agent divisions (admin only, body: {divisions: string[]})

### Frontend Pages
- `/login` - Login page (redirects by role)
- `/` - Technician home dashboard (stats, recent submissions)
- `/submit` - New submission form (request type toggle, appliance type, warranty provider with B2B Coming Soon badges)
- `/history` - Submission history list
- `/submissions/:id` - Submission detail/status view (pending, approved, rejected, auth code states)
- `/agent` - VRS Agent dashboard (sidebar nav, split-panel queue/detail, approve/reject actions)
- `/admin` - Admin dashboard (sidebar nav, user management table, division assignments, analytics placeholder)

### Auth Flow
- JWT tokens stored in localStorage
- AuthContext provides user/token/login/logout
- queryClient injects Authorization header via getToken()
- Role-based routing: technicians -> /, agents -> /agent, admins -> /admin
- Bottom navigation (Home, Submit, History) on technician pages only
- Deactivated users (isActive=false) get 403 on login

### Seed Users
- admin@vrs.com / admin123 (admin)
- tech1@vrs.com / tech123 (technician, RAC-78234)
- agent1@vrs.com / agent123 (vrs_agent, specializations: refrigeration, laundry)
- agent2@vrs.com / agent123 (vrs_agent, generalist - all divisions)

### Key Files
- `client/src/lib/auth.tsx` - AuthContext, AuthProvider, useAuth hook, getToken
- `client/src/lib/queryClient.ts` - API request helpers with JWT auth headers
- `client/src/components/bottom-nav.tsx` - Mobile bottom navigation
- `client/src/pages/login.tsx` - Login page
- `client/src/pages/tech-home.tsx` - Technician home dashboard
- `client/src/pages/tech-submit.tsx` - Submission form
- `client/src/pages/tech-history.tsx` - Submission history
- `client/src/pages/submission-detail.tsx` - Submission detail/status
- `client/src/pages/agent-dashboard.tsx` - VRS Agent dashboard with Stage 1/2 queues
- `client/src/pages/admin-dashboard.tsx` - Admin dashboard with user management and division assignments

## Build Phases
- Phase 1: Database schema + Express server + Auth routes [COMPLETE]
- Phase 2: Mobile submission form + submission API + auto-assignment [COMPLETE]
- Phase 3: Desktop Stage 1 queue + approval flow [COMPLETE]
- Phase 4: Desktop Stage 2 queue + auth code flow + Twilio integration [COMPLETE]
- Phase 5: Admin user management + division assignments [COMPLETE]
- Phase 6: Polish, PWA manifest, responsive refinements

## Recent Changes
- 2026-02-10: Phase 1 complete - Database schema, storage layer, JWT auth routes
- 2026-02-10: Phase 2 complete - Mobile submission form, submission API with auto-assignment, technician home/history/detail pages, JWT auth context
- 2026-02-11: Phase 3 complete - VRS Agent desktop dashboard with sidebar navigation, split-panel queue/detail layout, Stage 1 approve/reject workflow, role-based routing
- 2026-02-11: Phase 4 complete - Stage 2 auth code queue with batch processing banner, warranty provider counts, Twilio SMS service, SMS triggers on Stage 1 and Stage 2 actions
- 2026-02-11: Phase 5 complete - Admin dashboard with user management table (CRUD, status toggle), division assignment page with checkbox grid, separate /admin route, isActive field on users, deactivated login check
