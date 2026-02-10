# VRS Digital Authorization Platform - Replit Build Prompt

## Project Overview

Build a full-stack web application called "VRS Digital Authorization Platform" for Sears Home Services. This platform replaces the call-in authorization process with a digital submission workflow. It has two interfaces:

1. **Mobile-first Progressive Web App (PWA)** - For field technicians to submit authorization requests
2. **Desktop Dashboard** - For VRS agents and admins to review, approve/reject, and manage submissions

**Tech Stack:** Node.js + Express backend, React frontend, PostgreSQL database, Twilio for SMS notifications

---

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role ENUM('technician', 'vrs_agent', 'admin') NOT NULL,
  phone VARCHAR(20),
  rac_id VARCHAR(50), -- For technicians
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### VRS Agent Specializations Table
```sql
CREATE TABLE vrs_agent_specializations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  division ENUM('cooking', 'dishwasher', 'microwave', 'laundry', 'refrigeration', 'hvac', 'generalist') NOT NULL,
  -- Agents can have multiple specializations
  UNIQUE(user_id, division)
);
```

### Submissions Table
```sql
CREATE TABLE submissions (
  id SERIAL PRIMARY KEY,
  
  -- Technician Info
  technician_id INTEGER REFERENCES users(id),
  rac_id VARCHAR(50) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  
  -- Service Order Info
  service_order VARCHAR(50) NOT NULL,
  appliance_type ENUM('cooking', 'dishwasher', 'microwave', 'laundry', 'refrigeration', 'hvac') NOT NULL,
  
  -- Request Type
  request_type ENUM('authorization', 'non_repairable_review') NOT NULL,
  
  -- Warranty Info
  warranty_type ENUM('sears_protect', 'b2b') NOT NULL DEFAULT 'sears_protect',
  warranty_provider VARCHAR(100), -- For future B2B: 'American Home Shield', 'First American', etc.
  
  -- Issue Details
  issue_description TEXT NOT NULL,
  estimate_amount DECIMAL(10,2),
  
  -- Media
  photos JSONB, -- Array of photo URLs
  video_url VARCHAR(500),
  voice_note_url VARCHAR(500),
  
  -- Stage 1: Submission Review
  stage1_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  stage1_reviewed_by INTEGER REFERENCES users(id),
  stage1_reviewed_at TIMESTAMP,
  stage1_rejection_reason TEXT,
  
  -- Stage 2: Authorization (only if stage1 approved)
  stage2_status ENUM('pending', 'approved', 'not_applicable') DEFAULT 'pending',
  stage2_reviewed_by INTEGER REFERENCES users(id),
  stage2_reviewed_at TIMESTAMP,
  
  -- Authorization Codes
  auth_code VARCHAR(50), -- Primary auth code (from warranty provider for B2B, or internal for Sears Protect)
  rgc_code VARCHAR(50), -- Daily RGC code (for B2B only - one code per day)
  
  -- Assignment
  assigned_to INTEGER REFERENCES users(id), -- VRS agent assigned based on division
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### SMS Notifications Log
```sql
CREATE TABLE sms_notifications (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER REFERENCES submissions(id),
  recipient_phone VARCHAR(20) NOT NULL,
  message_type ENUM('stage1_approved', 'stage1_rejected', 'auth_code_sent') NOT NULL,
  message_body TEXT NOT NULL,
  twilio_sid VARCHAR(100),
  sent_at TIMESTAMP DEFAULT NOW()
);
```

### Daily RGC Codes (for future B2B)
```sql
CREATE TABLE daily_rgc_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  valid_date DATE NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Application Structure

