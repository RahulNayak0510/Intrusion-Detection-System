# Running the NIDS Project

Two ways to run: **Native (fast local dev)** or **Docker (one-command full stack)**.

---

## ⚠️ Safety First

- Use only on networks and systems you **own or are explicitly authorized to monitor**.
- Live traffic capture is **opt-in** (not on by default).
- No payload storage, no credential capture, no auto-blocking.
- ML anomaly scores are **heuristic only** — they never replace Suricata rule-based alerts.

---

## Method A — Native Local Dev (Fastest)

No Docker, no MySQL. Uses SQLite for the database. Best for coding and debugging.

### Prerequisites

| Tool | Minimum Version | How to check |
|---|---|---|
| Python | 3.11+ | `python --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |

### Step 1 — Configure Environment

The `.env` file is already set up for native SQLite dev. If you need to create it:

```bash
# Linux/macOS
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

**Minimum settings to review in `.env`:**

```
DATABASE_URL=sqlite:///./nids_local.db          # SQLite local DB (no MySQL needed)
FIRST_ADMIN_USERNAME=analyst                     # Your analyst login
FIRST_ADMIN_PASSWORD=DemoAnalyst123!             # Set a strong password
JWT_SECRET=change-me-to-a-long-random-string     # Important for production
```

### Step 2 — Install Backend Dependencies

```bash
# From the project root
pip install -r backend/requirements.txt
```

> **If you get build errors for scikit-learn / pydantic-core on Python 3.14+:**
> The pinned versions in requirements.txt may lack wheels for very new Pythons.
> Install unpinned compatible versions instead:
> ```bash
> pip install fastapi uvicorn[standard] starlette python-multipart \
>   pydantic pydantic-settings email-validator SQLAlchemy PyMySQL \
>   cryptography alembic "python-jose[cryptography]" "passlib[bcrypt]" \
>   bcrypt httpx structlog python-json-logger pytest pytest-asyncio \
>   numpy scipy scikit-learn joblib threadpoolctl greenlet
> ```

### Step 3 — Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

### Step 4 — Start the Backend (FastAPI)

**Terminal 1 (from project root):**

```bash
# Linux / macOS / PowerShell
$env:PYTHONPATH="backend"       # PowerShell
# export PYTHONPATH="backend"   # Linux/macOS

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Wait for these log lines:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
sample_replay_startup ... inserted: 13 ...  # sample events ingested
```

Verify health: open http://localhost:8000/health — you should see `{"status":"ok","db":"ok"}`.

Swagger / interactive API docs: http://localhost:8000/docs

### Step 5 — Start the Frontend (Vite)

**Terminal 2:**

```bash
cd frontend
npm run dev
```

Wait for:
```
VITE v5.x.x  ready in X ms
➜  Local:   http://localhost:3000/
```

### Step 6 — Sign In

Open **http://localhost:3000** in your browser and sign in with:

- Username: the `FIRST_ADMIN_USERNAME` from your `.env` (default: `analyst`)
- Password: the `FIRST_ADMIN_PASSWORD` from your `.env` (default: `DemoAnalyst123!`)

### Step 7 — Load Sample Data

The backend auto-ingests the 16 sample EVE events on first startup
(`data/sample_eve.json`). If the dashboard is empty:

1. Click **"Replay sample"** in the top-right of Dashboard or Alerts page, OR
2. Call the API directly:
   ```bash
   # Get a token first via /api/auth/login, then:
   curl -X POST -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/api/admin/replay-sample
   ```

### Stopping the App

- Backend: `Ctrl+C` in Terminal 1
- Frontend: `Ctrl+C` in Terminal 2

---

## Method B — Docker Compose (Full Stack, Production-like)

MySQL + Backend + Frontend in containers. Includes Alembic migrations.

### Prerequisites

- Docker Engine ≥ 24
- Docker Compose v2

Verify:
```bash
docker --version
docker compose version
```

### Step 1 — Configure Environment

```bash
# Linux/macOS
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Edit `.env` and **set these** (remove SQLite `DATABASE_URL` line since Docker uses MySQL):

```
# Comment or delete this line for Docker:
# DATABASE_URL=sqlite:///./nids_local.db

MYSQL_DATABASE=idsdb
MYSQL_USER=ids_user
MYSQL_PASSWORD=set-a-strong-mysql-password
MYSQL_ROOT_PASSWORD=set-a-strong-root-password
FIRST_ADMIN_USERNAME=analyst
FIRST_ADMIN_PASSWORD=set-a-strong-admin-password
JWT_SECRET=use-a-long-random-string-here-32-char-minimum
```

### Step 2 — Start Everything

```bash
docker compose up -d --build
```

First build takes ~2–5 minutes. What happens:

1. MySQL 8.0 starts → `idsdb` created → `ids_user` provisioned
2. Alembic migrations run (`alembic upgrade head`)
3. First admin user is seeded from `.env`
4. ~16 sample EVE events are ingested (if `AUTO_REPLAY_SAMPLE_ON_STARTUP=1`)
5. Frontend comes up → http://localhost:3000
6. Backend docs → http://localhost:8000/docs

### Step 3 — Verify

```bash
# Backend health
curl http://localhost:8000/health
# -> {"status":"ok","db":"ok"}

