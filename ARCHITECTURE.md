# NIDS Architecture — How It Works

This document explains the full end-to-end data flow of the Network Intrusion Detection System, from raw Suricata EVE JSON lines to the analyst dashboard.

---

## High-Level Architecture

```
                              ┌───────────────────────────────────────────────────────┐
                              │           Browser (http://localhost:3000)            │
                              │   React 18 + TS + Vite + Recharts + TanStack Query │
                              │  Pages: Login, Dashboard, Alerts, AlertDetail       │
                              └───────────────────┬───────────────────────────────┘
                                                  │  axios client with JWT interceptor
                                                  │  TanStack Query cache + invalidation
                                                  ▼
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│                        Backend (FastAPI · Python · Uvicorn — port 8000)                   │
│                                                                                            │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  ┌────────────────────────────┐        │
│  │ /api/auth  │  │ /api/events│  │/api/dashboard│  │ EveFileReader (bg thread)   │        │
│  │  login/me  │  │ list/detail│  │ summary      │  │ tail + checkpoint + rotation│        │
│  │  (JWT)     │  │ ack/notes  │  │ top-talkers  │  │ retention loop (daily)      │        │
│  └─────┬──────┘  └─────┬──────┘  └──────┬───────┘  └───────────┬────────────────┘        │
│        │               │                  │                    │                           │
│        └───────────────┴────────────────┴────────────────┘                           │
│                                        │                                        │
│                       Services Layer (business logic)                                │
│  list_events · get_event_detail · acknowledge_event · add_note                     │
│  dashboard_summary · seed_first_admin · apply_retention · authenticate_user        │
│                                        │                                        │
│                           SQLAlchemy 2.x ORM / Pydantic v2                           │
│                                        │                                        │
└────────────────────────────────────────┬───────────────────────────────────────┘
                                         │
                                         ▼
                        ┌───────────────────────────────────────────────────────┐
                        │                   Database                              │
                        │  SQLite (native dev)  /  MySQL 8.0 (Docker)           │
                        │  Tables: events, users, analyst_notes,                │
                        │          ingestion_checkpoints, alembic_version        │
                        └───────────────────────────────────────────────────────┘

          Suricata (opt-in, external or --profile sensor)
               └── EVE JSON ──► mounted path ──► EveFileReader
```

---

## 1 — Data Ingestion Pipeline

### Source Format: Suricata EVE JSON

Suricata writes one JSON object per line to `eve.json`. Example:
```json
{"timestamp":"2026-10-09T12:00:01.123456+0000","flow_id":123456,"event_type":"alert",
 "src_ip":"192.168.1.100","src_port":54321,"dest_ip":"10.0.0.1","dest_port":22,
 "proto":"TCP","alert":{"signature":"SSH brute force","category":"Attempted Administrator Privilege Gain","severity":1}}
```

Supported event types: `alert`, `flow`, `dns`, `http`, `tls` (other types are ingested with limited fields).

### Stage 1: File Tailing — `EveFileReader`

Located in [reader.py](backend/app/ingestion/reader.py).

Runs in a **background daemon thread** started at app startup. Key behaviors:

| Feature | How it works |
|---|---|
| **Polling** | Sleeps `INGESTION_POLL_INTERVAL_SECONDS` (default 1s) between ticks |
| **Checkpoints** | Stores `(path, last_offset, last_inode)` in `ingestion_checkpoints` table so it never re-reads lines on restart |
| **Rotation detection** | If the inode changes (new file) OR file size < last offset (truncated), resets offset to 0 and reads the entire new file |
| **Pseudo-inode on Windows** | On FAT/NTFS where `st_ino=0`, uses hash of `(size, mtime_ns)` as a stand-in |
| **Exponential backoff** | On any tick error, backs off doubling (0.5s → 1s → 2s…) up to `INGESTION_READ_ERROR_MAX_BACKOFF_SECONDS` |
| **Tolerance** | Handles missing file, permission errors, and transient OS errors without dying |

### Stage 2: Line Parsing — `parse_eve_line()`