```
/vrs-platform
├── /server
│   ├── index.js              # Express server entry
│   ├── /routes
│   │   ├── auth.js           # Login, register, JWT
│   │   ├── submissions.js    # CRUD for submissions
│   │   ├── users.js          # User management (admin)
│   │   └── notifications.js  # Twilio SMS
│   ├── /middleware
│   │   ├── auth.js           # JWT verification
│   │   └── roleCheck.js      # Role-based access
│   ├── /services
│   │   ├── twilio.js         # SMS sending
│   │   ├── assignment.js     # Auto-assign to VRS agent by division
│   │   └── upload.js         # Photo/video upload handling
│   └── /db
│       └── index.js          # PostgreSQL connection
│
├── /client
│   ├── /src
│   │   ├── /components
│   │   │   ├── /mobile       # Technician mobile components
│   │   │   │   ├── SubmissionForm.jsx
│   │   │   │   ├── StatusScreen.jsx
│   │   │   │   ├── AuthCodeDisplay.jsx
│   │   │   │   └── SubmissionHistory.jsx
│   │   │   ├── /desktop      # VRS Agent/Admin components
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   ├── SubmissionQueue.jsx
│   │   │   │   ├── SubmissionDetail.jsx
│   │   │   │   ├── Stage1ActionPanel.jsx
│   │   │   │   ├── Stage2ActionPanel.jsx
│   │   │   │   └── UserManagement.jsx (admin)
│   │   │   └── /shared
│   │   │       ├── Header.jsx
│   │   │       └── LoadingSpinner.jsx
│   │   ├── /pages
│   │   │   ├── /tech         # Mobile technician pages
│   │   │   │   ├── Login.jsx
│   │   │   │   ├── NewSubmission.jsx
│   │   │   │   ├── SubmissionStatus.jsx
│   │   │   │   └── History.jsx
│   │   │   ├── /agent        # VRS Agent pages
│   │   │   │   ├── Dashboard.jsx
│   │   │   │   ├── Stage1Queue.jsx
│   │   │   │   └── Stage2Queue.jsx
│   │   │   └── /admin        # Admin pages
│   │   │       ├── UserManagement.jsx
│   │   │       ├── DivisionAssignment.jsx
│   │   │       └── Analytics.jsx
│   │   ├── /hooks
│   │   │   ├── useAuth.js
│   │   │   └── useSubmissions.js
│   │   ├── /context
│   │   │   └── AuthContext.jsx
│   │   └── App.jsx
│   └── package.json
│
└── package.json
```

---

## Core Features to Build

### 1. Authentication & Roles
- JWT-based authentication
- Three roles: `technician`, `vrs_agent`, `admin`
- Role-based routing (technicians → mobile interface, agents/admins → desktop)

### 2. Mobile Technician Interface (PWA)

**Submission Form Screen:**
- Auto-populate RAC ID and phone from logged-in user
- Service Order # input
- Appliance Type dropdown: Cooking, Dishwasher, Microwave, Laundry, Refrigeration, HVAC
- **Request Type toggle:** 
  - "Authorization Request" (default)
  - "Non-Repairable Review"
- Warranty Provider section:
  - "Sears Protect Home Warranty" (active, selectable)
  - "B2B Warranty Providers" (grayed out with "Coming Soon" badge)
- Issue Description textarea
- Estimate Amount input
- Photo upload (required, up to 5 photos)
- Optional: Voice note recording, Video upload
- Submit button

**Status Screen:**
- Show current submission status with progress indicator
- Stage 1: Pending → Approved/Rejected
- Stage 2: Awaiting Auth Code → Code Received
- Real-time updates via polling or WebSocket

**Auth Code Display Screen:**
- Large, prominent auth code display
- Copy to clipboard button
- "Open in TechHub" button (external link)
- For B2B (future): Show both RGC Code and Provider Auth Code

**Submission History:**
- List of past submissions with status badges
- Tap to view details

### 3. Desktop VRS Agent Dashboard

**Sidebar Navigation:**
- Stage 1 - Submission Review (with count badge)
- Stage 2 - Authorization (with count badge)
- Completed Today
- Divider
- Filter by Division: Cooking, Dishwasher, Microwave, Laundry, Refrigeration, HVAC
- Toggle: "My Assignments Only" / "All"

**Stage 1 Queue View:**
- Left panel: Scrollable list of pending submissions
  - Show: Service Order #, Technician name, Appliance type, Time elapsed
  - Highlight urgent items (approaching SLA)
  - Filter by division
- Right panel: Submission detail view
  - Technician info (name, RAC ID, phone)
  - Service order details
  - Request type badge (Authorization vs Non-Repairable)
  - Issue description
  - Photo gallery (click to enlarge)
  - Estimate amount
- Action Panel:
  - Rejection reason input field
  - "Reject & Notify" button (red) - triggers Twilio SMS
  - "Approve & Notify" button (green) - triggers Twilio SMS

