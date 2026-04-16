# VRS Digital Authorization Platform - Claude AI Instructions

## 🔴 MANDATORY: After Every Change
Before completing ANY task, you MUST:
1. Update `CHANGELOG.md` under [Unreleased]
2. Update `.claude/memory/context.md` with new context
3. Update `.claude/memory/todos.md` - check off done, add new
4. Update `.claude/memory/decisions.md` for architectural choices

**Do not consider a task complete until these are updated.**

---

## Project Overview

Sears Home Services digital authorization platform — replaces call-in workflows with a mobile PWA for field technicians and a desktop dashboard for VRS agents/admins. Technicians submit authorization requests with photos, agents review and process them in real-time, and admins manage users, analytics, and exports.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 20, TypeScript |
| **Backend** | Express 4, WebSocket (`ws`) for real-time |
| **Frontend** | React 18, Vite, TailwindCSS, shadcn/ui |
| **Database** | PostgreSQL (Neon), Drizzle ORM |
| **Auth** | JWT (jsonwebtoken) + bcryptjs, RBAC (technician / vrs_agent / admin / super_admin) |
| **File Storage** | Google Cloud Storage (Replit Object Storage integration) |
| **SMS** | Twilio |
| **AI** | OpenAI (description enhancement) |
| **External** | Snowflake (tech sync, ProcID lookup), LDAP (auth verification), SHSAI (service order history) |
| **Export** | ExcelJS (XLSX), csv-stringify (CSV) |
| **Routing** | wouter (frontend) |
| **Data Fetching** | TanStack Query v5 |

## File Structure

```
├── client/src/
│   ├── pages/                    # All page components
│   │   ├── tech-login.tsx        # Technician login (LDAP ID, no password)
│   │   ├── tech-home.tsx         # Technician home / dashboard
│   │   ├── tech-submit.tsx       # Submission form (photos, NLA parts split)
│   │   ├── tech-history.tsx      # Submission history list
│   │   ├── tech-resubmit.tsx     # Resubmit rejected tickets
│   │   ├── tech-feedback.tsx     # Feedback form (issue/improvement/general)
│   │   ├── submission-detail.tsx # Technician submission detail view
│   │   ├── agent-login.tsx       # Agent login page
│   │   ├── agent-dashboard.tsx   # Agent queue, my tickets, NLA tabs
│   │   ├── admin-login.tsx       # Admin login page
│   │   ├── admin-dashboard.tsx   # User mgmt, analytics, ticket overview
│   │   ├── help-center.tsx       # Searchable FAQ
│   │   ├── landing.tsx           # Landing / marketing page
│   │   └── not-found.tsx         # 404 page
│   ├── components/               # Shared components
│   │   ├── bottom-nav.tsx        # Mobile bottom navigation
│   │   ├── notification-settings.tsx  # Sound/volume preferences dialog
│   │   ├── onboarding-wizard.tsx # First-login setup wizard
│   │   ├── whats-new-modal.tsx   # Version changelog modal
│   │   ├── help-tooltip.tsx      # Contextual help tooltips
│   │   ├── install-prompt.tsx    # PWA install prompt
│   │   ├── photo-lightbox.tsx    # Photo viewer overlay
│   │   ├── ObjectUploader.tsx    # File upload component (GCS)
│   │   ├── theme-provider.tsx    # Dark mode provider
│   │   └── ui/                   # shadcn/ui primitives
│   ├── lib/
│   │   ├── auth.tsx              # JWT token management, useAuth hook
│   │   ├── websocket.ts          # WebSocket client, notification sounds
│   │   ├── queryClient.ts        # TanStack Query setup, apiRequest helper
│   │   └── utils.ts              # cn() helper, date formatting
│   └── App.tsx                   # Router setup (wouter)
├── server/
│   ├── index.ts                  # Express + Vite + WebSocket bootstrap
│   ├── routes.ts                 # All API routes (~3200 lines)
│   ├── storage.ts                # IStorage interface + DatabaseStorage (Drizzle)
│   ├── websocket.ts              # WS server, broadcast functions, client tracking
│   ├── seed.ts                   # DB seeding, migrations, test cleanup
│   ├── sms.ts                    # Twilio SMS sending
│   ├── static.ts                 # Static file serving (production)
│   ├── vite.ts                   # Vite dev server integration
│   ├── middleware/
│   │   └── auth.ts               # authenticateToken, requireRole middleware
│   ├── services/
│   │   ├── openai.ts             # AI description enhancement
│   │   ├── snowflake.ts          # Snowflake connection, tech sync, ProcID lookup
│   │   └── shsai.ts              # SHSAI service order history query
│   └── replit_integrations/
│       └── object_storage/       # GCS upload URLs, object serving, diagnostics
├── shared/
│   └── schema.ts                 # Drizzle schema (users, submissions, specializations, etc.)
├── script/
│   └── build.ts                  # Production build script
├── CHANGELOG.md                  # Shared changelog (both agents update this)
├── .claude/memory/               # Claude AI memory (do not touch from Replit Agent)
│   ├── context.md                # Session context & current state
│   ├── decisions.md              # Architectural decision records
│   └── todos.md                  # Task tracking
├── memory/                       # Replit Agent memory (do not touch from Claude AI)
└── replit.md                     # Replit Agent project memory
```

## Running Locally

```bash
npm install
npm run db:push          # Sync Drizzle schema to PostgreSQL
npm run dev              # Start dev server (Express + Vite on port 5000)
```

