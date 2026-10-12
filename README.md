# Network Intrusion Detection System (NIDS)

A defensive web application for ingesting, reviewing, and triaging Suricata EVE JSON events. The project includes a FastAPI backend, a React and TypeScript dashboard, analyst authentication, event acknowledgement and notes, and optional Isolation Forest anomaly scoring for flow events.

The default demo uses bundled sample events. The application does not start live packet capture or automatically block traffic.

## Features

- **Suricata EVE ingestion:** Reads EVE JSON from a configured file, normalizes supported event types, tolerates malformed lines, and avoids duplicate inserts.
- **Analyst dashboard:** Browse and filter events, view severity summaries and top talkers, and open event details.
- **Authentication:** JWT-based login. On first startup, the configured administrator account is created if the users table is empty.
- **Triage workflow:** Acknowledge events and add analyst notes.
- **Optional anomaly scoring:** Isolation Forest scoring for flow events. Scores are heuristic signals and do not replace Suricata alerts or analyst review.
- **Docker demo:** Runs MySQL, the API, and the web interface with Docker Compose and loads sample event data.
- **Local development:** The backend can also use SQLite, so contributors can run it without Docker or MySQL.

## Safety and data handling

Use this software only with systems and network data you own or are authorized to monitor.

The optional Compose service named sensor is a stub; it does not capture traffic by default. To use real Suricata events, run Suricata separately on an authorized system and configure this app to read its EVE JSON output.

The application stores the raw EVE JSON event for analyst review. EVE fields depend on the Suricata configuration. Avoid ingesting sensitive or payload-bearing records unless you are authorized and intend to store them. The application does not automatically block hosts or modify network traffic.

## Technology

- **Backend:** Python, FastAPI, Pydantic, SQLAlchemy, Alembic
- **Database:** MySQL 8 in Docker; SQLite is supported for local development
- **Frontend:** React 18, TypeScript, Vite, TanStack Query, Axios, Recharts
- **Anomaly scoring:** scikit-learn Isolation Forest
- **Deployment:** Docker Compose

## Quick start with Docker

### Requirements

- Docker Desktop or Docker Engine
- Docker Compose v2

### 1. Get the project and configure it

~~~powershell
git clone https://github.com/RahulNayak0510/Intrusion-Detection-System.git
cd Intrusion-Detection-System
Copy-Item .env.example .env
notepad .env
~~~

In .env, replace the CHANGE_ME values with your own strong passwords and a long random JWT_SECRET. Keep .env private; it is ignored by Git. Do not commit real credentials.

### 2. Build and start the application

~~~powershell
docker compose up -d --build
~~~

On the first run, Docker builds the images, starts MySQL, applies database migrations, seeds the first analyst account, and loads the bundled sample EVE events.

### 3. Open the application

- **Dashboard:** http://localhost:3000
- **API health check:** http://localhost:8000/health
- **Interactive API docs:** http://localhost:8000/docs

Sign in with the username and password configured as FIRST_ADMIN_USERNAME and FIRST_ADMIN_PASSWORD in .env.

### Useful Docker commands

~~~powershell
# Check service status
docker compose ps

# Follow logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mysql

# Stop containers and preserve the database volume
docker compose down

# Stop containers and permanently delete the database volume and its data
docker compose down -v

# Rebuild after code changes
docker compose up -d --build
~~~

The docker compose down -v command deletes the stored database data.

## Local development without Docker

The native setup uses SQLite for the database. Docker and MySQL are not needed for this mode.

### Requirements

- Python 3.11 or 3.12 (recommended for the pinned dependencies)
- Node.js 18 or newer
- npm 9 or newer

### 1. Create the Python environment

From the project root, in PowerShell:

~~~powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
~~~

If the pinned packages do not have wheels for your Python version, use Python 3.11 or 3.12.

### 2. Configure SQLite

Copy the template if you have not already created a local .env:

~~~powershell
Copy-Item .env.example .env
notepad .env
~~~

Add or update this setting in .env:

~~~text
DATABASE_URL=sqlite:///./nids_local.db
~~~

DATABASE_URL takes precedence over the MySQL connection settings. Keep the administrator password and JWT_SECRET set to private values.

### 3. Start the backend

From the project root:

~~~powershell
$env:PYTHONPATH = "backend"
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
~~~

The backend health endpoint is http://localhost:8000/health and the API documentation is http://localhost:8000/docs.

### 4. Start the frontend

Open a second terminal:

~~~powershell
cd frontend
npm install
npm run dev
~~~

Open http://localhost:3000. Stop either development server with Ctrl+C.

## Configuration

The Docker Compose setup reads substitutions from the root .env file. The main settings are:

