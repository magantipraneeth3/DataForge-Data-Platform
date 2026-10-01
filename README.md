# DataForge

DataForge is a data engineering platform with a Next.js frontend, FastAPI API, PostgreSQL, Redis/Celery processing, and optional Airflow orchestration.

## Push to GitHub

The project root is initialized on the `main` branch. Create an empty GitHub repository, then add its URL and push:

```sh
git remote add origin <your-github-repository-url>
git add .
git commit -m "Prepare DataForge for deployment"
git push -u origin main
```

The local `.env`, virtual environments, dependency folders, and build output are ignored.

## Run Locally

Requirements: Docker Desktop with Compose. Copy the example settings and start the complete application:

```sh
test -f .env || cp .env.example .env
```

Replace `JWT_SECRET_KEY` before deploying. To start the API, frontend, database, Redis, and Celery worker:

```sh
docker compose up --build -d
docker compose ps
```

Open <http://localhost:3000> for the app, <http://localhost:8000/docs> for API documentation, and <http://localhost:8000/health/database> to verify database connectivity. Uploaded files and database/Redis state use persistent Docker volumes. `docker compose down` stops services without deleting those volumes.

If a local port is already occupied, change `POSTGRES_PORT`, `REDIS_PORT`, `API_PORT`, or `FRONTEND_PORT` in `.env`.

## Source Development

For backend hot reload, run PostgreSQL and Redis in Docker, then start the API from source:

```sh
docker compose up -d postgres redis
python3 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -r backend/requirements.txt
cd backend
alembic upgrade head
uvicorn app.main:app --reload
```

In another terminal, run `cd frontend && npm ci && npm run dev`. `NEXT_PUBLIC_API_URL` controls the browser-to-API address. In Docker deployments this value is embedded at image build time, so rebuild the frontend when it changes.

## Verify Changes

```sh
cd frontend && npm ci && npm run lint && npm run build
cd ../backend && .venv/bin/python -m pytest -q
```

The backend integration tests require the PostgreSQL service and the configured `.env` from the local setup above.

GitHub Actions runs frontend lint/build, backend migrations and tests, and builds both container images on pushes and pull requests.

## Deploy on a VPS

The Compose stack is suitable for a single Docker-capable host. Point DNS records for the app and API domains to that host, allow inbound TCP ports 80 and 443, and set these values in `.env`:

```sh
APP_ENV=production
DEBUG=false
POSTGRES_PASSWORD=<output from openssl rand -hex 32>
JWT_SECRET_KEY=<output from openssl rand -hex 32>
APP_DOMAIN=app.example.com
API_DOMAIN=api.example.com
NEXT_PUBLIC_API_URL=https://api.example.com
CORS_ORIGINS=https://app.example.com
```

Generate each secret independently with `openssl rand -hex 32`. Then launch the app and Caddy, which provisions HTTPS certificates automatically:

```sh
docker compose --profile edge up --build -d
docker compose ps
```

The frontend and API ports are bound to loopback; Caddy is the public entry point. Back up the PostgreSQL and upload volumes regularly. Do not expose PostgreSQL or Redis directly to the internet.

Airflow remains optional and is not part of the public production stack. Its separate Compose file uses local-development credentials; secure it before deploying or exposing its web UI.