Located in [parser.py](backend/app/ingestion/parser.py#L134-L146).

- Skips blank lines, lines that don't start with `{` and end with `}`
- Uses `json.loads` — returns `None` for malformed JSON (never raises to caller)
- Counted separately in stats: `malformed` (failed JSON) vs `parsed` (valid JSON)

### Stage 3: Normalization — `normalize_event()`

Located in [parser.py](backend/app/ingestion/parser.py#L149-L222).

Converts raw EVE dict into a typed `ParsedEvent` dataclass. Steps:

1. **Event type**: lowercased `event_type` field (accepts any type, not just alert/flow/etc.)
2. **Timestamp parsing** — tries 6 formats:
   - `2026-10-09T12:00:01.123456+0000` (Suricata default)
   - `2026-10-09T12:00:01Z`
   - Falls back to `datetime.fromisoformat`
   - If all fail → uses current UTC time
3. **IPs/ports**: looks up multiple key names (`src_ip` / `source_ip` / `src`, etc.) — validates port range 0–65535
4. **Protocol**: uppercased `proto` field
5. **Alert fields**: extracts `signature`, `signature_category`, normalizes severity via `severity_map` config:
   ```
   1 → HIGH, 2 → MEDIUM, 3 → LOW   (default mapping, configurable)
   ```
6. **Dedup key** (critical for idempotency): SHA-1 hash of:
   ```
   timestamp(second precision)|src_ip|dst_ip|src_port|dst_port|event_type|signature(first 64 chars)
   ```
   → This means the same logical event replayed 100 times will only be inserted ONCE.

### Stage 4: Database Insert — `_insert_event()`

Located in [reader.py](backend/app/ingestion/reader.py#L55-L85).

```
SQLAlchemy ORM insert Event row
     │
     ├─ commit → success → counted as `inserted`
     │
     └─ IntegrityError (unique dedup_key collision)
            → rollback → counted as `duplicate`
            → no exception bubbled (safe for replay)
```

### Startup Sample Replay

If `AUTO_REPLAY_SAMPLE_ON_STARTUP=1`:
1. Locates `data/sample_eve.json` (falls back to path relative to `main.py`)
2. Calls `ingest_file()` (same parser + insert path as the tailer)
3. Logs final stats: `{read, parsed, normalized, inserted, duplicate, malformed}`

---

## 2 — Database Schema (4 Tables)

Defined in [models/__init__.py](backend/app/models/__init__.py).

### `events` table — Core entity

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | autoincrement |
| `dedup_key` | char(64) UNIQUE | SHA-1 key for idempotency (indexed) |
| `event_type` | varchar(32) | indexed |
| `timestamp` | datetime UTC | indexed |
| `ingestion_time` | datetime UTC | when the backend read it |
| `src_ip / dst_ip` | varchar(64) | both indexed (for top-talkers) |
| `src_port / dst_port` | int |  |
| `protocol` | varchar(16) | TCP/UDP/ICMP/... |
| `app_proto` | varchar(32) | http/tls/dns/ssh/... |
| `flow_id` | bigint | indexed |
| `signature` | varchar(512) | Suricata rule name |
| `signature_category` | varchar(256) | Attack category |
| `severity` | varchar(16) | HIGH / MEDIUM / LOW (indexed) |
| `raw` | JSON | Complete original EVE line (never truncated) |
| `anomaly_score` | float NULL | Isolation Forest score ∈ [0,1], only for flows |
| `anomaly_features` | JSON NULL | Top-4 feature z-scores (heuristic labels) |
| `acknowledged` | bool | Triage status (indexed) |
| **Indexes** | — | `ix_events_timestamp_severity` composite + 6 single-column indexes |

### `users` table — Analyst accounts

| Column | Type | Notes |
|---|---|---|
| `id` | int PK |  |
| `username` | varchar(64) UNIQUE | indexed |
| `hashed_password` | varchar(255) | bcrypt |
| `display_name` | varchar(128) |  |
| `created_at` | datetime UTC |  |
| `is_active` | bool | soft-delete for analysts |

Seeded from env **only when the users table is empty** — never overwrites existing users.

### `analyst_notes` table — Immutable triage notes

| Column | Type | Notes |
|---|---|---|
| `id` | int PK |  |
| `event_id` | int FK → events | `ON DELETE CASCADE`, indexed |
| `author_id` | int FK → users | indexed |
| `note` | TEXT | cannot be edited or deleted after creation (enforced API-level) |
| `created_at` | datetime UTC | indexed, stamped server-side |

### `ingestion_checkpoints` table — Tailer state

| Column | Type | Notes |
|---|---|---|
| `path` | varchar(512) PK | one checkpoint per watched file |
| `last_offset` | bigint | byte position last successfully committed |
| `last_inode` | bigint NULL | last inode (detects rotation) |
| `updated_at` | datetime | auto-updated |

---

## 3 — Authentication & Authorization

### Flow

```
┌──────────┐  POST /api/auth/login    ┌──────────────┐  bcrypt verify    ┌───────┐
│ Frontend │ ───────────────────────► │  FastAPI     │ ────────────────► │ users │
│ LoginPage│   {username, password}   │ auth_router  │                   │ table │
└────┬─────┘                          └──────┬───────┘                   └───────┘
     │                                       │
     │ ◄─── {access_token, token_type} ◄────┘
     │      (JWT signed with JWT_SECRET, HS256)
     │
     │ localStorage.setItem("nids.auth.token", token)
     │ For every subsequent request:
     │   Axios interceptor → header: "Authorization: Bearer <token>"
     ▼
 TanStack Query: fetchMe() → GET /api/auth/me → load analyst profile
```

### Code Locations

- **Config**: [core/config.py](backend/app/core/config.py) — reads `JWT_SECRET`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`
- **Crypto**: [core/security.py](backend/app/core/security.py) — `hash_password()` (bcrypt cost=12), `create_access_token()`, `decode_access_token()`
- **Login endpoint**: [routers/auth.py](backend/app/routers/auth.py) — `POST /api/auth/login` → returns access token
- **Me endpoint**: `GET /api/auth/me` → returns analyst object from valid token
- **Protected dependency**: `get_current_user()` in [services/__init__.py](backend/app/services/__init__.py#L50-L54)
  - Every protected route (`/api/events/*`, `/api/dashboard/*`, `/api/admin/*`) uses `Depends(get_current_user)`
  - On 401: frontend response interceptor → clears token → redirects to `/login`

### JWT Token Contents

```json
{
  "sub": "42",           // user.id (integer string)
  "username": "analyst",
  "iat": 1728460800,
  "exp": 1728504000      // iat + ACCESS_TOKEN_EXPIRE_MINUTES (default 720 = 12h)
}
```

---

## 4 — Events API & Business Logic

Defined in [routers/events.py](backend/app/routers/events.py) + [services/__init__.py](backend/app/services/__init__.py#L161-L266).

### `GET /api/events` — Filtered, sortable, paginated listing

All query params are optional:

| Param | Type | Example | Notes |
|---|---|---|---|
| `since` | ISO datetime | `2026-10-09T00:00:00Z` | inclusive window start |
| `until` | ISO datetime | `2026-10-10T00:00:00Z` | inclusive window end |
| `severity` | multi-string | `HIGH&severity=MEDIUM` | mapped before query |
| `event_type` | multi-string | `alert&event_type=flow` | lowercased automatically |
| `src_ip` | string | `192.168.1.100` | exact match |
| `dst_ip` | string | `10.0.0.1` | exact match |
| `proto` | string | `TCP` | uppercased automatically |
| `acknowledged` | bool | `true` | triage filter |
| `search` | string | `SSH` | LIKE on signature/category/src_ip/dst_ip |
| `sort` | string | `timestamp_desc` | see options below |
| `page` | int | `1` | 1-indexed, min=1 |
| `page_size` | int | `25` | 1–500 |

**Sort options**:
- `timestamp_desc` (default): newest first
- `timestamp_asc`: oldest first
- `severity_desc`: HIGH → MEDIUM → LOW, then newest
- `severity_asc`: LOW → MEDIUM → HIGH, then oldest
- `src_ip`: alphabetical by source IP
- `dst_ip`: alphabetical by destination IP

Response: `Paginated<EventSummary>`
```json
{ "items": [...], "total": 13, "page": 1, "page_size": 25, "pages": 1 }
```

### `GET /api/events/:id` — Detail view

Returns `EventDetail` which adds:
- `notes`: array of immutable `AnalystNoteOut` (each with `author_username`)
- `allowlisted`: boolean — is src OR dst in `ALLOWLIST_CIDRS`?
- `asset_labels`: list of tags from `ASSET_LABELS_JSON` config map (supports CIDR ranges + exact IPs)
- `anomaly_score` / `anomaly_features`: if applicable

### `PATCH /api/events/:id/acknowledge` — Triage toggle

Body: `{"acknowledged": true}`. Sets `events.acknowledged` and returns updated detail.

### `POST /api/events/:id/notes` — Add analyst note (immutable)

Body: `{"note": "Investigation shows this was expected internal scanner activity."}`. Creates a row in `analyst_notes` with the current user as author — no edit/delete endpoint exists by design (audit trail).

---

## 5 — Dashboard Summary API

Single endpoint: `GET /api/dashboard/summary?hours=24&bucket_minutes=60&top_n=10`

Implemented in [dashboard_summary()](backend/app/services/__init__.py#L280-L387). Returns one aggregated response:

```json
{
  "alert_counts_over_time": [
    { "bucket": "2026-10-09T12:00:00", "count": 4,
      "severity_high": 1, "severity_medium": 2, "severity_low": 1 },
    ...
  ],
  "severity_counts": [ { "severity": "HIGH", "count": 3 }, ... ],
  "event_type_counts": [ { "event_type": "alert", "count": 7 }, ... ],
  "top_source_ips": [ { "ip": "192.168.1.100", "count": 5 }, ... ],
  "top_destination_ips": [ { "ip": "10.0.0.1", "count": 3 }, ... ],
  "recent_events": [ <EventSummary x 10> ],
  "last_24h": {
    "total_alerts": 13, "high": 3, "medium": 6, "low": 4,
    "acknowledged": 8, "flows_scored": 42
  }
}
```

**Alert counts over time** is bucketed server-side: the SQL fetches all alerts in the window with timestamps, then Python maps rows to buckets via `_bucket_start()` (floor to the nearest `bucket_minutes`). This keeps the SQL portable (MySQL & SQLite both work).

**Severity sort order** is enforced in SQL with `FIELD(severity, HIGH, MEDIUM, LOW)` (MySQL) and a coalesce fallback.

---

## 6 — Anomaly Detection (Optional · Heuristic)

Disabled by default. Enable with `ANOMALY_ENABLED=true`.

### Model: Isolation Forest (scikit-learn)

```
┌────────────────────────────────────────────────────────────────────┐
│  Location: backend/app/anomaly/                                     │
│  features.py   — 9 hand-engineered flow features from EVE JSON     │
│  model.py      — AnomalyModel: fit() + score_parsed_event()        │
└────────────────────────────────────────────────────────────────────┘
```

### When Does It Activate?

- On the first call to `get_scorer()` (lazy-init singleton)
- If **< 50 flow events exist** in DB: bootstraps on **200 synthetic benign flows**
  (seeded RNG — deterministic baseline so first runs look reasonable)
- Once ≥50 real flows exist: future `fit()` calls will use real data
- Re-trains only if explicitly re-created (process restart = re-train on current data)

### Feature Engineering (9 features per flow event)

| Feature | How computed | Why it matters |
|---|---|---|
| `bytes_toserver_log1p` | `log(1 + flow.bytes_toserver)` | unusually large transfers |
| `bytes_toclient_log1p` | `log(1 + flow.bytes_toclient)` | exfil patterns |
| `pkts_toserver_log1p` | `log(1 + flow.pkts_toserver)` | scan vs bulk |
| `pkts_toclient_log1p` | `log(1 + flow.pkts_toclient)` | flood patterns |
| `duration_seconds_log1p` | `log(1 + flow.age)` | very short (SYN flood) or very long flows |
| `dst_port_bucket_hash` | MD5(port)[:4] normalized to [0,1] | unusual ports → outliers in this dimension |
| `protocol_encoded` | TCP=0.1, UDP=0.2, ..., unknown=0.9 | rare protocols weighted high |
| `bytes_ratio_toserver` | bytes_ts / total_bytes | asymmetric transfer |
| `pkts_ratio_toserver` | pkts_ts / total_pkts | packet asymmetry |

Log transforms ensure the model isn't dominated by heavy-tailed byte/packet distributions.

### Scoring at Ingestion Time

1. For each ingested event, `EveFileReader` checks if `anomaly_scorer` is set
2. Calls `anomaly_scorer(parsed_event)` → only fires for `event_type = flow`
3. `IsolationForest.score_samples()` returns negative log likelihood:
   - Typical range `[-0.70, -0.35]` (more negative = more anomalous)
   - Mapped via sigmoid to `anomaly_score ∈ [0, 1]`: 1 = most anomalous
4. **Heuristic feature contributions**: computes `|z-score|` for each feature vs training mean/std, returns top-4 with a warning label:
   ```json
   {
     "_label": "HEURISTIC_FEATURE_CONTRIBUTIONS — ESTIMATES ONLY, NOT ROOT CAUSE",
     "top": [
       { "feature": "bytes_toclient_log1p", "z_score": 3.82,
         "note": "Heuristic only: larger |z| vs training mean/std suggests unusualness. NOT proof of intrusion." }
     ]
   }
   ```

### ⚖️ Critical Safety Guardrails

- **Only scores flow events** — never modifies severity on alerts
- **Labelled as heuristic everywhere** (dashboard "ML" stat tooltip, detail page banner, feature JSON itself)
- **Never suppresses or auto-acknowledges** any Suricata rule alert
- **Disabled by default** — opt-in, no ML in the default "safe" pipeline

---

## 7 — Frontend Architecture

### Tech Stack

| Layer | Library | Why |
|---|---|---|
| UI | **React 18 + TypeScript** | Type-safe components |
| Build | **Vite** | Fast HMR, port 3000, proxies `/api` → `localhost:8000` |
| Routing | **react-router-dom v6** | `/login`, `/dashboard`, `/alerts`, `/alerts/:id` |
| Data fetching | **TanStack Query v5** | Caching, invalidation, loading/error states |
| HTTP client | **axios** | JWT interceptor (attach header), 401 interceptor (logout + redirect) |
| Charts | **Recharts** | Stacked bar (alert counts), bar (severity/top IPs) |
| Icons | **lucide-react** | SecOps-appropriate iconset |
| Styling | **Hand-rolled tokens** | `tokens.ts` — restrained SecOps palette: navy bg, red/amber severity (no neon) |
| Auth persistence | **localStorage** | `nids.auth.token`, `nids.auth.user` |

### Pages & Data Flow

```
┌───────────────────────────────────────────────────────────────────┐
│ AppShell (top nav: Dashboard, Alerts, User menu · sign out)       │
│   RequireAuth wrapper — redirects to /login if no token           │
└────────┬──────────────────────────────────────────────────────────┘
         │
         ├─ LoginPage  →  POST /api/auth/login  →  store token → /dashboard
         │
         ├─ DashboardPage
         │     │
         │     ├─ useQuery: ["dashboard", hours] → GET /api/dashboard/summary
         │     │   ├─ MetricsStrip (4 KPI cards: 24h alerts/high/ack/flows)
         │     │   ├─ AlertCountsChart — stacked Recharts BarChart by severity
         │     │   ├─ SeverityBars — horizontal severity + event-type bars
         │     │   ├─ TopIPBars x2 — top source/destination by alert count
         │     │   └─ RecentEvents — clickable rows → /alerts/:id
         │     └─ useMutation: replaySample() → POST /api/admin/replay-sample
         │         → invalidates ["dashboard", "events"]
         │
         └─ AlertsPage
               │
               ├─ FilterPanel (severity ▢▢▢ · event_type · src/dst · proto ·
               │                     acknowledged · search · since presets · sort)
               │
               ├─ useQuery: ["events", filters] → GET /api/events?all...
               │
               ├─ AlertTable — sortable rows:
               │     columns: [SeverityBadge, Timestamp, EventType,
               │               Signature/Category, Src→Dst, Protocol,
               │               Ack, Actions]
               │     row click → /alerts/:id
               │     inline: acknowledge toggle (useMutation)
               │     footer: pagination controls
               │
               └─ AlertDetailPage (/alerts/:id)
                     │
                     ├─ GET /api/events/:id
                     ├─ event-type panels: alert / flow / dns / http / tls
                     │    (each renders relevant fields from raw JSON)
                     ├─ Anomaly banner (if anomaly_score set) with prominent
                     │    ⚠️ "HEURISTIC ONLY — NOT PROOF OF INTRUSION" disclaimers
                     ├─ Allowlisted / asset labels (from allowlist + ASSET_LABELS_JSON)
                     ├─ Acknowledge toggle
                     ├─ Raw JSON collapsible
                     └─ Note composer → POST /api/events/:id/notes
                          (immutable, author + timestamp shown on each note)
```

### Caching Strategy (TanStack Query)

| Query Key | Cache Lifetime | Invalidation Trigger |
|---|---|---|
| `["dashboard", hours]` | stale while revalidate | `replaySample()` success |
| `["events", filters]` | stale while revalidate | `replaySample()`, `acknowledgeEvent()` |
| `["event", id]` | 5 min | `acknowledgeEvent(id)`, `addNote(id)` |

This avoids the "replay button does nothing on the dashboard" problem.

---

## 8 — Background Jobs & Retention

### Lifespan Startup (FastAPI lifespan context manager)

In [main.py](backend/app/main.py#L120-L130):

```
lifespan:
  ├─ run_in_executor(_start_background_jobs)  ← runs in thread pool (not event loop)
  │    │
  │    ├─ SQLite dev bootstrap: Base.metadata.create_all()  (only if SQLite)
  │    │   (production uses Alembic: docker-entrypoint runs alembic upgrade head)
  │    │
  │    ├─ seed_first_admin(db)  ← only if users table empty
  │    ├─ apply_retention(db)   ← prune events older than RETENTION_DAYS once
  │    ├─ AUTO_REPLAY_SAMPLE_ON_STARTUP ? ingest_file(sample_eve.json)
  │    │
  │    ├─ EveFileReader.run_forever() ← starts daemon thread
  │    └─ Retention loop thread  ← sleeps 24h, then apply_retention() again
  │
  └─ on shutdown: EveFileReader.stop()  ← sets _stop flag, returns from loop
```

### Retention Policy

Default: `RETENTION_DAYS=30`. Can be changed via env.

`apply_retention()` in [services/__init__.py](backend/app/services/__init__.py#L395-L404):
1. Computes cutoff = `now - RETENTION_DAYS`
2. Deletes `analyst_notes` whose parent event is older than cutoff (then FK cascade deletes)
3. Deletes `events` with `timestamp < cutoff`
4. Commits, returns count of deleted events

Runs once at startup, then once every 24 hours in the background thread.

---

## 9 — Logging & Observability

Stack: **structlog** + **python-json-logger**. Configured in [core/logging_setup.py](backend/app/core/logging_setup.py).

All logs are JSON to stdout, e.g.:
```json
{
  "service": "nids-backend",
  "event": "sample_replay_startup",
  "level": "info",
  "timestamp": "2026-10-10T07:25:58.321850Z",
  "inserted": 13, "duplicate": 1, "malformed": 2
}
```

### Health Probe

`GET /health` → `{"status":"ok","db":"ok"}`. Executes `SELECT 1` against the DB to confirm connectivity. Used by:
- Docker Compose `depends_on: condition: service_healthy`
- Load balancers / Kubernetes readiness

---

## 10 — Security & Non-Functional Properties

| Concern | Implementation |
|---|---|
| **No SQL injection** | Every query goes through SQLAlchemy ORM / parameterized Core. No raw SQL string formatting with user input. |
| **No XSS** | React default-escapes all interpolated content; raw JSON is in a `<pre>` block, not injected as HTML. |
| **Password safety** | bcrypt cost=12; passwords never logged; env vars loaded via `SecretStr` (never appear in repr/print). |
| **Secrets from env only** | No hardcoded creds; `MYSQL_PASSWORD` and `JWT_SECRET` come from `.env`/Compose secrets. |
| **Input validation** | Every endpoint uses Pydantic v2 — query params, body schemas, response schemas. Unrequested fields are dropped. |
| **CORS restriction** | Explicit `CORS_ORIGINS` list (env config), default `http://localhost:3000,http://127.0.0.1:3000`. No `*` unless explicitly set. |
| **Immutable audit trail** | Analyst notes have no PATCH / DELETE route. Retention only deletes events older than the configured window. |
| **Rate limits** | None built in — recommended to add `slowapi` or a reverse proxy (nginx) rate limiter for deployments. |
| **Resource caps (Docker)** | Each service in compose has `mem_limit` + `cpus` (mysql 1C/1G, backend 1.5C/2G, frontend 0.5C/256M). |
| **Schema safety** | MySQL uses Alembic migrations (0001_initial.py) — never ad-hoc `CREATE TABLE`. SQLite dev uses `Base.metadata.create_all` which is schema-compatible. |
| **utf8mb4 everywhere** | MySQL tables created with `utf8mb4_unicode_ci` to store full Unicode (emoji, non-Latin text). |