| Setting | Purpose |
|---|---|
| MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD | MySQL database and account settings for Docker |
| DATABASE_URL | Optional database URL; when set, overrides the individual MySQL settings |
| FIRST_ADMIN_USERNAME, FIRST_ADMIN_PASSWORD | Initial analyst account, created when the users table is empty |
| JWT_SECRET, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES | JWT signing and token lifetime settings |
| CORS_ORIGINS | Allowed frontend origins |
| EVE_FILE_PATH | EVE JSON file the backend reads |
| AUTO_REPLAY_SAMPLE_ON_STARTUP | Whether to ingest bundled sample events at startup |
| ANOMALY_ENABLED | Enables optional Isolation Forest scoring |
| ALLOWLIST_CIDRS | CIDR ranges labeled as allowlisted in the interface; they are not automatically suppressed |
| ASSET_LABELS_JSON | Optional IP-to-asset labels in JSON format |
| SEVERITY_MAP_JSON | Maps Suricata severity numbers to application labels |
| RETENTION_DAYS | Age limit for event retention |

See .env.example for the complete list and comments. For Docker, use MySQL settings from the template. For native development, set DATABASE_URL to a SQLite URL.

## Event ingestion

The default configuration reads from data/empty_eve.json and replays data/sample_eve.json for the demo. Supported event types include alert, flow, DNS, HTTP, and TLS when present in EVE JSON.

To read an external Suricata log with Docker, mount its log directory into the backend container and set EVE_FILE_PATH to the mounted eve.json path. For example, add a docker-compose.override.yml alongside docker-compose.yml:

~~~yaml
services:
  backend:
    volumes:
      - ./data:/app/data:ro
      - /path/to/authorized/suricata/logs:/eve:ro
    environment:
      EVE_FILE_PATH: /eve/eve.json
      AUTO_REPLAY_SAMPLE_ON_STARTUP: "0"
~~~

Replace /path/to/authorized/suricata/logs with the actual log directory, then restart the backend:

~~~powershell
docker compose up -d --build backend
~~~

The optional sensor Compose profile is only a placeholder. It starts an idle container and requires explicit, authorized Suricata configuration before it can be used.

## API overview

Most API routes require a bearer token obtained from the login endpoint.

| Method | Route | Purpose |
|---|---|---|
| GET | /health | API and database health |
| POST | /api/auth/login | Sign in and receive an access token |
| GET | /api/auth/me | Current analyst profile |
| GET | /api/events | Filter, sort, and paginate events |
| GET | /api/events/{event_id} | Event details and analyst notes |
| PATCH | /api/events/{event_id}/acknowledge | Acknowledge or unacknowledge an event |
| POST | /api/events/{event_id}/notes | Add an analyst note |
| GET | /api/dashboard/summary | Dashboard summary and aggregates |
| POST | /api/admin/replay-sample | Replay bundled sample events |

See http://localhost:8000/docs for request parameters and schemas.

## Tests

### Backend

~~~powershell
# Run locally from the project root
Push-Location backend
python -m pytest tests -q
Pop-Location

# Or, with Docker
docker compose run --rm backend pytest tests -q
~~~

The backend tests cover event parsing, malformed and duplicate input, event filtering and pagination, dashboard summaries, analyst actions, and anomaly scoring.

### Frontend

~~~powershell
cd frontend
npm test
npm run lint
npm run build
~~~

## Troubleshooting

| Problem | What to check |
|---|---|
| The dashboard does not load | Check docker compose ps and review the frontend and backend logs. |
| Login fails | Confirm the values in .env. The first admin is seeded only when the users table is empty. |
| The dashboard has no events | Confirm AUTO_REPLAY_SAMPLE_ON_STARTUP=1, or use the Replay sample action in the app. |
| The backend cannot connect to MySQL | Check the MySQL credentials in .env and wait for the MySQL health check to pass. |
| The backend cannot find the EVE file | Confirm EVE_FILE_PATH and the volume mount point match. |
| Anomaly scores are missing | Enable ANOMALY_ENABLED=true; scoring applies to flow events and needs sufficient flow data. |
| Port 3000, 3306, or 8000 is already in use | Stop the other service using that port or change the port mapping in the relevant configuration. |

## Project structure

~~~text
Intrusion-Detection-System/
├── backend/
│   ├── alembic/             Database migrations
│   ├── app/
│   │   ├── anomaly/         Optional anomaly scoring
│   │   ├── core/            Settings, security, and logging
│   │   ├── db/              Database session and engine
│   │   ├── ingestion/       EVE parser and file reader
│   │   ├── models/          Database models
│   │   ├── routers/         Authentication, event, and dashboard APIs
│   │   ├── schemas/         API schemas
│   │   └── services/        Application services
│   └── tests/               Backend tests
├── frontend/
│   └── src/                 React application
├── data/
│   ├── empty_eve.json       Safe idle input
│   └── sample_eve.json      Demo events
├── .docker/mysql-init/      MySQL initialization scripts
├── .env.example             Environment template
├── docker-compose.yml       MySQL, backend, frontend, optional sensor stub
└── README.md
~~~

## Contributing

1. Create a branch for your change.
2. Make the change and run the relevant backend or frontend checks.
3. Commit your work and open a pull request with a short description.
