# Docker and GitHub deployment

`compose.yaml` is the canonical installation definition. It can build from a cloned GitHub repository or pull images published by the included GHCR workflow.

## Services

| Service | Role | Public exposure |
|---|---|---|
| `web` | Nginx serving the production Vite bundle and proxying `/api` | `${WEB_PORT:-8080}` |
| `api` | Phase 1 API contract/health stub | Internal only |
| `recording-worker` | Phase 1 recording-worker contract stub | Internal only |
| `postgres` | Durable relational data | Internal only |
| `redis` | Presence, routing, queues, and rate-limit state | Internal only |
| `object-storage` | Private recording objects | Internal; console bound to `127.0.0.1:9001` |
| `recording-bucket-init` | Creates a private bucket and retention rule | One-shot |

The web image is a multi-stage build: Node compiles the application, then only static output and Nginx remain in the runtime image. SPA routes fall back to `index.html`; `/healthz` is used by Compose.

## Source installation

```bash
git clone https://github.com/YOUR-ACCOUNT/halo.git
cd halo
cp .env.example .env
```

Edit `.env`. At minimum, replace `POSTGRES_PASSWORD`, `SESSION_SECRET`, `RECORDING_STORAGE_SECRET_KEY`, TURN credentials, and the KMS placeholder. Then:

```bash
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs -f --tail=100
```

Open `http://SERVER:8080`. Put TLS in front of the web port with a reverse proxy or load balancer before exposing it publicly.

## Publish and pull with GHCR

The workflow at `.github/workflows/docker-publish.yml` publishes `halo-web`, `halo-api`, and `halo-recording-worker`. Repository settings must allow GitHub Actions to write packages. Public packages can be pulled anonymously; private packages require `docker login ghcr.io` with a token carrying `read:packages`.

Set the three `HALO_*_IMAGE` values in `.env` to the published `ghcr.io/OWNER/...:latest` names, then:

```bash
docker compose pull
docker compose up -d --no-build --remove-orphans
```

For reproducible production releases, use a version tag such as `v1.0.0` instead of `latest`.

## Updates

Source build:

```bash
git pull --ff-only
docker compose up -d --build --remove-orphans
```

Registry build:

```bash
docker compose pull
docker compose up -d --no-build --remove-orphans
```

## Backups

Stop writes or use database-native online backup tooling before copying data. Named volumes are `halo_halo_postgres`, `halo_halo_redis`, and `halo_halo_recordings` under the default project name. Production PostgreSQL should use `pg_dump` plus WAL archiving. Recording backups must preserve encryption metadata and the configured deletion/retention policy.

## Stop or remove

```bash
docker compose down
```

This preserves data. Permanently deleting all Compose volumes is destructive and must be intentional:

```bash
docker compose down --volumes
```

## Phase 1 boundary

The containers are installable and the frontend is production-served, but the current API and recording worker are explicit Phase 1 stubs. They expose health/contract behavior only. Real authentication, database migrations, WebSockets, SFU recording, object encryption, and admin authorization must be implemented in later phases before production use.
