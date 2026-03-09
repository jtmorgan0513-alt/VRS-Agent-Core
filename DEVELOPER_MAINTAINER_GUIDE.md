# VRS Digital Authorization Platform — Developer / Maintainer Guide

**Last Updated:** March 2026
**Audience:** Engineers and technical owners inheriting or maintaining this Replit project

---

## Table of Contents

1. [Overview](#1-overview)
2. [Repository Structure](#2-repository-structure)
3. [Key Application Entry Points](#3-key-application-entry-points)
4. [Running the Application in Replit](#4-running-the-application-in-replit)
5. [Environment Variables / Secrets](#5-environment-variables--secrets)
6. [External Services Used](#6-external-services-used)
7. [Database Architecture](#7-database-architecture)
8. [File Upload & Object Storage](#8-file-upload--object-storage)
9. [WebSocket System](#9-websocket-system)
10. [Authentication & Authorization](#10-authentication--authorization)
11. [Deployment](#11-deployment)
12. [Logs & Troubleshooting](#12-logs--troubleshooting)
13. [Future Development Guidance](#13-future-development-guidance)
14. [Ownership & Access](#14-ownership--access)

---

## 1. Overview

This document is for developers who will maintain, extend, or debug the VRS Digital Authorization Platform. It covers how the codebase is structured, how the application starts, how the build and deployment pipeline works, and where all the integration points live.

This is **not** the end-user guide. A separate document (`VRS_PLATFORM_INTERNAL_GUIDE.md`) covers user-facing workflows, login credentials, and feature walkthroughs. This document assumes you are a developer working inside the Replit project.

---

## 2. Repository Structure

```
/
├── server/                         # Backend (Express + TypeScript)
│   ├── index.ts                    # Application entry point — creates Express app, HTTP server, boots everything
│   ├── routes.ts                   # All API route definitions (~2,260 lines)
│   ├── storage.ts                  # Database access layer — IStorage interface + PostgreSQL implementation (~745 lines)
│   ├── seed.ts                     # Seed data (test users, technicians) + one-time password reset logic
│   ├── sms.ts                      # Twilio SMS sending + notification logging
│   ├── websocket.ts                # WebSocket server, client tracking, broadcast helpers
│   ├── static.ts                   # Production static file serving (serves built frontend from dist/public)
│   ├── vite.ts                     # Development-only Vite dev server middleware
│   ├── middleware/
│   │   └── auth.ts                 # JWT authentication middleware + role-based access control
│   ├── services/
│   │   ├── openai.ts               # OpenAI gpt-5 integration for AI issue descriptions
│   │   ├── snowflake.ts            # Snowflake data warehouse connection + technician sync query
│   │   └── shsai.ts                # SHSAI external AI service for service order history queries
│   └── replit_integrations/
│       └── object_storage/         # Replit Object Storage integration (presigned URLs, file serving)
│           ├── index.ts
│           ├── objectAcl.ts
│           ├── objectStorage.ts
│           └── routes.ts
│
├── client/                         # Frontend (React + Vite + TailwindCSS)
│   └── src/
│       ├── main.tsx                # React DOM entry point
│       ├── App.tsx                 # Root component — routing (wouter), auth provider, onboarding
│       ├── index.css               # Global styles, TailwindCSS theme variables
│       ├── pages/                  # Page-level components (one per route)
│       │   ├── landing.tsx         # Landing page — role selection
│       │   ├── tech-login.tsx      # Technician LDAP passwordless login
│       │   ├── agent-login.tsx     # Agent login + division selection
│       │   ├── admin-login.tsx     # Admin login
│       │   ├── login.tsx           # Shared login component with password change flow
│       │   ├── tech-home.tsx       # Technician dashboard
│       │   ├── tech-submit.tsx     # Submission form (~1,030 lines)
│       │   ├── tech-history.tsx    # Submission history list
│       │   ├── tech-resubmit.tsx   # Resubmission form (pre-filled from rejected ticket)
│       │   ├── submission-detail.tsx # Technician submission detail/status view
│       │   ├── help-center.tsx     # Help Center (tabbed accordion)
│       │   ├── agent-dashboard.tsx # VRS Agent dashboard (~2,246 lines)
│       │   ├── admin-dashboard.tsx # Admin dashboard (~1,750 lines)
│       │   └── not-found.tsx       # 404 page
│       ├── lib/
│       │   ├── auth.tsx            # AuthContext, AuthProvider, useAuth hook, getToken
│       │   ├── queryClient.ts      # TanStack Query client + apiRequest helper with JWT headers
│       │   ├── websocket.ts        # Frontend WebSocket client, auto-reconnect, notification ding
│       │   └── utils.ts            # Tailwind class merge utility
│       ├── hooks/
│       │   ├── use-toast.ts        # Toast notification hook
│       │   ├── use-mobile.tsx      # Mobile viewport detection hook
│       │   └── use-upload.ts       # File upload hook (presigned URL workflow)
│       └── components/
│           ├── ui/                 # shadcn/ui components (48 files)
│           ├── bottom-nav.tsx      # Technician bottom navigation bar
│           ├── help-tooltip.tsx    # Contextual "?" help tooltips
│           ├── install-prompt.tsx  # PWA install prompt
│           ├── ObjectUploader.tsx  # Uppy-based file uploader component
│           ├── onboarding-wizard.tsx # First-login tutorial wizard
│           ├── photo-lightbox.tsx  # Full-screen photo viewer
│           └── whats-new-modal.tsx # Version changelog modal
│
├── shared/
│   └── schema.ts                   # Drizzle ORM table definitions + Zod validation schemas (~206 lines)
│
├── script/
│   └── build.ts                    # Production build script (esbuild for server, Vite for client)
│
├── attached_assets/                # User-uploaded reference files (not served by web server)
├── uploads/                        # Legacy local upload directory (not used in production — Object Storage is used)
├── drizzle.config.ts               # Drizzle Kit configuration (points to shared/schema.ts)
├── vite.config.ts                  # Vite configuration (aliases, plugins)
├── tailwind.config.ts              # TailwindCSS configuration
├── tsconfig.json                   # TypeScript configuration (covers server + client + shared)
├── postcss.config.js               # PostCSS configuration
├── package.json                    # Dependencies and npm scripts
├── .replit                         # Replit configuration (workflows, ports, deployment settings)
├── replit.md                       # Project summary loaded into Replit Agent memory
├── VRS_PLATFORM_INTERNAL_GUIDE.md  # End-user internal guide
└── DEVELOPER_MAINTAINER_GUIDE.md   # This file
```

---

## 3. Key Application Entry Points

### Server Startup (`server/index.ts`)

This is the single entry point for the entire application. On startup, the following happens in order:

1. Express app is created with JSON body parsing and URL-encoded form support
2. Request logging middleware is attached (logs all `/api/*` requests with method, path, status, duration)
3. `registerRoutes(httpServer, app)` is called (from `server/routes.ts`):
   - Runs database schema push (`drizzle-kit push`) to sync schema with PostgreSQL
   - Registers all Object Storage routes
   - Runs `seedDatabase()` which seeds test users/technicians and runs the one-time password reset
   - Registers all API endpoints
4. `setupWebSocket(httpServer)` is called (from `server/websocket.ts`):
   - Attaches WebSocket server on the `/ws` path
   - Sets up JWT-authenticated connection handling and client tracking
5. Error handling middleware is attached
6. In **development**: Vite dev server middleware is loaded (serves frontend with HMR)
7. In **production**: Static file serving is loaded (serves built files from `dist/public`)
8. HTTP server starts listening on port 5000 (the only non-firewalled port in Replit)

### Route Registration (`server/routes.ts`)

This is the largest server file (~2,260 lines). It contains every API endpoint grouped by domain:

| Line Range (approx.) | Domain |
|---|---|
| 1–100 | Imports, schema push, seed, registration |
| 100–400 | Auth routes (login, register, tech-login, change-password, forgot/reset password) |
| 400–600 | Submission creation |
| 600–900 | Submission queries, detail, history |
| 900–1200 | Claim, process (approve/reject/invalid/approve_submission) |
| 1200–1500 | Reassign, division correction |
| 1500–1700 | Agent status, RGC codes, specializations |
| 1700–2000 | Admin user management |
| 2000–2260 | Snowflake sync, analytics, SHSAI, CSV export |

### Frontend Entry (`client/src/App.tsx`)

The React app root. Provides:
- `AuthProvider` context wrapping the entire app
- Route definitions using `wouter` (all page routes mapped here)
- Onboarding wizard trigger (first login detection)
- What's New modal trigger (version change detection)
- Role-based route guards

**To add a new page:** Create a file in `client/src/pages/`, then add a `<Route>` entry in `App.tsx`.

---

## 4. Running the Application in Replit

### Development Mode

The application runs via a Replit workflow named **"Start application"**.

- **Command:** `npm run dev`
- **Underlying command:** `NODE_ENV=development tsx server/index.ts`
- **What happens:** `tsx` runs the TypeScript server directly without compilation. Vite dev server is loaded as Express middleware for frontend hot-module replacement.
- **Port:** 5000 (backend + frontend served together)

### Restarting the Application

**From the Replit UI:** Click the Stop button in the workflow panel, then click Run again.

**Important:** The application auto-restarts when server-side TypeScript files are saved (via `tsx` file watching). Frontend changes are hot-reloaded by Vite without a full restart.

If the app crashes with `EADDRINUSE` (port already in use), wait a few seconds and restart — the previous process needs time to release the port.

### npm Scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `NODE_ENV=development tsx server/index.ts` | Start development server |
| `npm run build` | `tsx script/build.ts` | Build for production (Vite frontend + esbuild server) |
| `npm run start` | `NODE_ENV=production node dist/index.cjs` | Run production build |
| `npm run check` | `tsc` | TypeScript type checking |
| `npm run db:push` | `drizzle-kit push` | Push schema changes to database |

### Build Process (`script/build.ts`)

The production build does two things:
1. **Frontend:** Runs `vite build` which compiles React/TypeScript/CSS into static files in `dist/public/`
2. **Server:** Runs `esbuild` to bundle `server/index.ts` into a single CommonJS file `dist/index.cjs` with minification. Commonly used dependencies (Express, Drizzle, etc.) are bundled inline to reduce cold start syscalls. Less common dependencies are left as externals.

---

## 5. Environment Variables / Secrets

All secrets are stored in the **Secrets** panel in the Replit workspace (lock icon in the tools pane). They are injected as `process.env.*` variables at runtime.

### Backend Environment Variables

| Variable | Used In | Purpose |
|---|---|---|
| `DATABASE_URL` | `server/storage.ts` | PostgreSQL connection string (auto-provisioned by Replit) |
| `SESSION_SECRET` | `server/routes.ts`, `server/websocket.ts` | JWT signing key for authentication tokens |
| `TWILIO_ACCOUNT_SID` | `server/sms.ts` | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | `server/sms.ts` | Twilio API authentication token |
| `TWILIO_PHONE_NUMBER` | `server/sms.ts` | Phone number used as SMS sender (E.164 format) |
| `OPENAI_API_KEY` | `server/services/openai.ts` | OpenAI API key for gpt-5 issue description enhancement |
| `SNOWFLAKE_ACCOUNT` | `server/services/snowflake.ts` | Snowflake account identifier |
| `SNOWFLAKE_USERNAME` | `server/services/snowflake.ts` | Snowflake login username |
| `SNOWFLAKE_PRIVATE_KEY` | `server/services/snowflake.ts` | RSA private key for Snowflake key-pair authentication |
| `SNOWFLAKE_WAREHOUSE` | `server/services/snowflake.ts` | Snowflake compute warehouse name |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Object Storage integration | Replit Object Storage bucket identifier |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Object Storage integration | Search paths for public assets |
| `PRIVATE_OBJECT_DIR` | Object Storage integration | Directory for private uploaded objects |
| `VRS_MASTER_PASSWORD` | Reference only | Stored for documentation; not read by code at runtime |
| `PORT` | `server/index.ts` | Server port (defaults to 5000, set by Replit) |

### Frontend Environment Variables

| Variable | Used In | Purpose |
|---|---|---|
| `VITE_APP_VERSION` | `client/src/App.tsx` | Application version string (triggers What's New modal on change) |

Frontend environment variables **must** be prefixed with `VITE_` and are accessed via `import.meta.env.VITE_*`. They are baked into the frontend bundle at build time.

The `VITE_APP_VERSION` is set in `.replit` under `[userenv.shared]` as `"1.0.0"`. To trigger the What's New modal for users, increment this value.

### Adding or Updating Secrets

1. Open the **Secrets** panel in the Replit workspace (lock icon)
2. Click "New Secret" or find the existing one
3. Enter the key name and value
4. Click Save
5. Restart the application workflow for the change to take effect
6. For deployment: secrets are automatically available in the production environment

---

## 6. External Services Used

### Twilio (SMS)

- **Files:** `server/sms.ts`
- **Purpose:** Sends SMS notifications to technicians at ticket lifecycle events (claimed, approved, rejected, invalid) and password reset codes to agents/admins
- **Behavior if missing:** If Twilio credentials are not set, the SMS sending function returns silently without sending. The app continues to function without SMS.
- **Logging:** Every SMS attempt is logged to the `sms_notifications` database table with recipient, message type, status, and Twilio SID

### OpenAI (gpt-5)

- **Files:** `server/services/openai.ts`, called from `server/routes.ts` (submission creation endpoint)
- **Purpose:** Enhances technician issue descriptions by organizing them into Symptom / Diagnosis / Repair Needed format. Also analyzes uploaded photos to generate initial issue descriptions.
- **Model:** `gpt-5` — do not change unless explicitly requested
- **Rate limit:** 5 requests per user per hour (enforced in-memory via `rateLimitMap`)
- **Behavior if missing:** If the API key is invalid or missing, the AI enhancement fails gracefully and the original text is preserved

### Snowflake (Technician Data)

- **Files:** `server/services/snowflake.ts`
- **Purpose:** Syncs the field technician roster from the Sears Home Services data warehouse
- **Source table:** `PRD_TPMS.HSTECH.COMTTU_TECH_UN`
- **Authentication:** RSA key-pair (private key stored in `SNOWFLAKE_PRIVATE_KEY` secret)
- **Sync logic:** Pulls active technicians (status code 'A', active indicator 'Y', non-null phone), upserts into local `technicians` table, deactivates techs no longer in Snowflake
- **Trigger:** Manual only — admin clicks "Sync Technicians" in the admin dashboard
- **Log file:** Sync output is also written to `snowflake.log` in the project root

### SHSAI (AI Service Order History)

- **Files:** `server/services/shsai.ts`
- **Purpose:** External AI service at `ais.tellurideplatform.com` that provides service order history, previous visits, and diagnostic information
- **Used by:** VRS agents during ticket review (SHSAI panel on the right side of agent dashboard)
- **Authentication:** Session-based with generated track IDs and device info strings
- **Endpoints consumed:** `/init` (create session), `/query` (ask about service order), `/followup` (send follow-up question)

### Replit Object Storage

- **Files:** `server/replit_integrations/object_storage/` directory
- **Purpose:** Cloud file storage for technician-uploaded photos, videos, and voice notes
- **Mechanism:** Presigned upload URLs — the frontend gets a URL from the server, uploads directly to object storage, then stores the object path in the submission record
- **Serving:** Files are served via `GET /objects/{*objectPath}` route
- **Integration:** Managed by Replit's built-in Object Storage integration (v2.0.0)

### PostgreSQL

- **Files:** `server/storage.ts` (connection), `shared/schema.ts` (schema), `drizzle.config.ts` (config)
- **Purpose:** Primary data store for all application data
- **Connection:** Direct connection via `DATABASE_URL` environment variable using `pg` Pool
- **ORM:** Drizzle ORM with type-safe queries
- **Provisioned by:** Replit (auto-configured, separate instances for development and production)

---

## 7. Database Architecture

### System

- **Database:** PostgreSQL 16 (provisioned by Replit)
- **ORM:** Drizzle ORM (`drizzle-orm` + `drizzle-zod` for validation)
- **Schema file:** `shared/schema.ts`
- **Config file:** `drizzle.config.ts`

### Connection Initialization

The database connection is established in `server/storage.ts`:
```
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);
```

The pool is created once at module load time. The `db` instance is used by the `DatabaseStorage` class which implements the `IStorage` interface.

### Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `users` | All user accounts | `id` (serial PK), `racId` (LDAP ID, unique), `name`, `email`, `password` (bcrypt hash), `role`, `phone`, `isActive`, `isSystemAccount`, `mustChangePassword`, `passwordChangedAt`, `firstLogin`, `lastSeenVersion`, `agentStatus` |
| `technicians` | Field technician roster (from Snowflake) | `id` (serial PK), `ldapId` (unique), `name`, `phone`, `district`, `managerName`, `techUnNo`, `isActive`, `lastSyncedAt` |
| `submissions` | Authorization request tickets | `id` (serial PK), `technicianLdapId`, `technicianName`, `phone`, `phoneOverride`, `requestType`, `applianceType`, `warrantyType`, `serviceOrderNumber`, `issueDescription`, `photos` (JSON), `videoUrl`, `voiceNoteUrl`, `ticketStatus`, `assignedTo`, `reviewedBy`, `reviewedAt`, `authCode`, `rejectionReasons` (JSON), `rejectedMedia` (JSON), `agentNotes`, `submissionApproved`, `submissionApprovedAt`, `resubmissionOf`, `appealNotes`, `invalidReason`, `invalidInstructions`, `createdAt` |
| `vrs_agent_specializations` | Agent-to-division mapping | `id` (serial PK), `userId`, `division` |
| `sms_notifications` | SMS send log | `id` (serial PK), `submissionId`, `recipientPhone`, `messageType`, `messageBody`, `status`, `twilioSid`, `createdAt` |
| `daily_rgc_codes` | Daily RGC authorization codes | `id` (serial PK), `code`, `date`, `setBy`, `createdAt` |

### Schema Changes / Migrations

Drizzle uses a **push** model rather than traditional migration files:

1. Edit the schema in `shared/schema.ts`
2. Run `npm run db:push` (which runs `drizzle-kit push`)
3. Drizzle compares the TypeScript schema against the live database and generates/applies the necessary ALTER statements

The schema is also pushed automatically on every application startup (line ~56 in `server/routes.ts` calls `execSync("npm run db:push --force")`).

**Critical rule:** Never change the type of a primary key column (e.g., `serial` to `varchar`). This generates destructive ALTER statements that will break existing data.

### Development vs Production Database

Replit maintains **separate PostgreSQL instances** for development and production. The `DATABASE_URL` environment variable points to the appropriate instance in each environment.

Changes to seed data or direct SQL executed in development **do not affect production**. Production database changes happen when the deployed application runs its startup logic (seed, schema push).

---

## 8. File Upload & Object Storage

### Upload Flow

1. **Frontend** (`client/src/hooks/use-upload.ts`, `client/src/components/ObjectUploader.tsx`):
   - Technician selects photos/video/voice note
   - Frontend calls `POST /api/uploads/request-url` with file metadata
   - Receives a presigned upload URL and object path
   - Uploads the file directly to Replit Object Storage using the presigned URL

2. **Backend** (`server/replit_integrations/object_storage/routes.ts`):
   - `POST /api/uploads/request-url` — Protected (technician role only). Generates a presigned upload URL via `ObjectStorageService.getObjectEntityUploadURL()`
   - `GET /objects/{*objectPath}` — Public. Serves uploaded files by downloading from Object Storage and streaming to the response

3. **Storage:** The object path (not the full URL) is stored in the `submissions` table as part of the `photos` JSON array, `videoUrl`, or `voiceNoteUrl` fields.

### Object Storage Configuration

The integration is managed by Replit's built-in Object Storage system (v2.0.0). Configuration is handled through the environment variables `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PUBLIC_OBJECT_SEARCH_PATHS`, and `PRIVATE_OBJECT_DIR`.

### Video Compatibility

The project includes `ffmpeg` as a Nix package (configured in `.replit` under `[nix]`) for iPhone video format compatibility. This allows processing of HEVC/MOV files uploaded from iOS devices.

---

## 9. WebSocket System

### Server (`server/websocket.ts`, ~202 lines)

The WebSocket server is attached to the same HTTP server as Express, on the `/ws` path.

**Connection authentication:** Clients connect with a JWT token as a URL query parameter (`ws://host/ws?token=...`). The server verifies the token using the same `SESSION_SECRET` used for REST API auth.

**Client tracking:** A `Map<number, ClientInfo>` tracks all connected clients:
```typescript
interface ClientInfo {
  ws: WebSocket;
  role: string;
  divisions: string[];
  agentStatus: string;
}
```

**Exported functions used by `server/routes.ts`:**

| Function | Purpose |
|---|---|
| `broadcastToAgent(userId, event)` | Send event to a specific connected agent |
| `broadcastToDivisionAgents(division, event, excludeUserId?)` | Send event to all online agents in a division |
| `broadcastToAdmins(event)` | Send event to all connected admin/super_admin users |
| `updateClientStatus(userId, status)` | Update tracked agent status |
| `updateClientDivisions(userId, divisions)` | Update tracked agent divisions |
| `getWarrantyLabel(key)` | Map warranty type key to display label |
| `getDivisionLabel(key)` | Map division key to display label |

**Event types emitted:**

| Event | Trigger | Recipients |
|---|---|---|
| `new_ticket` | Ticket created | Online agents in matching division |
| `ticket_claimed` | Agent claims ticket | All agents in that division |
| `ticket_queued` | Ticket returns to queue (reject/reassign/division correction) | Agents in the ticket's division |
| `agent_status_changed` | Agent status changes | All admins |
| `pending_tickets` | Agent goes online while queue has matching tickets | That specific agent |

**Auto-offline:** When a WebSocket connection closes, the server automatically sets the agent's status to "offline" and broadcasts the change to admins.

### Client (`client/src/lib/websocket.ts`, ~165 lines)

**Connection:** Connects when an agent or admin logs in. The JWT token is passed as a query parameter.

**Auto-reconnect:** On disconnect, the client retries with exponential backoff (1s, 2s, 4s, 8s, up to 30s max).

**Notification ding:** Uses the Web Audio API to generate a short sine wave tone when `new_ticket` events arrive. No audio files are needed.

**Hook:** `useWebSocket(role)` returns a `subscribe(eventType, handler)` function. Components call subscribe in a `useEffect` to register handlers for specific event types.

**Logout cleanup:** `disconnectWs()` is called during logout (dynamically imported in `client/src/lib/auth.tsx`).

---

## 10. Authentication & Authorization

### JWT System

- **Signing:** JWTs are signed with `SESSION_SECRET` in `server/routes.ts` (function `signToken`)
- **Payload:** `{ id, email, name, role, ldapId?, isTechnician? }`
- **Verification:** `server/middleware/auth.ts` — `authenticateToken` middleware extracts the Bearer token from the `Authorization` header and verifies it
- **Client storage:** Tokens are stored in `localStorage` as `vrs_token`
- **Client injection:** `client/src/lib/queryClient.ts` — the `apiRequest` helper and default TanStack Query fetcher automatically attach the `Authorization: Bearer <token>` header

### Login Routes

| Route | Method | Auth Type |
|---|---|---|
| `POST /api/auth/login` | LDAP ID + password | Standard login for agents/admins |
| `POST /api/auth/tech-login` | LDAP ID only | Passwordless login for technicians |
| `POST /api/auth/register` | Body fields | Self-registration (technician only) |
| `POST /api/auth/change-password` | JWT + current password + new password | Forced or voluntary password change |
| `POST /api/auth/forgot-password` | LDAP ID | Sends 6-digit SMS reset code |
| `POST /api/auth/reset-password` | LDAP ID + code + new password | Validates code and sets new password |

### Role-Based Access Control

`server/middleware/auth.ts` exports two middleware functions:

1. **`authenticateToken`** — Verifies the JWT and attaches `req.user` with `{ id, email, name, role, ldapId, isTechnician }`
2. **`requireRole(...roles)`** — Checks that `req.user.role` is in the allowed list. `super_admin` always passes (bypasses role check).

Usage in routes:
```typescript
app.get("/api/admin/users", authenticateToken, requireRole("admin", "super_admin"), handler);
```

### Technician Passwordless Login

1. Technician sends `POST /api/auth/tech-login` with `{ ldapId }`
2. Server looks up the LDAP ID in the `technicians` table (not `users`)
3. If found and active, calls `getOrCreateTechUser()` which ensures a corresponding `users` record exists
4. JWT is issued — no password verification occurs
5. The technician's phone number from the `technicians` table is included in the response for the phone override UI

---

## 11. Deployment

### Configuration

Deployment settings are in `.replit` under the `[deployment]` section:

```toml
[deployment]
deploymentTarget = "autoscale"
run = ["node", "./dist/index.cjs"]
build = ["npm", "run", "build"]
publicDir = "dist/public"
```

- **Target:** Autoscale (Replit manages scaling)
- **Build command:** `npm run build` — runs `script/build.ts` which compiles frontend (Vite) and server (esbuild) into the `dist/` directory
- **Run command:** `node ./dist/index.cjs` — runs the bundled production server
- **Static files:** Served from `dist/public/` (the built frontend output)

### How to Deploy

1. Make sure your changes work in development
2. Click the **Deploy** / **Publish** button in the Replit workspace
3. Replit runs the build command, then starts the production server
4. The app is served at the `.replit.app` domain

### Development vs Production Differences

| Aspect | Development | Production |
|---|---|---|
| Server execution | `tsx server/index.ts` (TypeScript directly) | `node dist/index.cjs` (bundled JS) |
| Frontend | Vite dev server with HMR | Static files from `dist/public/` |
| Database | Development PostgreSQL instance | Separate production PostgreSQL instance |
| `NODE_ENV` | `development` | `production` |
| File watching | Active (auto-restart on changes) | None |
| Vite plugins | Dev banner, cartographer, HMR | None (static build) |

### Important: Database Separation

The development and production databases are **completely separate**. Data inserted or modified via direct SQL in development does not appear in production. The only way to affect the production database is through:
- Application startup logic (seed, migrations, schema push) that runs when the deployed app boots
- API calls made to the deployed application

---

## 12. Logs & Troubleshooting

### Viewing Application Logs

**Development:** Workflow console in the Replit workspace shows real-time output from the running server. All API requests are logged with method, path, status code, and duration.

**Production (deployed):** Use the Replit deployment logs viewer. Logs include server startup messages, API request logs, and error stack traces.

### Common Issues

| Problem | Diagnosis | Fix |
|---|---|---|
| `EADDRINUSE: address already in use 0.0.0.0:5000` | Previous server process didn't release the port | Wait 5-10 seconds and restart the workflow |
| `ERR_MODULE_NOT_FOUND` | Import path doesn't match actual file location | Check the import statement — `server/db` doesn't exist, use `server/storage` |
| Schema push fails | Destructive schema change (e.g., changing PK type) | Never change ID column types; use `npm run db:push --force` if safe |
| SMS not sending | Twilio credentials missing or invalid | Check Secrets panel for `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| Snowflake sync fails | Private key format issue or credentials expired | Check `SNOWFLAKE_PRIVATE_KEY` format (RSA PEM) and account permissions |
| Login fails for all users | Password hashes don't match after bulk operations | The `resetAllPasswords()` function in `server/seed.ts` runs on first startup to fix this; redeploy |
| WebSocket won't connect | JWT token expired or missing | Client auto-reconnects; if persistent, user needs to re-login |
| Frontend shows blank page | Build failed or static files missing | Check `dist/public/` exists; rebuild with `npm run build` |

### Checking Environment Variables

Environment variables are in the Secrets panel. To verify at runtime, check server startup logs — the app will fail early with clear error messages if critical variables (like `DATABASE_URL` or `SESSION_SECRET`) are missing.

### Password Reset Mechanism

`server/seed.ts` contains a `resetAllPasswords()` function that:
1. Checks for a flag user (`__pw_reset_v2_done__`) in the database
2. If not found: resets all user passwords (except VRS_MASTER) to `VRS2026!` with `mustChangePassword = true`
3. Creates the flag user so it never runs again
4. Test accounts (`testagent1`, `TESTADMIN`, `testtech1`, `tmorri1`, `sysadmin`) get `mustChangePassword = false`

This runs on every app startup but only executes once per database (idempotent via flag check).

---

## 13. Future Development Guidance

### Adding a New API Route

1. Open `server/routes.ts`
2. Add your route inside the `registerRoutes` function
3. Use `authenticateToken` and `requireRole()` middleware for protected routes
4. Use the `storage` object for all database operations — add new methods to `IStorage` interface and `DatabaseStorage` class in `server/storage.ts` if needed
5. Validate request bodies using Zod schemas from `shared/schema.ts`

### Adding a New Frontend Page

1. Create a new file in `client/src/pages/`
2. Add a `<Route path="/your-path" component={YourPage} />` entry in `client/src/App.tsx`
3. Use `useAuth()` hook for user context
4. Use TanStack Query (`useQuery`, `useMutation`) for API calls — the default fetcher handles JWT headers automatically
5. Add `data-testid` attributes to all interactive and meaningful display elements

### Extending the Database Schema

1. Edit `shared/schema.ts` — add new columns or tables using Drizzle's schema builder
2. For each new table, create insert schema with `createInsertSchema`, insert type with `z.infer`, and select type with `$inferSelect`
3. The schema is automatically pushed to the database on app startup (`npm run db:push` runs in `registerRoutes`)
4. Add corresponding methods to `IStorage` and `DatabaseStorage` in `server/storage.ts`
5. **Never change existing primary key column types**

### Adding a New WebSocket Event

1. In `server/websocket.ts`: No changes needed if using existing broadcast helpers
2. In `server/routes.ts`: Call `broadcastToAgent()`, `broadcastToDivisionAgents()`, or `broadcastToAdmins()` with your new event type
3. In `client/src/lib/websocket.ts`: No changes needed — the client passes all events to subscribers
4. In your page component: Use `const { subscribe } = useWebSocket(user.role)` and subscribe to your new event type

### Adding a New External Service

1. Create a new file in `server/services/`
2. Read credentials from `process.env.*`
3. Add the corresponding secrets to the Replit Secrets panel
4. Document the new secret in this guide and in `replit.md`

### Updating the App Version

1. In the Replit Secrets panel or `.replit` file, update `VITE_APP_VERSION` (e.g., from `"1.0.0"` to `"1.1.0"`)
2. Update the What's New modal content in `client/src/components/whats-new-modal.tsx`
3. Rebuild/redeploy — all users will see the What's New modal on their next visit

---

## 14. Ownership & Access

### Replit Roles

| Role | Capabilities |
|---|---|
| **Owner** | Full control: edit code, manage secrets, deploy, manage billing, invite collaborators, delete the Repl |
| **Collaborator** | Edit code, run workflows, view (but not always edit) secrets, cannot deploy or manage billing |
| **Viewer** | Read-only access to code; cannot edit, run, or deploy |

### Who Should Have Owner Access

The project owner should be someone who:
- Has authority to manage Replit billing (deployment costs)
- Can manage secrets (API keys, database credentials)
- Can trigger deployments to production
- Understands the security implications of the stored credentials

### Secrets Management

- Secrets are scoped to the Repl and available to all collaborators with appropriate access
- Production deployments use the same secrets as the development environment
- If you rotate an API key (Twilio, OpenAI, Snowflake), update it in the Secrets panel and redeploy
- The `DATABASE_URL` is auto-managed by Replit — do not modify it manually

### Deployment Management

- Only the owner (or collaborators with deploy permissions) can publish to production
- Each deployment creates a checkpoint that can be rolled back to if needed
- The production URL is on the `.replit.app` domain (or a custom domain if configured)
- Production auto-scales based on Replit's autoscale deployment target

---

**End of Document**

*This guide should be kept up to date as the codebase evolves. When making significant architectural changes, update both this file and `replit.md`.*
