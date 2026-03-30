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
- **VRS Agent:** Login, Dashboard (unified Queue, My Tickets, Completed views), supporting claim-to-process workflow, division correction.
- **Admin:** Login, Dashboard (user management, division assignments, analytics with resubmission rate tracking and district-level rollup, real-time agent status, ticket overview with FIFO queue, clickable audit trail per ticket, technician feedback management).
- **Technician Feedback:** Technicians can submit feedback (issue, improvement, general) with priority and optional attachments from /tech/feedback. Admins manage feedback from the "Technician Feedback" view in the admin dashboard with status tracking (new, in_progress, resolved, dismissed) and admin notes.

## External Dependencies
- **Twilio:** Used for sending SMS notifications to technicians.
- **Snowflake:** Integrates for synchronizing technician data into the platform's database.
- **SHSAI Service:** An external AI service for querying service order history and handling follow-up questions during the authorization process.
- **LDAP Service:** Utilized for secure authentication of technicians (passwordless) and verifying credentials for agents and administrators.