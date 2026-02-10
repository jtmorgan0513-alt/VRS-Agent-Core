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
- POST /api/auth/register - Create new user
- POST /api/auth/login - Authenticate and receive JWT
- GET /api/auth/me - Get current user (protected)

### Seed Users
- admin@vrs.com / admin123 (admin)
- tech1@vrs.com / tech123 (technician, RAC-78234)
- agent1@vrs.com / agent123 (vrs_agent)

## Build Phases
- Phase 1: Database schema + Express server + Auth routes [COMPLETE]
- Phase 2: Mobile submission form + basic submission API
- Phase 3: Desktop Stage 1 queue + approval flow
- Phase 4: Desktop Stage 2 queue + auth code flow + Twilio integration
- Phase 5: Admin user management + division assignments
- Phase 6: Polish, PWA manifest, responsive refinements

## Recent Changes
- 2026-02-10: Phase 1 complete - Database schema, storage layer, JWT auth routes
