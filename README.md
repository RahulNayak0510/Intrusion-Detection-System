<div align="center">

# 🔒 Network Intrusion Detection System (NIDS)

**A defensive, analyst-friendly platform for ingesting, reviewing, and triaging Suricata alerts.

</p>

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%20%7C%20Python%203.11-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React%2018%20%7C%20TypeScript-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![MySQL](https://img.shields.io/badge/Database-MySQL%208.0-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Docker](https://img.shields.io/badge/Deployment-Docker%20Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![scikit-learn](https://img.shields.io/badge/ML-scikit--learn-F7931E?style=for-the-badge&logo=scikit-learn&logoColor=white)](https://scikit-learn.org/)

</div>

---

> ## ⚠️ SAFETY FIRST — READ BEFORE RUNNING

| Rule | Status |
|---|---|
| ✅ **Authorized networks only | Use only on networks and systems you own or are explicitly authorized to monitor. |
| ✅ **Passive by default** | Does NOT capture live traffic out of the box — live capture is **opt-in** via a Docker profile. |
| ✅ **No payload storage** | Event metadata only; packet payloads are never persisted. |
| ✅ **No credential capture** | No credential-harvesting logic of any kind. |
| ✅ **No auto-block** | Detection & triage only; zero automatic response. |
| ✅ **Anomaly score is heuristic only | ML scores are a *secondary signal*. They never replace Suricata rules. |

---

## ✨ Features

- **📥 Robust ingestion pipeline** — file-tails Suricata EVE JSON with tolerance for malformed lines, duplicates, log rotation, and transient read errors. Idempotent writes via SHA-1 dedup key.
- **🗄️ Normalized MySQL schema** — SQLAlchemy 2.x ORM, Alembic migrations, `utf8mb4`, UTC timestamps, JSON detail column, and 7 indexes covering every common search.
- **🔐 Analyst auth & audit trail** — JWT auth. First admin seeded from env on an empty users table. Immutable analyst notes with timestamps and author attribution in a separate `analyst_notes` table.
- **📊 SecOps dashboard** — Alert table as the primary workspace with severity badges, readable timestamps, endpoint cells, filter panel, pagination, sorting, and bulk-friendly per-row actions.
- **📈 Summary charts** — Alert counts over time, severity distribution, top talkers (src/dst IP bars) with labeled axes and legends.
- **🔎 Alert detail page** — Event-type-specific panels (alert / flow / dns / http / tls), enrichment badges, raw JSON view, acknowledgement toggle, note composer.
- **🌲 Optional Isolation Forest anomaly scoring** — Disabled by default. When enabled it trains on recent flow features and scores each flow with a clearly-labeled heuristic score + feature contribution breakdown. Never replaces Suricata alerts.
- **🐳 One-command Docker demo** — Bundled sample EVE events. `docker compose up -d --build` is enough to get a fully populated dashboard without live traffic.
- **🧪 Test suite** — Pytest suite runs without live traffic or MySQL (in-memory SQLite). Covers parsing, malformed-line tolerance, dedup, filters/sort/pagination, ack + immutable notes, anomaly training/prediction ordering.

---

## 📐 Architecture

```
                         ┌───────────────────────────────────────────────────────┐
                         │           Browser (http://localhost:3000)            │
                         │   React 18 + TS + Vite + Recharts + TanStack Query │
                         └───────────────────┬───────────────────────────────┘
                                             │  nginx reverse-proxies /api
                                             ▼
 ┌────────────────────────────────────────────────────────────────────────────────────┐
 │                        Backend (FastAPI · Python 3.11 · Uvicorn)                 │
 │                                                                                │
 │  ┌────────────┐  ┌────────────┐  ┌──────────────┐  ┌────────────────────────────┐  │
 │  │ /api/auth │  │ /api/events│  │ /api/dashboard│  │ EveFileReader (bg thread) │  │
 │  │  login/me   │  │ list/detail │  │ summary     │  │ tail + checkpoint + rotation │  │
 │  │ (JWT)      │  │ ack/notes │  │ top-talkers │  │ retention loop daily     │  │
 │  └─────┬──────┘  └─────┬──────┘  └──────┬───────┘  └───────────┬────────────────┘  │
 │        │               │                  │                    │                           │
 │        └───────────────┴────────────────┴────────────────┘                           │
 │                                        │                                        │
 │                           SQLAlchemy 2.x ORM · ids_user@app                               │
 └────────────────────────────────────────┬───────────────────────────────────────┘
                                          │
                                          ▼
                         ┌───────────────────────────────────────────────────────┐
                         │                   MySQL 8.0 Server                        │
                         │  utf8mb4 ·  · UTC · 7 indexes · events, users, │
                         │  analyst_notes, ingestion_checkpoints                │
                         └───────────────────────────────────────────────────────┘

          Suricata (opt-in, external or --profile sensor)
               └── EVE JSON ──► mounted path ──► EveFileReader
```

---

## 🚀 Quick start — one-command demo

### Prerequisites

- [Docker Engine ≥ 24 + Docker Compose v2](https://docs.docker.com/engine/install/)
- (Optional) [MySQL Workbench](https://dev.mysql.com/downloads/workbench/) for DB inspection

### 1. Clone & configure

```bash
git clone <your-repo-url>
cd Intrusion-Detection-System

# Copy env template
cp .env.example .env       # Linux/macOS
# Copy-Item .env.example .env   # Windows PowerShell
```

Edit `.env` and replace **every placeholder** before starting. You must at minimum set:
- `JWT_SECRET` to a strong random string
- `FIRST_ADMIN_USERNAME` / `FIRST_ADMIN_PASSWORD`

### 2. Start the stack

```bash
docker compose up -d --build
```

First run (about 2–5 minutes on first image build):
1. MySQL starts; `idsdb` is created and an app-only user `ids_user` is provisioned
2. Alembic migrations run (`alembic upgrade head`)
3. First admin is seeded from `.env`
4. ~16 bundled sample EVE events from `data/sample_eve.json` are ingested
5. Frontend comes up at **http://localhost:3000**
6. Backend OpenAPI docs at **http://localhost:8000/docs**

### 3. Log in

Open http://localhost:3000 and sign in with the credentials you set in `.env`.

### 4. Verify the pipeline

```bash
# Health check
curl http://localhost:8000/health
# => {"status":"ok","db":"ok"}

# Replay the sample events (idempotent)
curl -X POST -H "Authorization: Bearer <token> http://localhost:8000/api/admin/replay-sample
```

### 5. Stop or wipe

```bash
# Stop services; keep the DB volume
docker compose down

# ⚠️ Stop services and PERMANENTLY DELETE all events, users, notes, checkpoints
docker compose down -v
```

---

## 📸 Screenshots

> 💡 Run the app locally to see it in action at `http://localhost:3000` after following Quickstart above. Replace these placeholders with real screenshots:

| View | Description |
|---|---|
| **Dashboard** | Severity overview + alert time series, top talkers, and recent events. |
| **Alert table** | Sortable, filterable, paginated — the primary analyst workspace. |
| **Alert detail** | Event-type panels, anomaly score, enrichment, notes, ack toggle. |
| **Login** | JWT-based analyst authentication. |

---

## ⚙️ Configuration reference

All configuration is read from environment variables only. See [`.env.example`](.env.example) for the full list with inline comments.

| Variable | Purpose | Default |
|---|---|---|
| `MYSQL_HOST / MYSQL_PORT / MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD | MySQL connection | placeholders |
| `FIRST_ADMIN_USERNAME / FIRST_ADMIN_PASSWORD | First analyst account (seeded iff `users` is empty) | placeholders |
| `JWT_SECRET` | HMAC signing key — **set to a strong random value** | placeholder |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:3000` |
| `EVE_FILE_PATH` | Path Suricata EVE JSON log | `/app/data/empty_eve.json` (safe idle) |
| `AUTO_REPLAY_SAMPLE_ON_STARTUP` | `1` = ingest `data/sample_eve.json` on boot | `1` |
| `ANOMALY_ENABLED` | `true` = enable Isolation Forest secondary flow scoring | `false` |
| `SEVERITY_MAP_JSON` | Suricata int severity → `{HIGH,MEDIUM,LOW}` | `{"1":"HIGH","2":"MEDIUM","3":"LOW"}` |
| `ALLOWLIST_CIDRS` | Comma-separated CIDRs shown in UI as allowlisted (NOT suppressed) | private/loopback defaults |
| `RETENTION_DAYS` | Daily retention window; older events are pruned | `30` |

---

## 🔗 API quick reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | — | Health check + DB ping |
| `POST` | `/api/auth/login` | — | Credentials → JWT access token |
| `GET` | `/api/auth/me` | ✅ | Current analyst profile |
| `GET` | `/api/events` | ✅ | Filtered, sort, paginate: `?severity=&event_type=&src_ip=&dst_ip=&proto=&since=&until=&ack=&sort=&page=&page_size=` |
| `GET` | `/api/events/:id` | ✅ | Full event detail + notes |
| `PATCH` | `/api/events/:id/acknowledge` | ✅ | `{"acknowledged":true\|false}` |
| `POST` | `/api/events/:id/notes` | ✅ | Immutable analyst note `{"note":"..."}` |
| `GET` | `/api/dashboard/summary` | ✅ | Time series, severity counts, top talkers, recent events |
| `POST` | `/api/admin/replay-sample` | ✅ | Idempotent replay of sample EVE file |

Full interactive OpenAPI/Swagger UI: **http://localhost:8000/docs

---

## 🧪 Tests

Tests do **not** require live traffic, elevated privileges, or MySQL. Pure-logic tests use an in-memory SQLite engine and complete in seconds.

```bash
# Locally (requires Python 3.11+ compatible venv; sklearn wheel:
cd backend
pip install -r requirements.txt
pytest tests -q

# Recommended — run inside the containerized backend container (includes pinned deps):
docker compose run --rm backend pytest tests -q
```

Coverage:
- ✅ Event parsing + normalization (alert / flow / dns / http / tls)
- ✅ Malformed/blank/duplicate line handling
- ✅ Duplicate dedup key determinism
- ✅ Sample EVE contents integrity
- ✅ API filtering, severity/type/src/dst/time range/sort/pagination/search
- ✅ Acknowledge + immutable notes + author attribution
- ✅ Dashboard summary aggregates
- ✅ Isolation Forest: training, prediction, outlier > inlier score ordering, top-contribution heuristic labels

---

## 🌐 Connecting Suricata

Live capture is **off by default**. Two supported paths:

### A. External Suricata (recommended)

Install/authorize Suricata on a span/mirror port of a network you own. Share its `eve.json` output directory and mount it:

```yaml
# docker-compose.override.yml
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

### B. Built-in `sensor` profile (stub — wiring by default)

The `sensor` service ships with a safe stub entrypoint. To start it:

```bash
docker compose --profile sensor up -d
```

You must still explicitly wire the sensor service's entrypoint and attach it to an authorized interface you control. **You, the operator, bear all responsibility for lawful and acceptable-use compliance.

> Reminder: the app never auto-blocks, never injects packets, and never stores payloads. Run Suricata passively against a span port, never as an in-line IPS drops traffic.

---

## 🗂️ MySQL Workbench inspection

After `docker compose up -d`, MySQL listens on `127.0.0.1:3306`:

- Host | Value |
|---|---|
| Hostname | `127.0.0.1` |
| Port | `3306` |
| Username | `ids_user` (from `.env`) |
| Password | from `.env` |
| Default Schema | `idsdb` |

Expected tables after migration: `events`, `users`, `analyst_notes`, `ingestion_checkpoints`, `alembic_version`.

Manual Alembic: ` docker compose exec backend alembic upgrade head`

---

## 🤖 Anomaly scoring (optional · heuristic)

Set `ANOMALY_ENABLED=true` in `.env` to train an **Isolation Forest** from recent flow events and attach `anomaly_score ∈ [0, 1]` and `anomaly_features` (top-4 contributing features, z-score heuristic labels) to each new flow events.

On the event detail page the score is shown with a prominent banner:

> ⚠️ Heuristic anomaly score — NOT proof of intrusion. Use only in addition to Suricata rule matches.

---

## ❓ Troubleshooting

| Symptom | Fix |
|---|---|
| Backend exits on startup; `alembic upgrade head` fails | Wait for MySQL healthy. Compose uses `depends_on: condition: service_healthy`. If still flaky: `docker compose restart backend`. |
| Dashboard is empty but `/health` is ok | Ensure `AUTO_REPLAY_SAMPLE_ON_STARTUP=1`. Trigger manually via `POST /api/admin/replay-sample`. |
| Events appear missed | The tailer stores offset in `ingestion_checkpoints`. Force a re-read by deleting that row or `docker compose down -v` to wipe. |
| `sensor` did not start | Intentional. Start with `docker compose --profile sensor up -d`. |
| Anomaly scores are null | Require `ANOMALY_ENABLED=true` AND `event_type = flow` AND enough flows exist (≥50 for training bootstrap baseline). |

---

## 🧹 Retention & wipe procedure

### Retention
Every 24h the backend runs `apply_retention()` in a background loop, deleting rows older than `RETENTION_DAYS` (default 30) plus their notes.

### Full wipe
```bash
# Permanently delete everything
docker compose down -v
```

Or inside MySQL cli to keep the containers:

```sql
DELETE nidsdb.analyst_notes;
DELETE nidsdb.events;
DELETE nidsdb.ingestion_checkpoints;
```

---

## 📁 Project layout

```
Intrusion-Detection-System/
├── backend/
│   ├── alembic/               # Alembic config + initial migration
│   ├── app/
│   │   ├── anomaly/           # IsolationForest scorer + feature extractor
│   │   ├── core/              # settings, security (JWT, pwd), structured logging
│   │   ├── db/                # SQLAlchemy session
│   │   ├── ingestion/         # EVE JSON parser + file tailer
│   │   ├── models/            # ORM models (Event/User/AnalystNote/Checkpoint)
│   │   ├── routers/           # FastAPI routers: auth, events, dashboard
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── services/         # Business logic: list_events, dashboard_summary, ack, notes
│   │   └── main.py           # FastAPI lifespan + background jobs
│   ├── tests/             # Pytest suite (in-memory SQLite fixtures)
│   ├── Dockerfile
│   └── requirements.txt      # Pinned Python deps
├── frontend/
│   ├── src/
│   │   ├── pages/             # DashboardPage, AlertsPage, AlertDetailPage, LoginPage
│   │   ├── components/   # AppShell, AlertTable, FilterPanel, States, RequireAuth, ui/
│   │   ├── lib/          # Axios client + typed API helpers
│   │   ├── styles/         # global.css
│   │   ├── tokens.ts    # SecOps restrained palette + severity colors
│   │   ├── types.ts    # TypeScript types mirroring backend Pydantic schemas
│   │   └── main.tsx
│   ├── Dockerfile            # Multi-stage: vite build -> nginx serve + /api proxy
│   ├── nginx.conf
│   └── package.json
├── .docker/
│   └── mysql-init/        # 01-app-user.sql: provision ids_user@%
├── data/
│   ├── sample_eve.json         # 16-line demo EVE file
│   └── empty_eve.json       # Safe idle default
├── .env.example
├── .gitignore
├── docker-compose.yml
└── README.md
```

---

## 📝 Updating dependencies

### Backend (Python)
```bash
docker compose run --rm backend bash -c "pip install pip-tools && pip-compile --upgrade requirements.in  # edit output: requirements.txt
```
In practice, manually edit `backend/requirements.txt` with new pinned versions, then `docker compose build backend`.
```

### Frontend (Node)
```bash
cd frontend
npx npm-check-updates -i
npm install
cd .. ; docker compose build frontend
```

---

## 🔐 Database schema highlights

Schema is created and versioned by Alembic migrations. Initial `0001_initial.py` creates:

- `events` — `id` (PK), `dedup_key` (unique), `event_type`, `timestamp` (ix), `severity` (ix), `src_ip` (ix), `dst_ip` (ix), composite `ix_events_timestamp_severity`, `flow_id`, `signature`, `raw` JSON, `anomaly_score`, `anomaly_features` JSON, `acknowledged` (ix), `ingestion_time`, `ingestion_checkpoint_id` FK.
- `analyst_notes` — immutable, `event_id` FK + `author_id` FK + `note` + `created_at` (stamped).

---

## 🛡️ Non-Functional / Architectural hygiene

| Concern | Implementation |
|---|---|
| **Input validation** | Every endpoint uses Pydantic v2; no raw string interpolation in queries. |
| **Auth** | Analyst routes use `OAuth2PasswordBearer` + `get_current_user` dependency; secrets from env only. |
| **SQL safety** | SQLAlchemy 2.x ORM / parameterized Core selects only. |
| **Reliability** | Idempotency via unique dedup key + rollback on IntegrityError; exponential backoff in tailer. |
| **Observability** | Structlog JSON logs + `/health` endpoint + readiness probes (healthy service_healthy `depends_on`. |
| **Resource caps** | `mem_limit` + `cpus` on every service in compose. |
| **Formatting** | Pinned dependencies with upgrade notes. Alembic migrations for every schema change. |

---

## 📜 License & compliance

Use and operate this tool only within the law. This project is a defensive review utility intended solely for defenders. You, the operator, are fully responsible for lawful deployment configuration. Third-party components (Suricata, MySQL, React, FastAPI, scikit-learn, and others) retain their respective licenses.

---

## 🤝 Contributing

Contributions, issues, and feature requests welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add some amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

Before submitting a PR, please make sure your changes pass the tests:

```bash
docker compose run --rm backend pytest tests -q
cd frontend && npx tsc --noEmit && npx vite build
```

---

<div align="center">

**Made with ❤️ for defenders.** Built to stay safe out there. 🔒

</div>