**Stage 2 Queue View:**
- Shows only Stage 1 approved submissions awaiting auth codes
- Left panel: List with checkboxes for batch selection
  - Group by warranty provider (for future B2B batching)
- Right panel: Selected submission detail
  - Stage 1 approval confirmation banner
- Action Panel:
  - Auth Code input field
  - For B2B (future): RGC Code field + Provider Auth Code field
  - "Send Code to Tech" button - triggers Twilio SMS

### 4. Desktop Admin Dashboard

**User Management:**
- List all users with role badges
- Create new user (name, email, role, phone, RAC ID if technician)
- Edit user details
- Deactivate user

**Division Assignment (for VRS Agents):**
- Select VRS agent
- Checkbox list of divisions they can handle
- Save assignments
- Show "Generalist" badge if all divisions selected

**Analytics (basic):**
- Submissions today/week/month
- Approval rate
- Average time to Stage 1 approval
- Average time to auth code delivery

### 5. Auto-Assignment Logic

When a submission is created:
1. Check the `appliance_type` (maps to division)
2. Find VRS agents with matching specialization
3. Assign to agent with lowest current queue count
4. If no specialist available, assign to any "generalist"

### 6. Twilio SMS Integration

**SMS Templates:**

Stage 1 Approved:
```
VRS Update: Your submission for SO#{service_order} has been APPROVED. 
We're obtaining your authorization code now. You're clear to proceed.
```

Stage 1 Rejected:
```
VRS Update: Your submission for SO#{service_order} needs more info.
Reason: {rejection_reason}
Please resubmit with the required information.
```

Auth Code Sent (Sears Protect):
```
VRS Authorization for SO#{service_order}
Auth Code: {auth_code}
Enter this code in TechHub to complete the job.
```

Auth Code Sent (B2B - Future):
```
VRS Authorization for SO#{service_order}
RGC Code: {rgc_code}
Provider Auth Code: {auth_code}
Enter both codes in TechHub to complete the job.
```

---

## UI/UX Guidelines

### Color Scheme
- Primary (Sears Blue): #003366
- Success: #10b981
- Warning: #f59e0b  
- Error: #ef4444
- Stage 2 Accent (Purple): #8b5cf6

### Mobile Design
- Large touch targets (minimum 44px)
- Bottom navigation: Home, Submit, History
- Progress indicators for multi-step forms
- Pull-to-refresh for status updates

### Desktop Design
- Fixed sidebar navigation
- Split-panel layout (queue list + detail view)
- Keyboard shortcuts for power users
- Toast notifications for actions

---

## API Endpoints

```
POST   /api/auth/login
POST   /api/auth/register
GET    /api/auth/me

GET    /api/submissions                    # List (with filters)
POST   /api/submissions                    # Create new
GET    /api/submissions/:id                # Get single
PATCH  /api/submissions/:id/stage1         # Approve/reject stage 1
PATCH  /api/submissions/:id/stage2         # Send auth code

GET    /api/users                          # Admin: list users
POST   /api/users                          # Admin: create user
PATCH  /api/users/:id                      # Admin: update user
PATCH  /api/users/:id/specializations      # Admin: set divisions

POST   /api/upload/photo                   # Upload photo
POST   /api/upload/video                   # Upload video
POST   /api/upload/voice                   # Upload voice note
```

---

## Environment Variables Needed

```
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890
```

---

## Build Order

1. **Phase 1:** Database schema + Express server + Auth routes
2. **Phase 2:** Mobile submission form + basic submission API
3. **Phase 3:** Desktop Stage 1 queue + approval flow
4. **Phase 4:** Desktop Stage 2 queue + auth code flow + Twilio integration
5. **Phase 5:** Admin user management + division assignments
6. **Phase 6:** Polish, PWA manifest, responsive refinements

---

## Future Enhancements (Do Not Build Yet)

- B2B warranty providers (American Home Shield, First American, etc.)
- Dual auth code flow (RGC + Provider code)
- Daily RGC code generation for admins
- Real-time WebSocket updates
- Push notifications
- Offline submission queuing

---

Please build this application starting with Phase 1, then continue through each phase. Use clean, modular code with proper error handling. Make the UI match the Sears brand (blue #003366 primary color) and ensure the mobile interface is truly mobile-first and touch-friendly.
