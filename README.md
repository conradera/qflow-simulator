# QFlow 

**Smart Virtual Queue Management System** for **Mukono Health Centre IV**.

QFlow is a real-time web app that manages patient queues across multiple service points (OPD triage, consultation, pharmacy, laboratory, cashier). Patients can join via USSD/SMS simulation, walk-in registration, or a public web form. Staff manage the live queue from an admin console; a waiting-area display board updates in real time.

Persistence and realtime sync use **Supabase** (Postgres). Patient-facing messages and SMS replies use **OpenRouter** free models, with template fallbacks when AI is unavailable.

---

## Problem

At busy facilities like **Mukono Health Centre IV**, patients often wait in long physical lines with little visibility into when they will be served. Staff manage multiple service points (triage, consultation, pharmacy, lab, cashier) with paper lists or informal queues, which makes it hard to:

- Know who is next across departments
- Prioritise emergencies, pregnant women, elderly patients, and people with disabilities
- Notify patients when their turn is approaching without calling names across a crowded waiting area
- Track patient status and service history for accountability and reporting
- Reduce crowding and confusion in the waiting area

Without a shared digital queue, wait times feel unpredictable, vulnerable patients can be overlooked, and staff spend time coordinating instead of serving.

---

## Solution

**QFlow** is a smart virtual queue system that moves patients from standing in line to joining a managed digital queue—via USSD/SMS-style flows, walk-in registration, or a public web form—and keeps everyone updated in real time.

| Challenge | How QFlow addresses it |
| --- | --- |
| Long, opaque physical queues | Virtual tickets (`QF-###`) with queue position and estimated wait |
| Multiple service desks | Separate queues and service points for OPD triage, consultation, pharmacy, laboratory, and cashier |
| Special / urgent cases | Priority levels (normal, high, urgent) and care-status colour coding (green / yellow / red) |
| Patients missing their turn | SMS-style notifications (join, turn next, completed) with AI-assisted messaging |
| Crowded waiting areas | Public `/display` board and QR tickets so patients can wait nearby and verify their place |
| No operational record | Live admin console, event log, and `/history` with worked duration for completed visits |

Staff run the queue from a protected admin console (call next, complete, no-show, service-point controls). Patients and visitors use public registration and display screens. The system persists state in Supabase and syncs all clients instantly via Realtime, with an optional training mode for demos and staff practice.

---

## Features

- **Live queue** — join, call next, complete, no-show, and service-point controls backed by Supabase
- **Realtime updates** — admin dashboard, phone simulator, and public display stay in sync via Supabase Realtime
- **Multi-channel intake** — USSD / SMS phone simulator, walk-in (admin), and public `/register` form
- **Priority handling** — normal, high, and urgent patients (e.g. emergencies, vulnerable groups)
- **Care status colour coding** — green (normal), yellow (attention), red (emergency/critical)
- **QR tickets** — ticket QR codes for verification; registration poster for waiting areas
- **SMS-style chat** — system notifications plus AI auto-replies to patient messages
- **Public display board** — `/display` for waiting-area screens
- **Service history** — `/history` with worked duration for completed patients
- **Training mode** — in-memory simulator for demos without relying on live mutations
- **Admin auth** — optional password-protected console (`ADMIN_PASSWORD`); `/display` and `/register` stay public

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Language | TypeScript |
| UI | React 18, Next.js 14 (App Router) |
| Styling | Tailwind CSS |
| Database | Supabase (Postgres + Realtime + RLS) |
| AI | OpenRouter (`openrouter/free`) |
| Charts | Chart.js / react-chartjs-2 |
| QR | qrcode.react |

---

## Prerequisites

