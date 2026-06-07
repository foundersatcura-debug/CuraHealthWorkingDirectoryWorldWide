# Cura Healthcare — Backend System Design

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Multi-Tenancy Model](#4-multi-tenancy-model)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [API Design](#6-api-design)
7. [Module Architecture](#7-module-architecture)
8. [Database Design](#8-database-design)
9. [Real-Time Layer — Socket.io](#9-real-time-layer--socketio)
10. [Middleware Pipeline](#10-middleware-pipeline)
11. [Security](#11-security)
12. [Rate Limiting](#12-rate-limiting)
13. [Audit & Logging](#13-audit--logging)
14. [Environment & Configuration](#14-environment--configuration)
15. [Deployment](#15-deployment)
16. [Scalability Considerations](#16-scalability-considerations)
17. [API Quick Reference](#17-api-quick-reference)

---

## 1. Executive Summary

Cura Healthcare Backend is a **multi-tenant Hospital Management System (HMS)** API serving three distinct client surfaces:

| Client | Purpose | Port |
|--------|---------|------|
| HMS App | Day-to-day hospital operations (doctors, nurses, reception, pharmacy, lab) | 5174 |
| SuperAdmin / Founder App | Platform-level oversight across all hospitals | 5173 |
| B2C Patient Portal | Patient-facing appointment booking, records, notifications | 5175 |

The backend exposes a single REST + WebSocket server. Every request is scoped to the correct **Hospital → Branch → User** context through JWT claims and RBAC middleware, preventing any cross-tenant data leaks.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                              │
│  ┌──────────────┐   ┌──────────────────┐   ┌─────────────────────┐ │
│  │  HMS App     │   │  SuperAdmin App  │   │  B2C Patient Portal │ │
│  │  :5174       │   │  :5173           │   │  :5175              │ │
│  └──────┬───────┘   └────────┬─────────┘   └──────────┬──────────┘ │
└─────────┼────────────────────┼────────────────────────┼────────────┘
          │                    │                         │
          │         HTTP REST + WebSocket (WS)           │
          │                    │                         │
┌─────────▼────────────────────▼─────────────────────────▼────────────┐
│                     EXPRESS + SOCKET.IO SERVER                       │
│                     http://localhost:8000/api/v1                      │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                    MIDDLEWARE PIPELINE                        │    │
│  │  Helmet → CORS → Compression → Morgan → Rate Limit →        │    │
│  │  Authenticate (JWT) → RBAC (Role/Permission) → Audit        │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                       MODULE LAYER                           │    │
│  │  auth │ patients │ appointments │ doctors │ departments      │    │
│  │  ipd  │ laboratory │ pharmacy │ billing │ emergency          │    │
│  │  blood-bank │ analytics │ notifications │ hr │ b2c           │    │
│  │  superadmin (+ dashboard) │ vitals │ queue │ referrals       │    │
│  │  radiology │ documents │ insurance │ lab-catalog │ inventory  │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────┬────────────────────────────────────────┘
                               │
          ┌────────────────────┼──────────────────────┐
          │                    │                       │
   ┌──────▼──────┐    ┌────────▼───────┐    ┌─────────▼──────┐
   │  PostgreSQL │    │     Redis       │    │   BullMQ       │
   │  (NeonDB)   │    │  (Cache /       │    │  (Job Queue)   │
   │  Prisma ORM │    │   Rate Limit)   │    │                │
   └─────────────┘    └────────────────┘    └────────────────┘
```

### Data Flow (typical request)

```
Client → Bearer Token → authenticate() → authorize(role) →
sameBranch() check → Controller → Prisma Query → DB →
Response envelope { success, data, meta? }
```

---

## 3. Tech Stack

| Concern | Choice | Reason |
|---------|--------|--------|
| Runtime | Node.js ≥ 20 | Non-blocking I/O, large ecosystem |
| Language | TypeScript 5.6 | Type safety across all layers |
| HTTP Framework | Express 4 | Mature, minimal, middleware ecosystem |
| ORM | Prisma 5 | Type-safe queries, migrations, NeonDB compatible |
| Database | PostgreSQL (NeonDB) | Serverless, scalable, ACID compliant |
| Real-time | Socket.io 4 | Rooms, namespaces, WS + polling fallback |
| Cache / Session | Redis (ioredis) | Optional — graceful fallback if unavailable |
| Job Queue | BullMQ | Redis-backed background jobs (notifications, reports) |
| Auth | JWT (jsonwebtoken) | Stateless, dual-token (access + refresh) |
| Validation | Zod | Schema-first, runtime-safe env + request validation |
| Security headers | Helmet 8 | OWASP header best practices |
| Rate limiting | express-rate-limit | Per-window request caps, auth-specific stricter limits |
| Logging | Winston | Structured JSON logs, multiple transports |
| HTTP logging | Morgan | Request timing, method, status, IP |
| File uploads | Multer | Multipart form, size-limited |
| Dev runner | tsx watch | Hot reload without a full compile step |
| Build | tsc (tsconfig.build.json) | Emit to dist/ for production |
| Container | Docker + docker-compose | Reproducible deployment |

---

## 4. Multi-Tenancy Model

The system uses a **hierarchical multi-tenancy** strategy — shared database, tenant-scoped queries.

```
HOSPITAL  (top-level tenant — e.g. "Apollo Group")
  └── BRANCH  (physical location — e.g. "Apollo Delhi")
        ├── USER    (staff: doctors, nurses, admins ...)
        └── PATIENT (registered at this branch)
```

### Rules

| Role | Scope |
|------|-------|
| FOUNDER | Sees all hospitals, all branches, all data |
| SUPER_ADMIN | Sees all data within assigned scope |
| BRANCH_ADMIN | Sees only their own branch |
| DOCTOR / NURSE / RECEPTIONIST / etc. | Sees only their branch; further limited by permission |

### How it is enforced

1. **JWT claims** include `branch_id` and `hospital_id` at login time.
2. **`sameBranch()` middleware** compares `req.params.branchId || req.query.branch_id` against `req.user.branch_id`, blocking cross-branch access.
3. FOUNDER and SUPER_ADMIN bypass the branch check and can pass `?hospital_id=` to scope dashboard queries.
4. All Prisma queries in branch-scoped modules use `where: { branch_id: user.branch_id }` derived from the JWT.

---

## 5. Authentication & Authorization

### 5.1 Dual-Token JWT Strategy

```
Login ──► Access Token (15 min, JWT_SECRET)
     └──► Refresh Token (7 days, JWT_REFRESH_SECRET, stored in DB)
```

**Access Token payload:**
```json
{
  "sub": "user_id",
  "role": "DOCTOR",
  "branch_id": "branch_cuid",
  "hospital_id": "hospital_cuid",
  "type": "access"
}
```

**Refresh Token payload:**
```json
{
  "sub": "user_id",
  "jti": "refresh_token_row_id",
  "type": "refresh"
}
```

The `jti` maps to the `refresh_tokens` table. On refresh, the old token is **revoked** (soft-delete via `revoked_at`) and a new pair is issued — full **rotation** prevents replay attacks.

### 5.2 Patient Auth (B2C — OTP based)

```
Phone → Send OTP → Verify OTP → Patient Access Token (15 min)
                             └── Patient Refresh Token (7 days)
```

Patient tokens carry `{ sub: patient_id, phone, type: "patient_access" }` and are verified by `optionalAuthenticate()` + a patient-specific guard rather than the staff RBAC middleware.

### 5.3 Role Hierarchy

Roles ordered by authority (low → high):

```
PHARMACY → LAB_TECHNICIAN → RECEPTIONIST → NURSE → DOCTOR
                                                        ↓
                                               BRANCH_ADMIN → SUPER_ADMIN → FOUNDER
```

`authorize(...roles)` does exact-match allowlist.
`authorizeMinRole(role)` checks hierarchy index — useful for "at least DOCTOR" guards.

### 5.4 Permission-Based RBAC (granular)

Beyond roles, a `Role` table stores a `permission_json` object:

```json
{
  "patients": { "read": true, "write": true },
  "billing":  { "read": true, "write": false },
  "reports":  { "read": true }
}
```

`requirePermission(resource, action)` in `rbac.middleware.ts` reads this JSON and blocks requests that lack the required permission, enabling fine-grained custom roles per branch.

---

## 6. API Design

### Base URL
```
http://localhost:8000/api/v1
```

### Response Envelope

All endpoints return the same shape:

```jsonc
// Success (200 / 201)
{ "success": true, "data": <T>, "meta": { "page": 1, "limit": 20, "total": 143, "total_pages": 8 } }

// Error (4xx / 5xx)
{ "success": false, "message": "Human-readable error", "errors": <optional zod details> }
```

HTTP status codes used:
| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 204 | No Content (delete) |
| 400 | Bad Request / validation error |
| 401 | Unauthenticated |
| 403 | Forbidden (wrong role / branch) |
| 404 | Not Found |
| 409 | Conflict (duplicate) |
| 429 | Rate Limited |
| 500 | Internal Server Error |

### Pagination

All list endpoints accept:
```
GET /resource?page=1&limit=20
```
Response includes `meta.total_pages` so clients can render pagination controls.

---

## 7. Module Architecture

Each module lives at `src/modules/<name>/` and contains:

```
<name>.routes.ts      ← Express Router, auth guards wired here
<name>.controller.ts  ← Request parsing, calls Prisma, sends response
<name>.schema.ts      ← Zod schemas for request validation (where present)
<name>.service.ts     ← Complex business logic extracted from controller
```

### Module Map

| Module | Path prefix | Primary consumers |
|--------|-------------|-------------------|
| auth | `/auth` | All roles, patients |
| patients | `/patients` | Receptionist, Doctor, Admin |
| appointments | `/appointments` | Receptionist, Doctor, Patient (B2C) |
| doctors | `/doctors` | Admin, Doctor |
| departments | `/departments` | Admin |
| ipd | `/ipd` | Doctor, Nurse, Admin |
| laboratory | `/laboratory` | Lab Technician, Doctor |
| lab-catalog | `/lab-catalog` | Admin, Lab Tech |
| pharmacy | `/pharmacy` | Pharmacy role |
| inventory | `/inventory` | Pharmacy, Admin |
| billing | `/billing` | Receptionist, Admin |
| insurance | `/insurance` | Admin, Billing |
| emergency | `/emergency` | Doctor, Nurse, Admin |
| blood-bank | `/blood-bank` | Lab Tech, Doctor |
| radiology | `/radiology` | Doctor, Radiologist |
| medical-records | `/medical-records` | Doctor, Nurse |
| vitals | `/vitals` | Nurse, Doctor |
| queue | `/queue` | Receptionist, Doctor (OPD token system) |
| referrals | `/referrals` | Doctor |
| documents | `/documents` | Doctor, Nurse, Patient |
| notifications | `/notifications` | All |
| hr | `/hr` | Branch Admin |
| analytics | `/analytics` | Branch Admin, Doctor |
| b2c | `/b2c` | Patient Portal |
| superadmin | `/superadmin` | Founder, Super Admin |
| superadmin/dashboard | `/superadmin/dashboard` | Founder, Super Admin |

### Route-level roles (examples)

```
POST /auth/login              → public
GET  /patients                → RECEPTIONIST+
POST /ipd/admissions          → DOCTOR+
GET  /billing/bills           → RECEPTIONIST+
GET  /analytics/overview      → BRANCH_ADMIN+
GET  /superadmin/dashboard/*  → FOUNDER, SUPER_ADMIN only
```

---

## 8. Database Design

### Database: PostgreSQL on NeonDB (serverless)

**ORM:** Prisma 5 with `prisma db push` for schema sync and `prisma migrate` for production migrations.

### Domain Groups (50 tables total)

#### 8.1 Multi-Tenancy Core

```
hospitals ──< branches
hospitals ──── subscriptions   (1:1)
hospitals ──── hospital_settings (1:1)
```

Key fields on `hospitals`: `code (UNIQUE)`, `is_active`, `tax_id`
Key fields on `branches`: `(hospital_id, code) UNIQUE`, `timing JSON`
`subscriptions`: plan enum (BASIC / PROFESSIONAL / ENTERPRISE / CUSTOM), billing_cycle, user_limit, patient_limit, razorpay_sub_id

#### 8.2 Users & Auth

```
roles ──< users ──< refresh_tokens
users ──────────── doctor_shifts
users ──────────── doctor   (1:1)
users ──────────── staff    (1:1)
```

- `users.role` enum — coarse role for fast routing decisions
- `users.role_id` FK to `roles` — fine-grained permission JSON
- Two separate JWT secrets: `JWT_SECRET` (access) and `JWT_REFRESH_SECRET` (refresh)
- `refresh_tokens.revoked_at` — soft revoke on rotation

#### 8.3 Patient & B2C Auth

```
patients ──── patient_auth ──< patient_refresh_tokens
patients ──< medical_histories
patients ──< allergies
patients ──< family_members (self-join: head_id + member_id)
```

- `patients.uhid` — globally unique hospital ID (auto-generated)
- OTP stored in `patient_auth`, expires via `otp_expires`

#### 8.4 Clinical Staff

```
departments ──< doctors    (DepartmentDoctors relation)
departments ──── doctors   (DepartmentHead relation, 1:optional)
departments ──< wards
users ──── doctors (1:1)
users ──── staff   (1:1)
```

- `doctors.license_no` — unique across platform
- `doctors.schedule JSON` — weekly availability grid
- `doctor_shifts` — per-date overrides of the JSON schedule

#### 8.5 IPD (In-Patient Department)

```
wards ──< beds
beds }──── admissions  (a bed can point to one admission)
admissions ──────────── discharge_summaries (1:optional)
admissions ──< vitals_history
admissions ──< clinical_notes
admissions ──< radiology_reports
admissions ──< medical_records
admissions ──── bills (1:optional)
```

- `beds.status` enum: AVAILABLE / OCCUPIED / MAINTENANCE / RESERVED
- `admissions.status` enum: ADMITTED / DISCHARGED / TRANSFERRED / CRITICAL
- `wards.type` enum: GENERAL / PRIVATE / ICU / NICU / EMERGENCY / OT / HDU

#### 8.6 OPD (Out-Patient Department)

```
appointments ──── patient_queues (1:optional via visit_id)
appointments ──< referrals
appointments ──< vitals_history
appointments ──< clinical_notes
appointments ──< lab_orders
appointments ──< radiology_reports
appointments ──── medical_records (1:optional)
```

- `appointments.status` transitions enforced server-side via `VALID_STATUS_TRANSITIONS` map
- `patient_queues.priority` enum: NORMAL / EMERGENCY / VIP

#### 8.7 Laboratory

```
lab_tests ──< lab_parameters
lab_tests ──< lab_test_items
lab_orders ──< lab_test_items  (the actual tests ordered)
lab_orders ──< lab_results
lab_parameters ──< lab_results
```

- `lab_orders.priority` enum: ROUTINE / URGENT / STAT
- `lab_results.is_abnormal` — flagged automatically or by technician

#### 8.8 Pharmacy & Inventory

```
inventory_items ──< item_batches   (FIFO batch management)
medicines ──< prescription_items
inventory_items ──< prescription_items
prescriptions ──< prescription_items
```

- `medicines` — branch-specific stock with `reorder_level` threshold
- `inventory_items` — non-medicine consumables, equipment, surgical items
- `item_batches` — per-batch expiry, cost price, current quantity

#### 8.9 Billing & Payments

```
bills ──< bill_items
bills ──< payments
bills ──< refunds
bills ──< insurance_claims
payments ──< refunds
payments ──< payment_gateway_logs
insurance_providers ──< insurance_claims
```

- `bills.status` enum: PENDING / PARTIAL / PAID / CANCELLED / OVERDUE
- `payments.payment_status` enum: INITIATED / PROCESSING / SUCCESS / FAILED / REFUNDED
- `payments.method` enum: CASH / CARD / INSURANCE / UPI / BANK_TRANSFER / ONLINE
- `payment_gateway_logs` — full webhook payload stored for reconciliation

#### 8.10 Emergency, Blood Bank, Ambulance

```
emergency_cases }──── patients   (optional — walk-in may be unknown)
emergency_cases }──── doctors    (optional — assigned later)
blood_inventory ──── branches    (per branch, per blood group — UNIQUE)
blood_requests }──── patients
blood_requests }──── doctors
ambulances ──── branches
```

- `emergency_cases.triage_level` enum: IMMEDIATE / URGENT / LESS_URGENT / NON_URGENT
- `blood_inventory` has a composite unique on `(branch_id, blood_group)`

#### 8.11 System Tables

```
notifications  → user_id (optional) + patient_id (optional)
audit_logs     → user_id + branch_id + action + resource + changes JSON
```

### Key Indexes

```sql
-- Hot query paths indexed:
patients(branch_id), patients(phone), patients(uhid)
appointments(patient_id), appointments(doctor_id),
appointments(appointment_date), appointments(status)
lab_orders(patient_id)
patient_queues(doctor_id), patient_queues(branch_id), patient_queues(status)
vitals_history(patient_id), vitals_history(appointment_id)
audit_logs(branch_id), audit_logs(user_id), audit_logs(resource), audit_logs(created_at)
notifications(user_id), notifications(patient_id), notifications(is_read)
```

---

## 9. Real-Time Layer — Socket.io

The HTTP server is wrapped in a `http.createServer()` and handed to Socket.io, sharing the same port (`8000`).

### Authentication

The Socket.io middleware verifies the JWT from `socket.handshake.auth.token`. Unauthenticated connections are allowed (public queue display boards), but they can only see public rooms.

### Rooms

| Room key | Who joins | Purpose |
|----------|-----------|---------|
| `branch:<branchId>` | All staff in a branch | Branch-wide events (bed changes, announcements) |
| `superadmin:dashboard` | FOUNDER, SUPER_ADMIN | Live KPI pushes, priority alerts |
| `queue:<doctorId>:<date>` | Reception, nurse, display screens | Live OPD token queue |
| `emergency:<branchId>` | ER staff | New and updated emergency cases |
| `patient:<patientId>` | Patient (B2C app) | Personal notifications, lab results |
| `ambulance:<ambulanceId>` | Dispatcher | GPS location updates |
| `user:<userId>` | Individual staff | Personal notifications |

### Events

| Event name | Direction | Trigger |
|------------|-----------|---------|
| `queue:update` | Server → Client | Queue status changed |
| `queue:token_called` | Server → Client | Doctor calls next token |
| `emergency:new` | Server → Client | New ER case created |
| `emergency:update` | Server → Client | ER case status changed |
| `bed:status_changed` | Server → Client | Bed occupied / freed |
| `lab:result_ready` | Server → Client | Lab result uploaded |
| `ambulance:location` | Client → Server → Client | Real-time GPS |
| `notification:new` | Server → Client | Any in-app notification |
| `dashboard:stats_update` | Server → Client | Command center KPI refresh trigger |
| `dashboard:priority_alert` | Server → Client | New critical admission, ER, STAT lab |

### Emit Helpers (`src/socket/index.ts`)

```typescript
emit.queueUpdate(doctorId, date, data)
emit.tokenCalled(doctorId, date, data)
emit.emergencyNew(branchId, data)        // also fires dashboard:priority_alert
emit.emergencyUpdate(branchId, data)     // also fires dashboard:stats_update
emit.bedStatusChanged(branchId, data)    // also fires dashboard:stats_update
emit.labResultReady(patientId, data)
emit.notifyUser(userId, data)
emit.notifyPatient(patientId, data)
emit.dashboardStatsUpdate(trigger, data) // superadmin room only
emit.dashboardPriorityAlert(alert)       // superadmin room only
```

---

## 10. Middleware Pipeline

Every incoming HTTP request passes through this chain in order:

```
1. helmet()           — Security headers (XSS, HSTS, Content-Type sniffing ...)
2. cors()             — Allow VITE dev origins (5173, 5174, 5175)
3. compression()      — Gzip response bodies
4. morgan()           — HTTP request logging (method, path, status, ms)
5. express.json()     — Body parsing, 10 MB limit
6. globalRateLimit()  — 100 req / 60s per IP (configurable)
   authRateLimit()    — 10 req / 15 min on /auth routes
   strictRateLimit()  — 5 req / 60s on sensitive actions
7. authenticate()     — Verify JWT, attach req.user
   OR
   optionalAuthenticate() — Same, but non-blocking (public routes)
8. authorize(...roles)— Role allowlist check
   OR
   authorizeMinRole() — Hierarchy check
   OR
   sameBranch()       — Cross-tenant isolation check
9. requirePermission() — Granular JSON permission check (rbac.middleware)
10. audit()           — Write to audit_logs table (async, non-blocking)
11. Controller        — Business logic
12. errorHandler()    — Catch-all: AppError → structured JSON, 500 fallback
```

### AppError

Controllers throw `new AppError('message', statusCode)` for known failure cases. The global `errorHandler` catches it and serializes it into the standard `{ success: false, message }` envelope.

---

## 11. Security

| Vector | Mitigation |
|--------|-----------|
| Broken Object Level Authorization | All queries scoped by `branch_id` from JWT, not from request body |
| Broken Function Level Authorization | Every route has `authorize()` or `authorizeMinRole()` — no route is unguarded except public login/OTP |
| JWT tampering | `HS256` with 32+ char secrets; `type` field checked to prevent access token used as refresh |
| Refresh token replay | Token rotation — each refresh revokes the old JTI in DB; revoked tokens rejected |
| Cross-tenant leakage | `sameBranch()` middleware + all Prisma queries include `branch_id` filter |
| SQL injection | Prisma parameterized queries; raw `$queryRaw` uses `Prisma.sql` tagged templates (no string interpolation) |
| XSS | `helmet()` sets `Content-Security-Policy`, `X-XSS-Protection` headers |
| CSRF | Stateless JWT bearer (no cookies) — CSRF not applicable |
| Password storage | `bcryptjs` with cost factor 12 |
| Sensitive env exposure | Zod `envSchema` validates all env vars at startup; process exits if any missing |
| File upload abuse | Multer enforces `UPLOAD_MAX_SIZE_MB` (default 10 MB) |
| Brute force | `authRateLimit`: 10 attempts / 15 min per IP on `/auth` routes |
| Information leakage | Error handler strips stack traces in production; only message exposed |
| Audit trail | Every mutation through `audit()` middleware writes actor, resource, diff to `audit_logs` |

---

## 12. Rate Limiting

Three tiers, all using `express-rate-limit` with in-memory store (upgradeable to Redis store for multi-instance):

| Limiter | Window | Max | Applied to |
|---------|--------|-----|-----------|
| `globalRateLimit` | 60 s | 100 req/IP | All routes |
| `authRateLimit` | 15 min | 10 req/IP | `/auth/login`, `/auth/patient/send-otp` |
| `strictRateLimit` | 60 s | 5 req/IP | Sensitive write endpoints |

Response on hit: `HTTP 429` with `{ success: false, message: "Too many requests..." }` and `Retry-After` header.

---

## 13. Audit & Logging

### Audit Log (compliance)

The `audit(resource, action)` middleware is a route-level decorator:

```typescript
router.patch('/patients/:id', audit('Patient', 'UPDATE'), controller.update);
```

Captured fields: `branch_id`, `user_id`, `action`, `resource`, `resource_id`, `changes` (request body), `ip_address`, `user_agent`, `created_at`.

Queriable via `GET /superadmin/audit-logs?branch_id=&user_id=&resource=`.

### Application Logging (Winston)

```
logs/
  error.log   — ERROR level only
  combined.log — All levels
  console     — colorized (development only)
```

Log levels: `error → warn → info → debug` (controlled via `LOG_LEVEL` env var).

Morgan HTTP logs feed into the same Winston pipeline via a stream adapter.

---

## 14. Environment & Configuration

All config is validated at startup via Zod. The server **exits with a clear error** if any required variable is missing.

```env
# Server
PORT=8000
NODE_ENV=development
API_PREFIX=/api/v1

# Database (NeonDB PostgreSQL)
DATABASE_URL=postgresql://...

# Redis (optional — graceful fallback)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=<32+ chars>
JWT_REFRESH_SECRET=<32+ chars>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# CORS (comma-separated Vite origins)
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=10

# File uploads
UPLOAD_MAX_SIZE_MB=10

# Logging
LOG_LEVEL=debug
LOG_DIR=logs
```

---

## 15. Deployment

### Local Development

```bash
npm run dev          # tsx watch — hot reload
npm run db:push      # sync Prisma schema to DB (no migration file)
npm run db:seed      # seed roles + default users
npm run db:studio    # Prisma Studio GUI
```

### Production Build

```bash
npm run build        # tsc → dist/
npm start            # node dist/server.js
```

### Docker

```bash
docker-compose up --build   # Starts API + PostgreSQL + Redis
```

`Dockerfile` uses Node 20 Alpine. `docker-compose.yml` wires the three services with health checks.

### Seed Accounts

| Role | Email | Password |
|------|-------|---------|
| FOUNDER | superadmin@curahospital.in | SuperAdmin@123 |
| BRANCH_ADMIN | branchadmin@curahospital.in | Admin@123 |
| DOCTOR | dr.arun@curahospital.in | Doctor@123 |
| NURSE | nurse@curahospital.in | Nurse@123 |
| RECEPTIONIST | reception@curahospital.in | Reception@123 |

---

## 16. Scalability Considerations

### Current Architecture (single instance)

Works well for: ≤ 20 hospitals, ≤ 50 branches, moderate concurrent traffic.

### Bottlenecks & Path Forward

| Bottleneck | Solution |
|-----------|---------|
| Rate limiter — in-memory | Swap to `rate-limit-redis` store, shared across instances |
| Socket.io — single node | Add `@socket.io/redis-adapter` — rooms replicated across nodes via Redis pub/sub |
| Heavy analytics queries | Move to a read replica or dedicated analytics DB; cache results in Redis |
| File storage (Multer local) | Replace with S3 / Cloudflare R2; Multer → `multer-s3` |
| Background jobs (BullMQ) | Already Redis-backed — just scale workers separately |
| DB connection pool | NeonDB serverless auto-pools; for self-hosted PostgreSQL → PgBouncer |
| Long-running reports | Move to BullMQ job → send result via `emit.notifyUser()` when done |

### Horizontal Scaling (future)

```
Load Balancer (Nginx / ALB)
  ├── API Instance 1
  ├── API Instance 2      ← all sharing same PostgreSQL + Redis
  └── API Instance N
          │
    Redis (shared)
      ├── Rate limit counters  (rate-limit-redis)
      ├── Socket.io adapter    (@socket.io/redis-adapter)
      └── BullMQ queues        (already wired)
```

---

## 17. API Quick Reference

### Auth

```
POST /auth/login                   → { access_token, refresh_token, user }
POST /auth/refresh                 → { access_token, refresh_token }
POST /auth/logout                  → 204
POST /auth/patient/send-otp        → 200
POST /auth/patient/verify-otp      → { access_token, refresh_token, patient }
```

### Core Clinical

```
GET/POST      /patients
GET/PUT/PATCH /patients/:id
GET/POST      /appointments
PATCH         /appointments/:id/status
GET/POST      /doctors
GET/POST      /departments
GET/POST      /ipd/admissions
PATCH         /ipd/admissions/:id/discharge
GET/POST      /ipd/wards
GET/POST      /ipd/beds
PATCH         /ipd/beds/:id/status
```

### OPD Queue

```
GET  /queue?doctor_id=&date=      → live queue
POST /queue                       → add to queue / issue token
PUT  /queue/:id                   → update status
```

### Lab & Pharmacy

```
GET/POST      /laboratory/orders
PATCH         /laboratory/orders/:id/status
POST          /laboratory/results/:orderId
GET/POST      /lab-catalog/tests
GET/POST      /pharmacy/prescriptions
PATCH         /pharmacy/prescriptions/:id/dispense
GET/POST      /inventory/items
GET/POST      /inventory/batches
```

### Billing

```
GET/POST      /billing/bills
POST          /billing/bills/:id/payments
GET           /billing/bills/:id/statement
POST          /billing/refunds
GET/POST      /insurance/claims
```

### Emergency & Blood Bank

```
GET/POST      /emergency/cases
PATCH         /emergency/cases/:id/status
GET/POST      /blood-bank/inventory
GET/POST      /blood-bank/requests
PATCH         /blood-bank/requests/:id/issue
```

### SuperAdmin — Platform Management

```
GET           /superadmin/hospitals
POST          /superadmin/hospitals
GET/PUT/PATCH /superadmin/hospitals/:id
GET/POST      /superadmin/hospitals/:id/branches
GET           /superadmin/users
POST          /superadmin/users
PATCH         /superadmin/users/:id/status
PATCH         /superadmin/users/:id/role
GET           /superadmin/subscriptions
PATCH         /superadmin/subscriptions/:id
GET           /superadmin/audit-logs
GET           /superadmin/analytics/overview
GET           /superadmin/analytics/revenue
```

### SuperAdmin — Dashboard Command Center

```
GET /superadmin/dashboard/command              → 6 KPI cards
GET /superadmin/dashboard/priority-alerts      → critical cases needing attention
GET /superadmin/dashboard/live-opd             → real-time OPD queue by doctor
GET /superadmin/dashboard/bed-control          → ward-level occupancy breakdown
GET /superadmin/dashboard/appointment-trend    → daily trend (7–90 days)
GET /superadmin/dashboard/revenue-control      → today/week/month + by hospital + daily chart
GET /superadmin/dashboard/departments          → per-department performance

All accept: ?hospital_id=   to scope to one hospital
/appointment-trend also: ?days=7|30|90
```

### B2C Patient Portal

```
GET  /b2c/profile
PUT  /b2c/profile
GET  /b2c/appointments
POST /b2c/appointments
GET  /b2c/medical-records
GET  /b2c/lab-results
GET  /b2c/notifications
GET  /b2c/bills
```

---

*Document auto-generated from codebase — May 2026*