Production:
```bash
npm run build
npm run start            # Serves on PORT (default 5000)
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (Neon) |
| `SESSION_SECRET` | JWT signing secret |
| `TWILIO_ACCOUNT_SID` | Twilio SMS account SID |
| `TWILIO_AUTH_TOKEN` | Twilio SMS auth token |
| `TWILIO_PHONE_NUMBER` | Twilio sender phone number |
| `OPENAI_API_KEY` | OpenAI API key (AI description enhancement) |
| `SNOWFLAKE_ACCOUNT` | Snowflake account identifier |
| `SNOWFLAKE_USERNAME` | Snowflake username |
| `SNOWFLAKE_PRIVATE_KEY` | Snowflake private key (RSA) |
| `SNOWFLAKE_WAREHOUSE` | Snowflake warehouse name |
| `PUBLIC_OBJECT_SEARCH_PATHS` | GCS public object paths (set by Replit) |
| `PRIVATE_OBJECT_DIR` | GCS private object directory (set by Replit) |
| `PORT` | Server port (default 5000) |

## Key Files

| File | Purpose |
|------|---------|
| `shared/schema.ts` | Single source of truth for all DB tables, insert schemas, and types |
| `server/routes.ts` | All 60+ API endpoints — auth, submissions, admin, uploads, settings |
| `server/storage.ts` | `IStorage` interface and `DatabaseStorage` class — all DB queries go here |
| `server/websocket.ts` | WebSocket server with broadcast functions, division-based routing |
| `server/seed.ts` | Runs on startup: seeds admin, creates tables, cleans test data |
| `client/src/pages/tech-submit.tsx` | Technician submission form — photo uploads, NLA parts split |
| `client/src/pages/agent-dashboard.tsx` | Agent queue — claim, process, NLA tabs, notifications |
| `client/src/pages/admin-dashboard.tsx` | Admin dashboard — users, analytics, ticket overview, export |
| `client/src/lib/websocket.ts` | WebSocket client — connects, handles events, plays notification sounds |
| `client/src/lib/auth.tsx` | JWT token storage, `useAuth` hook, `AuthProvider` |

## Key API Endpoints

### Auth
- `POST /api/auth/login` — Agent/admin login (username + password)
- `POST /api/auth/tech-login` — Technician login (LDAP ID only)
- `GET /api/auth/me` — Current user info
- `POST /api/auth/change-password` — Change password
- `POST /api/auth/forgot-password` / `POST /api/auth/reset-password` — Password reset flow

### Submissions
- `POST /api/submissions` — Create submission (technician)
- `GET /api/submissions` — List submissions (filtered by role, status, division)
- `GET /api/submissions/:id` — Get single submission
- `PATCH /api/submissions/:id/claim` — Agent claims ticket from queue
- `PATCH /api/submissions/:id/process` — Process standard ticket (approve/reject/invalid)
- `PATCH /api/submissions/:id/process-nla` — Process NLA ticket (8 resolution actions)
- `POST /api/submissions/:id/send-to-nla` — Send ticket to NLA queue
- `PATCH /api/submissions/:id/correct-division` — Correct appliance type mid-review
- `PATCH /api/submissions/:id/reassign` — Admin reassigns ticket to another agent
- `DELETE /api/submissions/:id` — Admin deletes submission

### Admin
- `CRUD /api/admin/users` — User management
- `GET /api/admin/analytics` — Dashboard analytics
- `GET /api/admin/analytics/resubmissions` — Resubmission rate tracking
- `GET /api/admin/analytics/districts` — District-level rollup
- `GET /api/admin/nla-analytics` — NLA-specific analytics
- `GET /api/admin/export-csv` — CSV export
- `GET /api/admin/export-xlsx` — 2-sheet Excel export (Auth + NLA)
- `POST /api/admin/sync-technicians` — Sync from Snowflake
- `POST /api/admin/backfill-proc-ids` — Backfill ProcID data
- `POST /api/admin/rgc-code` / `GET /api/admin/rgc-code` — RGC code management

### Other
- `POST /api/uploads/request-url` — Get signed GCS upload URL
- `POST /api/uploads/report-error` — Upload error diagnostics
- `GET /objects/*` — Serve uploaded objects
- `GET/PUT /api/settings/notification-tone` — Per-user sound preferences
- `POST /api/feedback` — Technician feedback submission
- `GET/PATCH /api/feedback` — Admin feedback management
- `POST /api/shsai/query` / `POST /api/shsai/followup` — SHSAI AI queries

## Key Patterns

- **RBAC**: `authenticateToken` + `requireRole("vrs_agent", "admin")` middleware chain
- **Two-stage review**: AHS/First American warranties need stage 1 (internal) + stage 2 (external auth code)
- **NLA workflow**: Separate queue, 8 resolution actions, P-card escalation system
- **Division routing**: Agents specialize in appliance types; tickets route to matching agents
- **Resubmission auto-assign**: Rejected tickets resubmitted by tech go back to original reviewer if online
- **RGC codes**: Daily rotating codes agents must enter before processing certain ticket actions
- **WebSocket broadcasts**: Division-based routing; admins always receive; agents need online/working status
- **NLA parts storage**: JSON `{"nla": [...], "available": [...]}` — backward compatible with old array format
- **Test cleanup**: `server/seed.ts` purges testtech1/tmorri1 submissions on every restart
- **Service order format**: `DDDD-SSSSSSSS` (district-serviceorder, hyphenated)

## Test Credentials
- **Admin**: `sysadmin` / `VRS2026!` (super_admin)
- **Agent**: `/agent/login` with username/password
- **Technician**: `/tech/login` with LDAP ID only (no password)
