# Halo realtime messaging

Halo now includes a functional Phase 4 communication foundation: phone/OTP accounts, HTTP-only database-backed sessions, persistent PostgreSQL messages, Socket.IO delivery, presence, authenticated one-to-one LiveKit voice/video calls, automatic server-side video recording, and an admin-only recording vault. The original product mockup remains available at `/design-preview`.

## Run with Docker Compose

Requirements: Docker Desktop or Docker Engine with Compose v2.

```bash
git clone https://github.com/kawika4783/chat.git
cd chat
cp .env.example .env
# Replace every change-this/replace-me value in .env.
docker compose up -d --build
```

Open `http://localhost:8080`. The API applies committed Prisma migrations automatically before it starts.

The default development authentication mode displays OTP code `147296` on the sign-in screen. Set `OTP_MODE` to a real provider integration before public deployment; Halo does not yet include an SMS provider adapter.

## Verify the realtime milestone

Create two accounts with different international phone numbers, using two browser profiles or devices. Search for the other account by display name, start a conversation, and send a message. Messages persist through refreshes and Compose restarts.

Automated end-to-end test against a running stack:

```bash
# PowerShell
$env:HALO_TEST_BASE_URL='http://127.0.0.1:8080'
npm test
```

The test verifies authentication enforcement, two independent sessions, an authorized direct conversation, a realtime typing event, Socket.IO message delivery, and PostgreSQL persistence.

It also verifies call initiation, incoming/accepted states, authorized room-token issuance, connected/end transitions, persisted call history, and denial of recording metadata to ordinary users.

## Pull published GHCR images

The GitHub workflow publishes images on pushes to `main` and version tags. Set these values in `.env`:

```dotenv
HALO_WEB_IMAGE=ghcr.io/kawika4783/halo-web:latest
HALO_API_IMAGE=ghcr.io/kawika4783/halo-api:latest
```

Then:

```bash
docker compose pull
docker compose up -d --no-build
```

See [Docker deployment](docs/docker.md) for updates, backups, and production exposure guidance.

## Development

Requirements: Node.js 22+, npm 10+, and a PostgreSQL database.

```bash
npm install
npm run db:generate
npm run dev
```

Run the API separately with `DATABASE_URL`, `SESSION_SECRET`, and the OTP variables from `.env.example`:

```bash
npm run db:migrate
npm run dev:api
```

The Vite-only development server does not proxy `/api`; Docker Compose is the supported full-stack development path. `npm run build` validates the production frontend bundle.

## Implemented security boundaries

- Session tokens are random, stored only as SHA-256 hashes, and delivered in HTTP-only `SameSite=Lax` cookies.
- OTP values are HMAC-hashed, expire after five minutes, have attempt limits, and are request-rate-limited per IP/phone in this single-node milestone.
- Every conversation and message query checks membership server-side.
- Message `clientId` values provide per-sender idempotency.
- Other users' phone numbers are not returned by public user or conversation payloads.
- PostgreSQL foreign keys and conversation/message access indexes are committed in the initial migration.

Before internet exposure, add TLS, a real SMS provider, distributed Redis rate limiting, CSRF origin validation, observability, account recovery, abuse controls, and a formal security review.

## Project map

```text
services/api/server.mjs      real authentication, REST, and Socket.IO API
src/LiveApp.jsx              messaging, LiveKit calls, and admin recording vault
src/App.jsx                  original design-preview component library
prisma/schema.prisma         relational model
prisma/migrations/           committed PostgreSQL migration history
tests/realtime.test.mjs      two-user full-stack integration test
compose.yaml                 canonical installation
infrastructure/              Docker, Nginx, and Coturn configuration
```

## Current boundary

Messaging and authenticated one-to-one voice/video calling are functional. Media is routed by LiveKit; a video call automatically starts LiveKit Egress and writes an MP4 to the private MinIO bucket. Only `ADMIN` and `SUPER_ADMIN` sessions can list recordings or request a short-lived playback URL, and each playback request is audit logged. Configure TLS, public LiveKit networking, strong secrets, and jurisdiction-appropriate recording consent before an Internet deployment.
