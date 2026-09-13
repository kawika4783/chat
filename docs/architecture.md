# Proposed production architecture

## Services and boundaries

```text
Browser/PWA
  ├─ HTTPS REST → API service (Fastify/NestJS)
  ├─ authenticated WebSocket → realtime gateway
  ├─ WebRTC media → self-hosted LiveKit SFU with embedded TURN/STUN
  └─ video media fork → SFU/recording worker → encrypted object storage
                         │
Load balancer ───────────┤
  ├─ API/gateway replicas│
  ├─ PostgreSQL          │ durable users, conversations, messages, calls, audit
  ├─ Redis               │ presence TTLs, socket routing, rate limits, pub/sub
  ├─ local OTP store     │ self-hosted development-code authentication
  ├─ object storage      │ encrypted video recordings and future attachments
  └─ recording worker    │ authorized SFU media fork, packaging, retention
```

The web app never trusts frontend IDs. Each REST handler and socket event derives the actor from the authenticated session, validates payloads, checks conversation/contact/block/RBAC policy, and only then reads or mutates data.

## Authentication

1. `POST /auth/otp/request` normalizes an E.164 phone number, applies per-phone/IP/device throttles, and stores a hashed short-lived code. In the current self-hosted mode, the browser displays the development code rather than contacting an SMS provider.
2. `POST /auth/otp/verify` consumes one valid code and creates/locates the unique user.
3. Server issues a short-lived access token plus rotating refresh token in `HttpOnly`, `Secure`, `SameSite=Lax` cookies. Reuse detection revokes the token family.
4. WebSockets authenticate during handshake and re-authorize every sensitive event.
5. This self-hosted development-code flow is convenient but is not strong proof that a user controls the phone number. Strong phone verification requires a carrier connection, an SMS provider, or a locally attached cellular modem.

Provider interface: `sendOtp({ e164Phone, code, locale, expiresAt }): Promise<ProviderReceipt>`.

## Presence

On connection, Redis stores `presence:{userId}:{deviceId}` with a 45-second TTL. Heartbeats renew it; disconnect schedules a short grace window. Effective presence aggregates devices and publishes changes through Redis pub/sub to authorized contacts. Last activity is persisted with write coalescing. No polling is used.

Statuses: online, offline, away, busy, in_call. Block and privacy policy are applied before emitting presence detail.

## Messaging

Messages are stored before acknowledgement. A client-generated idempotency key prevents duplicates after reconnect. Delivery and read receipts are separate rows. Edits keep `editedAt`; deletion uses `deletedAt` plus an optional admin audit event. Message type is modeled now for text, image, video, audio, document, location, and voice message.

This design is explicitly server-readable. It is not end-to-end encrypted. Introducing E2EE later changes search, moderation, backups, multi-device key management, and administrator content access.

## Calls

The API stores call authorization and metadata and issues short-lived, participant-scoped LiveKit room tokens. Socket.IO handles invite, ringing, accept, end, and participant-disconnect events; LiveKit handles WebRTC media. Video capture requests adaptive 1080p at up to 30fps/3Mbps, while LiveKit can reduce quality when the device or network cannot sustain it.

Recording is off when a video call connects. Either participant may deliberately start or stop it; successful start events notify both parties with a persistent in-call disclosure. The worker then packages the composite, writes it to the private bucket, and transitions `STARTING → RECORDING → PROCESSING → READY`. Failures do not end the call and remain visible to administrators.

Only `ADMIN` or `SUPER_ADMIN` principals with an explicit `recordings:read` permission may request playback. The API never returns bucket credentials or public object URLs; it issues a single-purpose signed URL with a two-minute maximum TTL after recording an access reason, administrator, time, and IP hash. Exports remain disabled by default. Object-storage policy denies all direct user and public access.

Default retention is 30 days, followed by cryptographic deletion and a tombstone/audit record. Legal hold, if introduced, must require a separately privileged, audited workflow. Production deployment must enforce jurisdiction-appropriate notice or consent before media capture begins; if affirmative consent is required, the call cannot connect until every participant grants it.

## Security checklist

- E.164 normalization and unique phone index; Argon2id if passwords are ever added
- Zod/Valibot DTO validation, parameterized ORM queries, CSP, output encoding
- Origin checks and CSRF tokens for cookie-authenticated state changes
- OTP/login rate limits in Redis; progressive cooldown and abuse alerting
- Session/device inventory, refresh rotation, forced logout, secure cookies
- Conversation membership and block/privacy checks on every request/event
- Admin RBAC plus immutable append-only audit records for sensitive actions
- Separate `recordings:read` authorization; signed playback URLs, no shared storage credentials
- KMS envelope encryption, private bucket policy, checksum verification, lifecycle deletion
- Opt-in recording control, persistent in-call disclosure for both parties, and deployment-specific consent enforcement
- Secrets from a managed secret store; no credentials in images or Git
- Upload content-type/size scanning when attachments arrive
- Dependency, SAST, authorization, and abuse-case tests in CI

## Scaling

Keep API replicas stateless. The load balancer terminates TLS and supports WebSocket upgrades. PostgreSQL uses read replicas for admin/reporting queries, partitioned message/audit tables at scale, and connection pooling. Scale LiveKit nodes and Egress workers independently; expose the documented RTC TCP/UDP ports and provide TURN/TLS for restrictive networks.

## Backup and recovery

- PostgreSQL: encrypted daily snapshots plus continuous WAL archiving; quarterly restore drills
- Redis: not the system of record; AOF for graceful recovery, but rebuild presence after reconnect
- Object storage: private bucket, versioning where policy allows, 30-day lifecycle, separate KMS keys; backups must honor recording deletion policy
- Define RPO/RTO, test regional recovery, and redact/de-identify nonproduction copies

## Self-hosted ICE and TURN

LiveKit's embedded TURN/UDP service is enabled on public UDP 3478 and also provides STUN. The SFU advertises the configured `LIVEKIT_NODE_IP` directly, so it does not use an external STUN provider to discover the VPS address. RTC media uses UDP 50000–50100 and TURN relay traffic uses UDP 50101–50120. Open those ranges in the VPS firewall. TURN/TLS can be added later with a dedicated self-hosted certificate and layer-4 TCP listener for the most restrictive corporate networks.