# Running containers
docker compose ps
```

### Step 4 — Sign In

Open http://localhost:3000 with your `FIRST_ADMIN_USERNAME` / `FIRST_ADMIN_PASSWORD`.

### Useful Docker Commands

```bash
# View logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mysql

# Run backend tests (inside the pinned container env)
docker compose run --rm backend pytest tests -q

# Run Alembic migration manually
docker compose exec backend alembic upgrade head

# Stop (preserves DB volume)
docker compose down

# Stop + DELETE everything (DB data wiped!)
docker compose down -v

# Rebuild after code changes
docker compose up -d --build backend
docker compose up -d --build frontend
```

---

## 🧪 Running Tests

```bash
# Native (requires backend deps installed)
cd backend
pytest tests -q

# Docker (recommended — matches pinned deps)
docker compose run --rm backend pytest tests -q
```

Test coverage:
- Event parsing + normalization (alert/flow/dns/http/tls)
- Malformed/blank/duplicate line handling
- SHA-1 dedup key determinism
- API filtering, severity/type/src/dst/time range/sort/pagination/search
- Acknowledge + immutable notes + author attribution
- Dashboard summary aggregates
- Isolation Forest: training, prediction, outlier scoring

---

## 🌐 Connecting Real Suricata (Optional)

Live capture is **off by default**. Two options:

### Option 1 — External Suricata (Recommended)

Install Suricata on a span/mirror port of a network you own. Mount its log dir:

Create `docker-compose.override.yml`:
```yaml
services:
  backend:
    volumes:
      - ./data:/app/data:ro
      - /path/to/your/suricata/logs:/eve:ro
    environment:
      EVE_FILE_PATH: /eve/eve.json
      AUTO_REPLAY_SAMPLE_ON_STARTUP: 0
```

Then `docker compose up -d --build backend`.

### Option 2 — Built-in Sensor Profile (Stub)

```bash
docker compose --profile sensor up -d
```

This starts a stub container. You must override the entrypoint to wire it to an authorized interface. **You bear full responsibility for lawful deployment.**

---

## 📂 Project Layout

```
Intrusion-Detection-System/
├── backend/
│   ├── alembic/               Alembic migrations (0001_initial.py)
│   ├── app/
│   │   ├── anomaly/           Isolation Forest scorer + feature extractor
│   │   ├── core/              Settings, JWT/bcrypt security, JSON logging
│   │   ├── db/                SQLAlchemy session engine
│   │   ├── ingestion/         EVE JSON parser + file tailer (reader.py)
│   │   ├── models/            ORM: Event, User, AnalystNote, Checkpoint
│   │   ├── routers/           FastAPI: auth, events, dashboard
│   │   ├── schemas/           Pydantic request/response schemas
│   │   ├── services/          Business logic (list_events, dashboard_summary, etc.)
│   │   └── main.py            FastAPI app, lifespan, background jobs
│   ├── tests/                 Pytest suite (in-memory SQLite)
│   └── requirements.txt       Pinned Python deps
├── frontend/
│   ├── src/
│   │   ├── pages/             DashboardPage, AlertsPage, AlertDetailPage, LoginPage
│   │   ├── components/        AppShell, AlertTable, FilterPanel, States, ui/
│   │   ├── lib/api.ts         Axios client + typed API helpers, auth token storage
│   │   ├── tokens.ts          SecOps palette, severity colors
│   │   ├── types.ts           TypeScript types mirroring backend schemas
│   │   └── main.tsx           React Router + TanStack Query setup
│   ├── vite.config.ts         Port 3000, proxies /api → :8000
│   └── package.json
├── data/
│   ├── sample_eve.json        16 demo EVE events (auto-ingested on startup)
│   └── empty_eve.json         Safe idle default for EveFileReader
├── .docker/mysql-init/        01-app-user.sql — creates ids_user@%
├── .env                       Your local config (NOT committed)
├── .env.example               Template with all options
├── docker-compose.yml         MySQL + backend + frontend (+ optional sensor)
└── README.md
```

---

## ❓ Troubleshooting

| Symptom | Fix |
|---|---|
| Backend exits on startup, `alembic upgrade head` fails | Wait for MySQL healthy (compose uses `depends_on: condition: service_healthy`). If still flaky: `docker compose restart backend`. |
| Dashboard empty but `/health` says ok | Ensure `AUTO_REPLAY_SAMPLE_ON_STARTUP=1`. Click **"Replay sample"** button or call `POST /api/admin/replay-sample`. |
| Events appear missed | Tailer stores offset in `ingestion_checkpoints`. Delete that row or wipe DB: `docker compose down -v` / delete `nids_local.db`. |
| `sensor` container didn't start | Intentional. Start with `docker compose --profile sensor up -d`. |
| Anomaly scores are null | Requires all three: `ANOMALY_ENABLED=true`, `event_type = flow`, AND ≥50 flow events for training baseline. |
| Native: Python import errors | Ensure `PYTHONPATH=backend` is set before running uvicorn. |
| Native: Port 3000 or 8000 busy | Kill the old process or change ports: `vite.config.ts` → `server.port`, uvicorn → `--port 8001`. |
