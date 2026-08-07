# WebSocket and WebRTC specification

Socket handshake carries a short-lived access credential/cookie, CSRF-safe origin, device ID, and protocol version. Every client event includes an idempotency/correlation ID.

## Messaging and presence events

| Direction | Event | Essential payload |
|---|---|---|
| C→S | `presence.heartbeat` | `deviceId`, `lastActivityAt` |
| S→C | `presence.changed` | authorized `userId`, status, optional lastSeen |
| C→S | `message.send` | `conversationId`, clientId, type, content, replyToId? |
| S→C | `message.ack` | clientId, messageId, state, persistedAt |
| S→C | `message.created` | authorized message envelope |
| C→S | `message.read` | conversationId, throughMessageId |
| S→C | `message.receipt` | messageId, userId, deliveredAt/readAt |
| C↔S | `typing.start/stop` | conversationId; ephemeral and rate-limited |
| S→C | `notification.created` | type, actor, target, createdAt |

## Signaling events

`call.initiate` → `call.incoming` → `call.accept`/`call.reject` → SDP/ICE → `call.connected` → `call.end`.

| Event | Payload / rule |
|---|---|
| `call.initiate` | recipientId, type; server checks blocks/privacy/busy state |
| `call.incoming` | callId, sanitized caller, type, expiresAt |
| `call.accept/reject/busy` | callId; recipient only |
| `rtc.offer/answer` | callId, SDP; participants only, size limited |
| `rtc.ice` | callId, candidate; participants only, rate limited |
| `call.connected` | callId, connectedAt |
| `recording.started` | callId, recordingId, noticeVersion; emitted to every video participant |
| `recording.status` | callId, status; participants receive start/failure notice, admins receive processing state |
| `call.end` | callId, reason; idempotent from either participant |
| `call.reconnect` | callId, lastSequence; restores signaling state only |

Actual audio/video never traverses the application WebSocket server. ICE attempts host/server-reflexive candidates and automatically uses TURN relay candidates when direct connectivity fails. For recorded video sessions, an SFU media path sends an authorized copy to the isolated recording worker; this is distinct from the signaling server. Server call states: calling, ringing, accepted, connected, rejected, busy, no_answer, ended, failed.

The server emits `recording.started` only after policy/consent checks and recorder readiness. The client must keep a persistent visible indicator for the entire recorded interval; hiding it is not a supported client state.

## Reconnection

Clients use exponential backoff with jitter and resume from the last event cursor. The server replays durable messages/receipts/notifications, not typing events. Call reconnection has a short deadline and rejects stale offers. Redis pub/sub distributes events across gateway replicas.
