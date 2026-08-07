# Halo frontend mockup

Halo is a responsive Phase 1 prototype for direct messaging, voice/video calling, contacts, presence, notifications, settings, and administration. It is intentionally powered by realistic local mock data so product design can be reviewed before the production backend is implemented.

## Run locally

Requirements: Node.js 20+ and npm 10+.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:58321/design-preview`. Use the state selector to inspect every required screen. The normal entry at `/` begins with login; `/admin` opens the protected-admin mockup.

Production build:

```bash
npm run build
npm run preview
```

## Prototype interactions

- Login → OTP → profile setup → chat
- Select/search conversations and send a message
- Open notifications and start/end simulated calls
- Browse contacts, search by phone/name, add a contact
- Toggle presence/privacy choices and light/dark mode
- Browse call history
- Open admin, filter users, inspect a user drawer, view message history, and review/play automatic video recordings
- At widths under 760px the app becomes single-pane with native-feeling back navigation

The mockup does not claim end-to-end encryption. The proposed server-readable message model supports admin history access where policy permits. Video sessions are automatically recorded in the proposed architecture, visibly disclosed to participants, encrypted in object storage, and accessible only to authorized administrators through audited, short-lived playback links. Voice-only calls are not recorded. Recording laws vary by jurisdiction; production deployment must implement the required notice or consent policy.

## Install with Docker Compose

The repository root contains the canonical [`compose.yaml`](compose.yaml). Docker Compose discovers it automatically.

### Build from a GitHub checkout

```bash
git clone https://github.com/YOUR-ACCOUNT/halo.git
cd halo
cp .env.example .env
# Edit .env and replace every change-this/replace-me value.
docker compose up --build
```

Open `http://localhost:8080`. Run detached with `docker compose up -d --build`.

### Pull prebuilt images from GitHub Container Registry

The included GitHub Actions workflow publishes three images to GHCR on pushes to `main` and version tags. In `.env`, set:

```dotenv
HALO_WEB_IMAGE=ghcr.io/YOUR-ACCOUNT/halo-web:latest
HALO_API_IMAGE=ghcr.io/YOUR-ACCOUNT/halo-api:latest
HALO_RECORDER_IMAGE=ghcr.io/YOUR-ACCOUNT/halo-recording-worker:latest
```

Then install or update without building locally:

```bash
docker compose pull
docker compose up -d --no-build
```

Services: production Nginx web image, Phase 1 mock API, PostgreSQL, Redis, recording worker, private MinIO-compatible recording storage, and a one-shot bucket initializer. Data persists in named Docker volumes.

See [Docker deployment](docs/docker.md) for health checks, updates, backups, GHCR publishing, and removal.

## Project map

```text
src/
  App.jsx             screen and reusable UI components
  data.js             realistic mock users, messages, and calls
  styles.css          design tokens, responsive layouts, motion
docs/
  architecture.md     services, auth, scaling, security, operations
  api.md              HTTP endpoint contract
  realtime.md         WebSocket and WebRTC signaling events
  component-structure.md
  docker.md           Compose/GitHub/GHCR deployment operations
prisma/schema.prisma  proposed relational schema and indexes
infrastructure/       Docker and Coturn configuration
.github/workflows/    GHCR image publishing
```

This deliverable completes Phase 1 only. The docs describe the planned architecture for Phases 2–10 without pretending the mock API is production-ready.
