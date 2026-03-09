# VRS Digital Authorization Platform — User Guide

**Last Updated:** March 2026
**Classification:** INTERNAL USE ONLY — Contains credentials and system architecture details

---

## Table of Contents

1. [What This App Does](#1-what-this-app-does)
2. [URLs and Access Points](#2-urls-and-access-points)
3. [User Roles Explained](#3-user-roles-explained)
4. [Login Credentials](#4-login-credentials)
5. [Technician Experience (Mobile)](#5-technician-experience-mobile)
6. [VRS Agent Experience (Desktop)](#6-vrs-agent-experience-desktop)
7. [Admin Experience (Desktop)](#7-admin-experience-desktop)
8. [Super Admin Role](#8-super-admin-role)
9. [The Ticket Lifecycle — Step by Step](#9-the-ticket-lifecycle--step-by-step)
10. [Two-Stage vs Single-Stage Review](#10-two-stage-vs-single-stage-review)
11. [SMS Notifications](#11-sms-notifications)
12. [WebSocket (Live Updates)](#12-websocket-live-updates)
13. [Division Correction Mid-Review](#13-division-correction-mid-review)
14. [RGC Code System](#14-rgc-code-system)
15. [Password Management](#15-password-management)
16. [Onboarding and Help System](#16-onboarding-and-help-system)
17. [Snowflake Technician Sync](#17-snowflake-technician-sync)
18. [SHSAI (AI Service Order Lookup)](#18-shsai-ai-service-order-lookup)
19. [Admin: Managing Users](#19-admin-managing-users)
20. [Admin: Analytics and Export](#20-admin-analytics-and-export)
21. [Technical Architecture Summary](#21-technical-architecture-summary)
22. [External Services and API Keys](#22-external-services-and-api-keys)
23. [Common Troubleshooting](#23-common-troubleshooting)

---

## 1. What This App Does

This platform replaces the phone-based VRS (Virtual Repair Service) authorization call-in process with a digital workflow. Instead of technicians calling in to get authorization codes, they submit a request through the app with photos and details, and VRS agents review and approve them digitally.

**Two interfaces:**
- **Mobile-first PWA** for field technicians (designed for iPhone/Android use in the field)
- **Desktop dashboard** for VRS agents and administrators

---

## 2. URLs and Access Points

The app is published at its Replit deployment URL (`.replit.app` domain).

| Login Page | URL Path | Who Uses It |
|---|---|---|
| Technician Login | `/tech/login` | Field technicians |
| Agent Login | `/agent/login` | VRS agents |
| Admin Login | `/admin/login` | Admins and super admins |
| Landing Page | `/` | Everyone (choose your role) |

---

## 3. User Roles Explained

| Role | What They Do | Login Method |
|---|---|---|
| **technician** | Submit authorization requests from the field with photos, voice notes, and details | LDAP ID only (no password) |
| **vrs_agent** | Review and process technician submissions, approve/reject/mark invalid | LDAP ID + password |
| **admin** | Manage users, set RGC codes, view analytics, monitor agent status, sync technicians | LDAP ID + password |
| **super_admin** | Same as admin but can also manage other admins; highest permission level | LDAP ID + password |

---

## 4. Login Credentials

### Generic Password (All Real Users)
Every user account (except VRS_MASTER) has been reset to:

**Password:** `VRS2026!`

On first login, every real user will be forced to change their password to something new. The new password must meet these requirements: 8+ characters, at least one uppercase letter, one lowercase letter, one number, and one special character.

### Test Accounts (No Forced Password Change)
These accounts skip the forced password change and go straight to the dashboard. Use them for testing and demos.

| Account | LDAP ID | Password | Role | Notes |
|---|---|---|---|---|
| Test Agent | `testagent1` | `VRS2026!` | vrs_agent | Pre-assigned to all divisions (generalist) |
| Test Admin | `TESTADMIN` | `VRS2026!` | admin | Full admin access |
| Test Tech | `testtech1` | `VRS2026!` | technician | Also in technicians table for LDAP login |
| Tyler Morrison | `tmorri1` | `VRS2026!` | technician | Also in technicians table |
| System Admin | `sysadmin` | `VRS2026!` | admin | Seed admin account |

### Master System Account
| Account | LDAP ID | Password | Role | Notes |
|---|---|---|---|---|
| VRS Master | `VRS_MASTER` | `VRS!M@ster2026#Secure` | super_admin | System account, hidden from user lists, cannot be deleted or deactivated |

### Technician Login (Passwordless)
Technicians do NOT use a password. They enter only their LDAP ID on the technician login page. The system looks them up in the technicians table (synced from Snowflake). If found and active, they are logged in immediately.

Test technician LDAP IDs for passwordless login: `testtech1`, `tmorri1`

---

## 5. Technician Experience (Mobile)

### Login Flow
1. Technician opens the app on their phone
2. Taps "Field Technician" on the landing page
3. Enters their LDAP ID (no password needed)
4. System verifies against the technicians table
5. If successful, shows their phone number on file with option to override it for the session
6. Lands on the technician home dashboard

### Navigation
Bottom navigation bar with four tabs:
- **Home** — Dashboard with stats (pending, approved, rejected counts) and recent submissions
- **Submit** — New authorization request form
- **History** — List of all past submissions with status
- **Help** — Help Center with guides, FAQs, and troubleshooting

### Submitting a Request
1. Tap "Submit" in bottom nav
2. Choose **Request Type**: "Authorization" or "Infestation / Non-Accessible"
3. Select **Appliance Type**: Cooking, Dishwasher/Compactor, Microwave, Laundry, Refrigeration, HVAC, or All Other
4. Select **Warranty Provider**: Sears Protect (SPHW), Sears PA, Cinch, American Home Shield, or First American
   - B2B providers show "Coming Soon" badges
5. Enter **Service Order Number**
6. Upload **Photos** (minimum 2 required — model/serial tag and the issue)
7. Optionally record a **Voice Note** describing the issue
8. Optionally record or upload a **Video**
9. AI generates an **Issue Description** from uploaded photos (powered by OpenAI gpt-5)
10. Review and submit

### After Submitting
- Ticket enters the **queued** state (visible to agents in the matching division)
- Technician receives SMS updates at each stage (claimed, approved, rejected, invalid)
- Can check status on the History page or the submission detail page
- If rejected, technician sees the reason and can tap a link to resubmit with corrections

### Viewing Results
On the submission detail page (`/tech/submissions/:id`):
- **Pending**: Shows "Under Review" status
- **Approved**: Shows the authorization/RGC code to enter in TechHub
- **Rejected**: Shows rejection reasons and a resubmit option
- **Invalid**: Shows reason why VRS cannot process this request

---

## 6. VRS Agent Experience (Desktop)

### Login Flow
1. Agent goes to `/agent/login`
2. Enters LDAP ID and password
3. If first login with generic password: forced to change password
4. If no divisions are set: shown a Division Selection screen to pick which appliance types they handle
5. Lands on the Agent Dashboard

### Division Selection
After first login (or if no specializations are saved), the agent must select which divisions they handle:
- Cooking
- Dishwasher / Compactor
- Microwave
- Laundry
- Refrigeration
- HVAC
- All Other (selecting all makes them a "Generalist")

This controls which tickets appear in their queue. Agents only see tickets matching their selected divisions.

### Dashboard Layout
**Desktop:** Three-column layout
- Left sidebar: Navigation (Queue, My Tickets, Completed, Settings)
- Middle: Ticket list (filterable by division)
- Right: Ticket detail view with full submission info, photos, and action buttons
- Far right: SHSAI panel (AI service order lookup)

**Mobile:** Single-column with list view and tap-to-view detail (back button to return)

### Three Tabs
1. **Queue** — Unassigned tickets in the agent's divisions, sorted newest first. Shows count badge.
2. **My Tickets** — Tickets the agent has claimed and is currently working. Shows count badge.
3. **Completed** — Tickets the agent finished today.

### Agent Status
Agents have three statuses that are tracked in real-time:
- **Online** — Available, can see and claim new tickets
- **Working** — Currently processing a claimed ticket (auto-set when claiming)
- **Offline** — Not active (auto-set when browser/WebSocket disconnects, or manually toggled)

Status is visible to admins on the Agent Status panel.

### Claiming a Ticket
1. Agent clicks on a queued ticket in the Queue tab
2. Clicks "Claim Ticket" button
3. Ticket moves from Queue to My Tickets
4. Agent status automatically changes to "Working"
5. Technician receives an SMS that an agent is reviewing their request
6. All other agents in that division see the ticket disappear from their queue (via WebSocket)

### Processing a Ticket (see Section 10 for two-stage vs single-stage)
After claiming, the agent reviews photos, voice notes, video, and AI-generated description, then chooses an action:
- **Approve** — Issue the authorization code
- **Reject** — Request more info (must provide reasons; can reject specific photos)
- **Invalid** — Mark as not applicable for VRS (must provide reason and instructions)

### Notification Ding
When a new ticket enters the queue matching the agent's divisions, a notification ding sound plays and a toast notification appears in the top-right corner (stays for 8 seconds).

---

## 7. Admin Experience (Desktop)

### Login Flow
1. Admin goes to `/admin/login`
2. Enters LDAP ID and password
3. If first login: forced to change password
4. Lands on the Admin Dashboard

### Dashboard Sections (Sidebar Navigation)

#### Users Tab
- View all users in a sortable, searchable table
- Columns: Name, LDAP ID, Role, Phone, Status (Active/Inactive), Password Status, Divisions
- **Create User**: Add new technicians, agents, or admins manually
- **Edit User**: Click any user row to modify their name, email, phone, LDAP ID, role, or password
- **Deactivate/Reactivate**: Toggle the Active switch — deactivated users cannot log in
- **Delete User**: Permanently remove a user (system accounts and your own account are protected)
- **Reset Password**: Sets user's password back to `VRS2026!` with forced change on next login
- **Assign Divisions**: For VRS agents, select which appliance divisions they handle

#### Agent Status Tab
- Live real-time view of all VRS agents and their current status (Online/Working/Offline)
- Shows each agent's name, LDAP ID, current status, and assigned divisions
- **Force Offline**: Admin can remotely set an agent to Offline (useful if they forgot to log out)
- Auto-refreshes via WebSocket when any agent's status changes

#### RGC Codes Tab
- Set the daily 5-digit RGC code used for Sears Protect authorizations
- Select a date and enter a 5-digit number
- System automatically prefixes with "RGC" (e.g., entering 12345 produces RGC12345)
- This code is auto-applied when agents approve Sears Protect tickets

#### Analytics Tab
- Volume metrics: Today, This Week, This Month, All Time submission counts
- Outcome breakdown: Approval vs. Rejection vs. Pending rates with visual bars
- Performance: Average Stage 1 time, average time to auth code
- **CSV Export**: Download ticket data for custom date ranges (Today, Week, Month, All)
- Export includes: service orders, technician info, reviewer names, timestamps, RGC/auth codes

#### Technician Sync Tab
- Trigger manual sync from Snowflake to update the technician roster
- View total active technicians and last sync timestamp
- New techs are auto-added, existing ones updated, removed ones deactivated

---

## 8. Super Admin Role

Super admins have all the same capabilities as admins, plus:
- Can create and manage other admin accounts
- Can create other super_admin accounts
- The VRS_MASTER account is a super_admin with `isSystemAccount=true`, which means:
  - It is hidden from the user management list
  - It cannot be deleted or deactivated
  - Its password is never reset by bulk operations

---

## 9. The Ticket Lifecycle — Step by Step

```
Technician Submits Request
         |
         v
    [QUEUED] ─── Visible to all online agents in matching division
         |
    Agent Claims
         |
         v
    [PENDING] ─── Assigned to one agent, agent status = "working"
         |
    Agent Reviews...
         |
    ┌────┼────────────────┐
    v    v                v
[APPROVED/     [REJECTED]     [INVALID]
 COMPLETED]        |               |
    |          Tech gets SMS    Tech gets SMS
    |          with reasons     "Not Applicable"
    |          + resubmit link
    |               |
    |          Tech submits
    |          NEW ticket
    |          (linked to original)
    |
Tech gets SMS
with auth code
```

### Status Definitions
| Status | Meaning | What Happens Next |
|---|---|---|
| **queued** | Submitted, waiting for an agent | Any agent in the matching division can claim it |
| **pending** | Claimed by a specific agent | Agent is reviewing; tech sees "Under Review" |
| **completed** | Approved with auth code issued | Tech receives code via SMS; ticket is done |
| **rejected** | Agent needs more info or better photos | Tech can resubmit a new linked ticket |
| **invalid** | Not applicable for VRS processing | Terminal state; tech is notified with reason |

### Reassign (Release to Queue)
An agent can release a pending ticket back to the queue if they can't process it:
- Ticket goes back to **queued** status
- Agent's status goes back to **online**
- All agents in that division see it reappear in their queue
- Optional reassignment notes are saved

---

## 10. Two-Stage vs Single-Stage Review

### Single-Stage Review (Sears Protect, Sears PA, Cinch)
1. Agent claims ticket
2. Agent reviews photos and details
3. Agent clicks **Approve**
4. System automatically pulls today's RGC code and assigns it
5. Ticket immediately moves to **completed**
6. Tech gets SMS with the RGC code

**There is no manual code entry for Sears warranties — the RGC code is auto-applied.**

### Two-Stage Review (American Home Shield, First American)
1. Agent claims ticket
2. **Stage 1 — Submission Review:**
   - Agent reviews photos and details
   - Agent clicks **Approve Submission** (not final approve)
   - Ticket stays in **pending** status but `submissionApproved = true`
   - Tech gets SMS: "Your submission has been reviewed and APPROVED. VRS is now working on obtaining your authorization code."
   - Agent stays in "working" status
   - A progress bar shows Stage 1 complete, Stage 2 pending
3. **Stage 2 — Authorization Code Entry:**
   - Agent obtains the external authorization code from the warranty provider's portal
   - Agent enters the RGC code (auto-filled) AND the external auth code
   - Agent clicks **Approve**
   - Ticket moves to **completed**
   - Tech gets SMS with both codes

**Key difference:** AHS/First American require the agent to get an external code from the provider's system, so there's a waiting period between Stage 1 and Stage 2.

### Reject / Invalid (Both Types)
Works the same regardless of warranty provider:
- **Reject**: Agent selects reasons (checkboxes), can reject specific photos with individual feedback, writes optional notes. Tech gets SMS with reasons and a link to resubmit.
- **Invalid**: Agent selects a reason and provides instructions. Tech gets SMS saying the request is not applicable for VRS.

---

## 11. SMS Notifications

All SMS messages are sent via Twilio to the technician's phone number on file (or their session override number).

| Event | Message Summary |
|---|---|
| **Ticket Claimed (Sears)** | "A VRS agent is now working on your approval." |
| **Ticket Claimed (AHS/First American)** | "A VRS agent is reviewing your photos. Stand by for Stage 1 review, then authorization code." |
| **Submission Approved (Stage 1)** | "Your submission has been APPROVED. VRS is now working on obtaining your authorization code." |
| **Fully Approved** | "Your VRS Authorization for SO#[number]... Your RGC/Auth Code: [code]. Enter this code in TechHub." |
| **Rejected** | "Status: MORE INFO NEEDED. Reason: [reasons]. Tap to resubmit: [link]" |
| **Invalid** | "Status: NOT APPLICABLE. Reason: [reason]. This request cannot be processed through VRS." |
| **Password Reset Code** | "VRS Password Reset — Your reset code is: [6-digit code]. Expires in 15 minutes." |

---

## 12. WebSocket (Live Updates)

The app uses WebSocket connections for real-time push updates. This is invisible to users but makes the experience feel live.

**What agents see in real-time:**
- New ticket notification ding + toast when a ticket enters their division's queue
- Tickets disappear from the queue instantly when another agent claims them
- Tickets reappear in queue when reassigned or division-corrected

**What admins see in real-time:**
- Agent status changes update automatically on the Agent Status panel (online/working/offline)

**How it works behind the scenes:**
- When an agent logs in and goes online, the server checks if there are any unassigned tickets in their divisions and notifies them immediately
- When the WebSocket disconnects (browser closed, network lost), the agent is automatically marked offline
- Auto-reconnect: if the connection drops temporarily, the client reconnects with exponential backoff

---

## 13. Division Correction Mid-Review

If an agent claims a ticket and realizes it was submitted under the wrong appliance type (division), they can correct it without rejecting:

1. In the ticket detail view, click the "Correct" dropdown next to the Appliance Type field
2. Select the correct division from the dropdown
3. Confirm the change in the dialog

**Two outcomes:**
- **Agent HAS the new division in their specializations:** The ticket stays assigned to them, the appliance type is updated, and they continue reviewing
- **Agent does NOT have the new division:** The ticket is released back to the queue with the corrected division, routed to agents who handle that division. The current agent's status goes back to "online" and the ticket detail closes.

A note is automatically added to the ticket recording the correction (old division to new division, who made the change).

---

## 14. RGC Code System

RGC (Requirement Generated Code) is used for Sears Protect, Sears PA, and Cinch warranty authorizations.

**How to set the daily code:**
1. Log in as admin
2. Go to the RGC Codes tab
3. Select today's date
4. Enter a 5-digit number (e.g., 12345)
5. Save — the system stores it as "RGC12345"

**How it's used:**
- When an agent approves a Sears-type ticket, the system automatically looks up today's RGC code
- The code is displayed read-only in the approval form — the agent doesn't type it
- If no RGC code has been set for today, the agent cannot approve Sears tickets (they'll see an error)
- For AHS/First American tickets, the RGC code is still included but the agent also enters an external auth code

**An admin must set the RGC code every day before agents can approve Sears warranty tickets.**

---

## 15. Password Management

### Forced Password Change
- When a user's `mustChangePassword` flag is true, they are locked into a password change screen after login
- They must enter their current password and a new password meeting complexity requirements
- After changing, they proceed to the dashboard normally
- All real users (not test accounts) currently have this flag set

### Self-Service Password Reset (Forgot Password)
1. On the login page, tap "Forgot Password?"
2. Enter your LDAP ID
3. System sends a 6-digit code via SMS to your registered phone number
4. Enter the code and your new password
5. Password is updated, code expires after 15 minutes

### Admin Password Reset
- Admins can reset any user's password from the Users tab
- This sets their password to `VRS2026!` and turns on the forced change flag
- The user will need to change it on next login

### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

---

## 16. Onboarding and Help System

### First-Login Tutorial
When a user logs in for the first time (`firstLogin = true`), they see a step-by-step tutorial wizard:
- **Technicians**: 5 slides covering how to submit, what to photograph, and how to check status
- **Agents**: 5 slides covering the dashboard, claiming tickets, review process, and status management
- **Admins**: 4 slides covering user management, RGC codes, analytics, and agent monitoring

### What's New Modal
When the app version changes (controlled by `VITE_APP_VERSION` environment variable), users see a "What's New" modal showing recent updates. Their `lastSeenVersion` is updated so they only see it once per version.

### Contextual Help
Small "?" icons appear next to key UI elements throughout the app. Hovering/tapping shows a tooltip explanation.

### Help Center (Technicians)
Available at `/tech/help` with tabs:
- Getting Started
- How-To Guides
- FAQs
- Troubleshooting
All content is searchable via a filter bar.

### Restart Tutorial
Users can re-trigger the onboarding tutorial:
- Agents/Admins: Available in the sidebar footer
- Technicians: Available in the home page header

---

## 17. Snowflake Technician Sync

The technicians table is populated from a Snowflake data warehouse.

**Source table:** `PRD_TPMS.HSTECH.COMTTU_TECH_UN`
**Filters applied:** `TECH_STS_CD = 'A'` (active status), `ACTIVE_IND = 'Y'` (active indicator), non-null phone number

**What it syncs:**
- LDAP ID, Name, Phone, District, Manager Name, Tech Unit Number
- New technicians are added automatically
- Existing technician details are updated
- Technicians no longer in Snowflake are deactivated (not deleted)

**How to trigger a sync:**
1. Log in as admin
2. Go to the Technician Sync section
3. Click the sync button
4. View results showing how many were added, updated, or deactivated

**This is how technicians get into the system.** If a technician can't log in, they may not be in Snowflake with an active status, or a sync hasn't been run recently.

---

## 18. SHSAI (AI Service Order Lookup)

The SHSAI panel appears on the right side of the agent dashboard (desktop only, hidden on mobile).

**What it does:**
- Agents can enter a service order number to query the SHSAI external AI service
- Returns service order history, previous visits, part orders, and diagnostic information
- Agents can ask follow-up questions in a chat-like interface
- Helps agents make informed decisions during the review process

**How to use it:**
1. While reviewing a ticket, look at the SHSAI panel on the right
2. Enter the service order number (often auto-populated from the ticket)
3. Click Query to get service history
4. Read the AI-generated summary
5. Type follow-up questions if needed

---

## 19. Admin: Managing Users

### Creating a New User
1. Go to Users tab
2. Click "Add User" button
3. Fill in: Name, LDAP ID (RAC ID), Role, Phone (optional), Email (optional)
4. Set a temporary password (or leave as default)
5. Save — user can now log in and will be forced to change password

### Editing a User
1. Click on the user row in the table
2. Modify any field: Name, Email, Phone, LDAP ID, Role, Password
3. Save changes

### Deactivating a User
1. Click on the user
2. Toggle the Active switch to Off
3. Save — the user can no longer log in but their historical data is preserved

### Assigning Divisions to an Agent
1. Click on a VRS agent user
2. In the Divisions section, check/uncheck the relevant divisions
3. Save — the agent will only see tickets for their selected divisions
4. Selecting all divisions makes them a "Generalist"

### Bulk Operations
- Bulk division assignment: Select multiple agents and apply the same division set to all of them
- Bulk import: Upload agents/admins from a CSV file

---

## 20. Admin: Analytics and Export

### Dashboard Metrics
- **Volume**: Submissions today, this week, this month, all time
- **Outcomes**: Approval rate, rejection rate, pending rate (with visual bars)
- **Performance**: Average time from claim to Stage 1 approval, average time to auth code issuance

### CSV Export
1. Go to Analytics tab
2. Select date range: Today, This Week, This Month, or All Time
3. Click Export
4. Downloads a CSV with columns: Service Order, Technician Name, Technician LDAP, Appliance Type, Warranty Provider, Status, Reviewer Name, Submitted At, Reviewed At, Auth Code, RGC Code, Agent Notes

---

## 21. Technical Architecture Summary

| Layer | Technology |
|---|---|
| Backend | Node.js + Express + TypeScript |
| Frontend | React + Vite + TailwindCSS + shadcn/ui |
| Database | PostgreSQL with Drizzle ORM |
| Authentication | JWT tokens (stored in localStorage) |
| Real-time | WebSocket (ws library) on `/ws` path |
| SMS | Twilio |
| AI Descriptions | OpenAI (gpt-5) |
| Technician Data | Snowflake |
| File Storage | Replit Object Storage (presigned upload URLs) |
| Routing (frontend) | wouter |

### Key Files
| File | Purpose |
|---|---|
| `shared/schema.ts` | Database table definitions and validation schemas |
| `server/routes.ts` | All API endpoints |
| `server/storage.ts` | Database query layer |
| `server/websocket.ts` | WebSocket server, broadcast helpers |
| `server/seed.ts` | Seed data and startup password reset |
| `server/middleware/auth.ts` | JWT verification and role-based access |
| `server/sms.ts` | SMS notification templates and sending |
| `server/services/snowflake.ts` | Snowflake connection and sync logic |
| `client/src/App.tsx` | Frontend routing and app shell |
| `client/src/lib/auth.tsx` | Auth context, login/logout, token management |
| `client/src/lib/websocket.ts` | Frontend WebSocket client with auto-reconnect |
| `client/src/lib/queryClient.ts` | API request helpers with JWT headers |
| `client/src/pages/agent-dashboard.tsx` | VRS Agent dashboard |
| `client/src/pages/admin-dashboard.tsx` | Admin dashboard |
| `client/src/pages/tech-submit.tsx` | Technician submission form |
| `client/src/components/ui/password-input.tsx` | Password field with show/hide toggle |

### Database Tables
| Table | Purpose |
|---|---|
| `users` | All user accounts (techs, agents, admins, super_admins) |
| `technicians` | Field technician roster (synced from Snowflake) |
| `submissions` | Authorization requests/tickets |
| `vrs_agent_specializations` | Agent-to-division assignments |
| `sms_notifications` | Log of all SMS messages sent |
| `daily_rgc_codes` | Daily RGC codes by date |

---

## 22. External Services and API Keys

All API keys are stored as environment secrets in Replit. **Never hard-code these values.**

| Service | Environment Variables | Purpose |
|---|---|---|
| **Twilio** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Sending SMS to technicians |
| **OpenAI** | `OPENAI_API_KEY` | AI-powered issue descriptions from photos (gpt-5) |
| **Replit Object Storage** | `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR` | Cloud file storage for uploaded photos/videos |
| **PostgreSQL** | `DATABASE_URL` | Database connection (auto-configured by Replit) |
| **Session** | `SESSION_SECRET` | JWT signing secret |
| **VRS Master** | `VRS_MASTER_PASSWORD` | Master admin password reference |
| **Snowflake** | Configured in `server/services/snowflake.ts` | Technician data sync |

---

## 23. Common Troubleshooting

### "Invalid credentials" on login
- Verify the LDAP ID is entered correctly (case-sensitive)
- Password should be `VRS2026!` unless the user has already changed it
- Check if the user account is active (admins can check in the Users tab)
- For technicians: they must use the Technician Login page (no password), not the Agent/Admin login

### Technician can't log in
- They must be in the `technicians` table (synced from Snowflake)
- Run a Snowflake sync from the admin dashboard
- Verify their LDAP ID in Snowflake has `TECH_STS_CD = 'A'` and `ACTIVE_IND = 'Y'`

### Agent doesn't see tickets in queue
- Check that the agent has selected divisions (Settings > Division Selection)
- Make sure the agent's status is "Online" (not "Offline")
- Verify tickets exist in the queue for their selected divisions

### RGC code not working / "No RGC code set"
- An admin must set the RGC code for today's date before agents can approve Sears tickets
- Go to Admin Dashboard > RGC Codes > set today's code

### SMS not being received
- Verify the technician's phone number is correct in the system
- Check the `sms_notifications` table for delivery status
- Verify Twilio credentials are valid and the account has balance

### Agent shows "Working" but isn't on a ticket
- Admin can force the agent offline from the Agent Status panel
- Agent can also toggle their own status from the dashboard sidebar

### App not loading / blank page
- Check that the "Start application" workflow is running
- If it crashed, restart it
- Check for port conflicts (EADDRINUSE error in logs)

### Password change fails
- The user must enter their CURRENT password correctly (the generic one: `VRS2026!`)
- The new password must meet all complexity requirements
- If they've already changed it and forgot, an admin can reset it, or they can use "Forgot Password" with SMS

---

**End of Document**

*This document contains sensitive credentials and system architecture details. Distribute only to authorized personnel who will be maintaining or operating this platform.*
