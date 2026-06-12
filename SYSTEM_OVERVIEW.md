# QFlow Live — System Overview

## Purpose

QFlow is a **real-time virtual queue** system for **Mukono Health Centre IV**. It manages and persists:

- Patients joining a queue (USSD / SMS / walk-in / app)
- Service points serving patients across multiple services
- Operational events + notifications sent to patients
- History of completed patients (with worked time)

It is designed to run entirely as a web app with **Supabase as the database** and **OpenRouter free models** for AI-generated patient messaging.

## Languages & frameworks

- **TypeScript**: used across UI, API routes, and simulator engine.
- **React**: all UI components.
- **Next.js (App Router)**: pages + server API routes.
- **Tailwind CSS**: UI styling (utility-first).
- **Supabase (Postgres + REST + RLS)**: persistence and querying.
- **OpenRouter**: AI model routing (configured to use `openrouter/free`).

## High-level architecture

### Runtime components

- **Queue service** (`src/lib/queueService.ts`)
  - Live mutations: join, serve, complete, no-show, service-point toggle. Writes directly to Supabase.
- **Realtime hook** (`src/hooks/useQueueRealtime.ts`)
  - Subscribes to Supabase Realtime on `patients`, `service_points`, `queue_events`, `notifications`.
- **Queue API routes** (`src/app/api/queue/*`)
  - Authoritative server endpoints for all live queue operations.
- **Main app page** (`src/app/page.tsx`)
  - **Live mode (default):** realtime hook + API mutations. **Training mode (toggle):** in-memory simulator for demos.
- **Admin UI** (`src/components/AdminDashboard.tsx`)
  - Live queue table, service point controls, events, and patient chat panel.
- **Phone UI** (`src/components/PhoneSimulator.tsx`)
  - USSD join flow + SMS thread; joins live queue via `/api/queue/join`.
- **Display screen** (`src/app/display/page.tsx`)
  - Public waiting-area board with Supabase Realtime updates.
- **History page** (`src/app/history/page.tsx`)
  - Reads completed-patient history from Supabase and displays “worked time”.
- **Simulator engine** (`src/lib/queueEngine.ts`) — training mode only.

### Data flow (source of truth)

**Live mode (default):**

1. **Supabase Postgres** is the authoritative source of truth.
2. Mutations go through `/api/queue/*` → `queueService.ts`.
3. All connected clients receive instant updates via **Supabase Realtime**.

**Training mode (admin toggle):**

1. In-memory `QueueSimulator` drives state with debounced Supabase writes (legacy demo behaviour).

## Database schema (Supabase)

### Core tables

- `**patients`**
  - Primary key: `id` (in this project, new patients use the ticket number, e.g. `QF-001`)
  - Captures: `name`, `phone`, `visit_reason`, `service_type`, `priority`, `status`, `channel`, queue position and timestamps.
- `**service_points**`
  - Represents service desks for each service type.
  - Tracks `status`, average service time, and `current_patient_id`.
- `**queue_events**`
  - Append-only event log (`join`, `serve`, `complete`, `alert`).
- `**notifications**`
  - Messages sent to patients (`joined`, `turn_next`, `completed`).
- `**simulation_config**`
  - Stores simulator settings + saved simulation time state.
- `**metrics_snapshots**`
  - Stores periodic metrics snapshots for charts.
- `**patient_service_history**`
  - Stores completed-patient history.
  - Includes `worked_duration_sec` (computed from simulator timestamps).

### Security model (RLS)

For simulator/dev usage, RLS is enabled on QFlow tables with **allow-all policies** (read/write permitted for all requests using the publishable/anon key).

## Key user flows

### 1) Patient joins via USSD

1. Patient uses the phone simulator USSD menu.
2. USSD flow collects:
  - service type
  - priority
  - **patient name**
  - **patient contact**
  - **reason for visit**
3. `POST /api/queue/join` validates input and creates the patient in Supabase.
4. `queueService` generates ticket `QF-###`, recalculates queue positions, inserts **join event** + **notification**.
5. Notification uses AI (OpenRouter) with template fallback.
6. All clients update instantly via Supabase Realtime.

### 2) Serving and completing patients (Admin)

1. Admin clicks **Call Next** to assign the next waiting patient to an available service point (`serveNext`).
2. Admin clicks **Complete** to finish service (`completeService`).
3. On completion:
  - patient status becomes `completed`
  - completion event + notification are persisted
  - a record is upserted to `**patient_service_history`**

### 3) SMS “chat” + auto-reply

- The phone’s SMS screen is a thread containing:
  - system notifications (join/turn/completed) and
  - patient messages the user types.
- When a patient sends an SMS:
  - the app calls `/api/ai/sms-reply` (OpenRouter `openrouter/free`)
  - an AI reply is appended to the conversation.
- Admin can also send messages via the dashboard chat panel (shared timeline).

### 4) History page

- `/history` loads rows from `patient_service_history`.
- Shows worked time and completion timestamp for each completed patient.

## AI integration (OpenRouter)

AI is used for:

- **Patient-facing messages** (join / turn next / completed) via `src/app/api/ai/user-message/route.ts`
- **SMS auto-replies** via `src/app/api/ai/sms-reply/route.ts`

Both are configured to use:

- `model: openrouter/free`

## Environment variables

Required for Supabase persistence:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (preferred)  
(fallback supported: `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

Required for AI:

- `OPENROUTER_API_KEY`

## Where to look in the code

- **Live queue service**: `src/lib/queueService.ts`
- **Realtime hook**: `src/hooks/useQueueRealtime.ts`
- **Queue API**: `src/app/api/queue/`
- **Supabase sync**: `src/lib/queueSupabaseSync.ts`
- **Main app**: `src/app/page.tsx`
- **Live header / sidebar**: `src/components/layout/`
- **Admin dashboard**: `src/components/AdminDashboard.tsx`
- **Phone (USSD + SMS)**: `src/components/PhoneSimulator.tsx`
- **Display screen**: `src/app/display/page.tsx`
- **Training simulator**: `src/lib/queueEngine.ts`, `src/hooks/useTrainingSimulator.ts`
- **AI routes**: `src/app/api/ai/`



FEATURES IDENTIFIED DURING GROUP MEETING
 Telephone number field to be included in the database.
 Data type validation and input validation for all forms.
 System diagrams (Use Case Diagram, DFD, ERD, Activity Diagram, etc.).
 Hospital support features such as queue and waiting area management.
 Handling special cases such as emergencies, pregnant women, elderly patients, and
people with disabilities.
 Patient status tracking.
 Status colour coding: Green (Normal), Yellow (Attention Required), Red
(Emergency/Critical).
 QR code generation for queue tickets and patient verification.
 SMS notifications when a patient's turn is approaching.
 Display screen showing current queue numbers.
 SMS notifications when a patient's turn is approaching.