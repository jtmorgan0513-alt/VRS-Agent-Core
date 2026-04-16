# VRS Digital Authorization Platform

Sears Home Services digital authorization request management — replaces call-in workflows with a mobile PWA for field technicians and a desktop dashboard for VRS agents/admins.

## 🔴 MANDATORY: After Every Change
1. Update `CHANGELOG.md` with what changed (Added/Changed/Fixed/Removed)
2. Update `memory/context.md` with any new context or decisions
3. Update `memory/todos.md` if tasks were completed or new ones identified
4. Update `memory/decisions.md` if architectural decisions were made

Never commit or complete a task without updating these files.

---

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

## File Structure

```
├── client/src/
│   ├── pages/              # All page components
│   │   ├── tech-*.tsx      # Technician pages (login, home, submit, history, feedback, resubmit)
│   │   ├── agent-*.tsx     # Agent pages (login, dashboard)
│   │   ├── admin-*.tsx     # Admin pages (login, dashboard)
│   │   ├── submission-detail.tsx  # Tech submission detail view
│   │   └── help-center.tsx # Searchable FAQ
│   ├── components/         # Shared components (bottom-nav, onboarding, notification-settings, etc.)
│   │   └── ui/             # shadcn/ui primitives
│   ├── lib/                # Client utilities
│   │   ├── auth.tsx        # JWT token management, useAuth hook
│   │   ├── websocket.ts    # WebSocket client, notifications, sound system
│   │   ├── queryClient.ts  # TanStack Query setup, apiRequest helper
│   │   └── utils.ts        # Date formatting, cn() helper
│   └── App.tsx             # Router (wouter)
├── server/
│   ├── index.ts            # Express + Vite + WS server bootstrap
│   ├── routes.ts           # All API routes (~3200 lines)
│   ├── storage.ts          # IStorage interface + DatabaseStorage (Drizzle)
│   ├── websocket.ts        # WebSocket server, broadcast functions, client tracking
│   ├── seed.ts             # DB seeding, one-time migrations, test cleanup
│   ├── sms.ts              # Twilio SMS sending
│   ├── static.ts           # Static file serving (production)
│   ├── vite.ts             # Vite dev server integration
│   ├── middleware/auth.ts   # authenticateToken, requireRole middleware
│   ├── services/
│   │   ├── openai.ts       # AI description enhancement
│   │   ├── snowflake.ts    # Snowflake connection, tech sync, ProcID lookup
│   │   └── shsai.ts        # SHSAI service order query
│   └── replit_integrations/
│       └── object_storage/ # GCS upload URLs, object serving, upload diagnostics
├── shared/
│   └── schema.ts           # Drizzle schema (users, submissions, specializations, etc.)
├── script/
│   └── build.ts            # Production build script
└── package.json
```

## Running Locally

```bash
npm install
npm run db:push          # Sync schema to database
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

## Key API Endpoints

### Auth
- `POST /api/auth/login` — Agent/admin login (username + password)
- `POST /api/auth/tech-login` — Technician login (LDAP ID only)
- `GET /api/auth/me` — Current user info
- `POST /api/auth/change-password` — Change password

### Submissions
- `POST /api/submissions` — Create submission (technician)
- `GET /api/submissions` — List submissions (filtered by role)
- `GET /api/submissions/:id` — Get single submission
- `PATCH /api/submissions/:id/claim` — Agent claims ticket
- `PATCH /api/submissions/:id/process` — Agent processes ticket (approve/reject/invalid)
- `PATCH /api/submissions/:id/process-nla` — Process NLA ticket (8 resolution actions)
- `POST /api/submissions/:id/send-to-nla` — Send ticket to NLA queue
- `PATCH /api/submissions/:id/correct-division` — Correct appliance type

### Admin
- `GET /api/admin/users` — List all staff users
- `POST /api/admin/users` — Create user
- `GET /api/admin/analytics` — Dashboard analytics
- `GET /api/admin/export-xlsx` — Export tickets (2-sheet Excel)
- `POST /api/admin/sync-technicians` — Sync techs from Snowflake

### Uploads
- `POST /api/uploads/request-url` — Get signed GCS upload URL
- `POST /api/uploads/report-error` — Client-side upload error diagnostics
- `GET /objects/*` — Serve uploaded objects

### WebSocket Events
- `new_ticket` — Broadcast to division agents on new submission
- `ticket_claimed` — Notify agents when ticket is claimed
- `ticket_queued` — Ticket returned to queue
- `pending_tickets` — Queued tickets on agent login
- `agent_status_changed` — Agent online/offline/working status

## Key Patterns

- **RBAC**: `authenticateToken` + `requireRole("vrs_agent", "admin")` middleware chain
- **Two-stage review**: AHS/First American warranties require stage 1 (internal) + stage 2 (external auth code)
- **NLA workflow**: Separate queue, resolution actions, P-card escalation system
- **Division routing**: Agents specialize in appliance types; tickets route to matching agents
- **Resubmission auto-assign**: Rejected tickets resubmitted by tech go back to original reviewer
- **RGC codes**: Daily rotating codes agents must enter before processing tickets
- **Test cleanup**: `server/seed.ts` purges testtech1/tmorri1 submissions on every restart

## Current Status

- **Production**: Deployed on Replit, serving field technicians and VRS agents
- **Warranty providers**: Sears Protect, American Home Shield, First American all active
- **Known investigation**: iPhone photo upload failures (HEIC MIME type fix deployed, diagnostics logging added)
- **NLA parts**: Split into NLA parts vs available parts entry on submission form
