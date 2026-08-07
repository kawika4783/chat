# Docker and GitHub deployment

`compose.yaml` is the canonical installation definition. It can build from a cloned GitHub repository or pull images published by the included GHCR workflow.

## Services

| Service | Role | Public exposure |
|---|---|---|
| `web` | Nginx serving the production Vite bundle and proxying `/api` | `${WEB_PORT:-8080}` |
| `api` | Authentication, messaging, call authorization, recording/admin API | Internal only |
| `livekit` | WebRTC SFU and room signaling | `7880`, `7881/tcp`, `50000-50100/udp` |
| `livekit-egress` | Automatic composite MP4 capture | Internal only |
| `postgres` | Durable relational data | Internal only |
| `redis` | Presence, routing, queues, and rate-limit state | Internal only |
| `object-storage` | Private recording objects | API/console bound to loopback on `9000`/`9001` |
| `recording-bucket-init` | Creates a private bucket and retention rule | One-shot |

The web image is a multi-stage build: Node compiles the application, then only static output and Nginx remain in the runtime image. SPA routes fall back to `index.html`; `/healthz` is used by Compose.

## Source installation

```bash
git clone https://github.com/kawika4783/chat.git
cd chat
cp .env.example .env
```

Edit `.env`. At minimum, replace `POSTGRES_PASSWORD`, `SESSION_SECRET`, both LiveKit credentials, `RECORDING_STORAGE_SECRET_KEY`, TURN credentials, and the KMS placeholder. To create the first administrator, temporarily set `ADMIN_BOOTSTRAP_ENABLED=true`, set `BOOTSTRAP_ADMIN_USERNAME`, and inject `BOOTSTRAP_ADMIN_PASSWORD` (or its `_FILE` variant). Start once, then disable bootstrap. Never commit `.env` or the password. Then:

```bash
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs -f --tail=100
```

Open `http://SERVER:8080`; the recording vault is at `/admin`. Put TLS in front of the web and LiveKit endpoints before exposing them publicly, and set `LIVEKIT_PUBLIC_URL` to the public `wss://` address.

## Publish and pull with GHCR

The workflow at `.github/workflows/docker-publish.yml` publishes `halo-web` and `halo-api`; Compose pulls the pinned official LiveKit/Egress images. Repository settings must allow GitHub Actions to write packages. Public packages can be pulled anonymously; private packages require `docker login ghcr.io` with a token carrying `read:packages`.

Set the two `HALO_*_IMAGE` values in `.env` to the published `ghcr.io/kawika4783/...:latest` names, then:

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

## Current boundary

The API applies committed Prisma migrations and provides real OTP sessions, direct conversations, persistent messages, presence, typing, LiveKit room authorization, automatic video recording, admin-only metadata, and audit-logged signed playback URLs. `OTP_MODE=mock` is for local evaluation only. Production still requires TLS, public LiveKit/TURN networking, managed secrets/KMS, consent policy, monitoring, backups, and a formal security review.