- **Node.js** 18+ (recommended)
- **npm** (or yarn / pnpm / bun)
- A **Supabase** project ([supabase.com](https://supabase.com))
- An **OpenRouter** API key ([openrouter.ai](https://openrouter.ai)) — optional but recommended for AI messages

---

## Quick start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.local.example .env.local
```

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (for persistence) | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Yes (for persistence) | Supabase publishable / anon key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Fallback | Used if the publishable key is not set |
| `OPENROUTER_API_KEY` | Optional | Enables AI wait estimates, patient messages, and SMS replies |
| `OPENROUTER_MODEL` | Optional | Defaults to `openrouter/free` |
| `ADMIN_PASSWORD` | Recommended in production | Enables admin login for protected routes |
| `ADMIN_SESSION_SECRET` | Optional | Cookie signing secret; falls back to a derived value if unset |

Without Supabase env vars, the app can still run in a limited way (training / in-memory behaviour). Without `OPENROUTER_API_KEY`, template messages are used instead of AI.

### 3. Apply the database schema

In the Supabase dashboard, open **SQL Editor** and run the migration files in order under `supabase/migrations/`:

1. `20250314000000_initial_schema.sql` — core tables, enums, RLS
2. `20260314195000_patient_visit_reason.sql`
3. `20260314210000_patient_service_history.sql`
4. `20260315000000_telephone_care_status.sql`
5. `20260315120000_enable_realtime.sql` — Realtime publication
6. `20260315180000_history_telephone.sql`

Or, with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase db push
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Production build

```bash
npm run build
npm start
```

---

## Application routes

| Route | Access | Purpose |
| --- | --- | --- |
| `/` | Admin (if auth enabled) | Main console: live dashboard + phone simulator; training mode toggle |
| `/login` | Public | Admin password login |
| `/display` | Public | Waiting-area queue board (Realtime) |
| `/register` | Public | Patient self-registration + QR ticket |
| `/history` | Admin (if auth enabled) | Completed patient service history |

When `ADMIN_PASSWORD` is set, middleware protects non-public pages and most APIs. Public paths include `/display`, `/register`, `/login`, and `POST /api/queue/join` / `POST /api/auth/login`.

---

## How it works

### Live mode (default)

1. **Supabase Postgres** is the source of truth.
2. Mutations go through `/api/queue/*` → `src/lib/queueService.ts`.
3. Connected clients subscribe via `useQueueRealtime` and update instantly.

### Training mode

Toggle training mode on the main page to run an in-memory `QueueSimulator` (`src/lib/queueEngine.ts`) for demos and training, with optional debounced Supabase sync.

### Typical patient journey

1. Patient joins via USSD/SMS simulator, `/register`, or admin walk-in.
2. System assigns ticket `QF-###`, queue position, estimated wait, and a join notification (AI or template).
3. Admin **Call Next** assigns the patient to an available service point.
4. Admin **Complete** (or **No-show**) updates status; history is recorded on completion.
5. Display board and SMS thread reflect changes in real time.

---

## API overview

### Queue

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/queue/join` | Add a patient to the queue (public) |
| `POST` | `/api/queue/serve` | Call / serve next patient at a service point |
| `POST` | `/api/queue/complete` | Mark current service as completed |
| `POST` | `/api/queue/no-show` | Mark a waiting patient as no-show |
| `POST` | `/api/queue/service-point` | Update service point status |

### AI

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/ai/user-message` | Generate join / turn-next / completed messages |
| `POST` | `/api/ai/sms-reply` | Auto-reply to patient SMS |
| `POST` | `/api/ai/estimate-wait` | AI-assisted wait-time estimate |

### Auth

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Create admin session cookie |
| `POST` | `/api/auth/logout` | Clear admin session |

---

## Domain model (summary)

### Service types

- `opd-triage` — OPD Triage  
- `consultation` — Doctor Consultation  
- `pharmacy` — Pharmacy  
- `laboratory` — Laboratory  
- `cashier` — Cashier  

### Patient priority

- `normal` · `high` · `urgent`

### Patient status

- `waiting` · `serving` · `completed` · `no-show`

### Channels

- `ussd` · `sms` · `app` · `walk-in`

### Core Supabase tables

| Table | Role |
| --- | --- |
| `patients` | Queue tickets, status, priority, service, timestamps |
| `service_points` | Desks / counters and current patient |
| `queue_events` | Append-only event log |
| `notifications` | Patient-facing messages |
| `patient_service_history` | Completed visits + worked duration |
| `simulation_config` | Training / simulator settings |
| `metrics_snapshots` | Periodic metrics for charts |

RLS is enabled with permissive policies suitable for simulator / development use. Tighten policies before a production hospital deployment.

---

## Project structure

```
qflow-simulator/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main admin + phone console
│   │   ├── display/              # Public waiting-area board
│   │   ├── register/             # Public patient registration
│   │   ├── history/              # Completed service history
│   │   ├── login/                # Admin login
│   │   └── api/                  # Queue, AI, and auth routes
│   ├── components/               # AdminDashboard, PhoneSimulator, QR, layout, …
│   ├── hooks/                    # useQueueRealtime, useTrainingSimulator
│   ├── lib/                      # queueService, queueEngine, supabase, validation, AI
│   └── middleware.ts             # Admin auth gate
├── supabase/migrations/          # Postgres schema + Realtime
├── SYSTEM_OVERVIEW.md            # Deeper architecture notes
├── .env.local.example
└── package.json
```

### Useful code entry points

| Concern | Location |
| --- | --- |
| Live queue mutations | `src/lib/queueService.ts` |
| Realtime subscription | `src/hooks/useQueueRealtime.ts` |
| Training simulator | `src/lib/queueEngine.ts`, `src/hooks/useTrainingSimulator.ts` |
| Admin UI | `src/components/AdminDashboard.tsx` |
| Phone (USSD + SMS) | `src/components/PhoneSimulator.tsx` |
| Care status colours | `src/lib/patientStatus.ts` |
| Input validation | `src/lib/validation.ts` |
| OpenRouter client | `src/lib/openrouter.ts` |

For a fuller architecture walkthrough, see [`SYSTEM_OVERVIEW.md`](./SYSTEM_OVERVIEW.md).

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Next.js development server |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm run lint` | Run ESLint |

---

## Deployment notes

1. Set all required env vars in your host (e.g. Vercel).
2. Ensure Supabase migrations (including Realtime) are applied.
3. Set a strong `ADMIN_PASSWORD` (and preferably `ADMIN_SESSION_SECRET`).
4. Keep `/display` and `/register` reachable for kiosks and waiting-area screens.
5. Review and harden Supabase RLS before exposing the system beyond a controlled demo.

Deploy on any Node-compatible host that supports Next.js 14. [Vercel](https://vercel.com) is the simplest option for this stack.

---

## License

Private project (`"private": true` in `package.json`). Adjust licensing as needed for your organisation.
