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
- `users` - All users (technicians, vrs_agents, admins) with role-based access
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
- POST /api/auth/login - Authenticate and receive JWT
- GET /api/auth/me - Get current user (protected)
- POST /api/submissions - Create submission (technician only, auto-assigns to VRS agent)
- GET /api/submissions - List submissions (filtered by role: technician sees own, agent sees assigned)
- GET /api/submissions/:id - Get submission detail (access-controlled)
- POST /api/admin/users - Admin create any user type

### Frontend Pages
- `/login` - Login page (redirects to / if authenticated)
- `/` - Technician home dashboard (stats, recent submissions)
- `/submit` - New submission form (request type toggle, appliance type, warranty provider with B2B Coming Soon badges)
- `/history` - Submission history list
- `/submissions/:id` - Submission detail/status view (pending, approved, rejected, auth code states)

### Auth Flow
- JWT tokens stored in localStorage
- AuthContext provides user/token/login/logout
- queryClient injects Authorization header via getToken()
- ProtectedRoute redirects to /login if unauthenticated
- Bottom navigation (Home, Submit, History) on all protected pages

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

## Build Phases
- Phase 1: Database schema + Express server + Auth routes [COMPLETE]
- Phase 2: Mobile submission form + submission API + auto-assignment [COMPLETE]
- Phase 3: Desktop Stage 1 queue + approval flow
- Phase 4: Desktop Stage 2 queue + auth code flow + Twilio integration
- Phase 5: Admin user management + division assignments
- Phase 6: Polish, PWA manifest, responsive refinements

## Recent Changes
- 2026-02-10: Phase 1 complete - Database schema, storage layer, JWT auth routes
- 2026-02-10: Phase 2 complete - Mobile submission form, submission API with auto-assignment, technician home/history/detail pages, JWT auth context
