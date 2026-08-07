# Implemented realtime protocol

Socket.IO is served at `/socket.io`. The handshake authenticates the same HTTP-only session cookie used by the REST API. A connected socket joins its private user room and every authorized conversation room.

| Direction | Event | Payload |
|---|---|---|
| Server → client | `message:new` | Persisted message envelope |
| Client → server | `typing:start` | `{ conversationId }` |
| Client → server | `typing:stop` | `{ conversationId }` |
| Server → client | `typing:start` / `typing:stop` | `{ conversationId, userId }` after membership validation |
| Server → client | `presence:update` | `{ userId, status }` |

## Call signaling

Every call event derives the sender from the authenticated socket. The server verifies that the actor is the caller or recipient before relaying session descriptions or ICE candidates.

| Direction | Event | Purpose |
|---|---|---|
| Client → server | `call:initiate` | Start an online voice/video call with `{ recipientId, type }` |
| Server → client | `call:incoming` | Notify the recipient with sanitized caller metadata |
| Client → server | `call:accept` / `call:reject` | Recipient-only ringing decision |
| Server → client | `call:accepted` / `call:ended` | Notify the other participant |
| Both directions | `rtc:offer` / `rtc:answer` | Authorized SDP relay |
| Both directions | `rtc:ice` | Authorized, size-limited ICE candidate relay |
| Both directions | `call:connected` / `call:end` | Persist connected time, end state, and duration |

Typing is ephemeral and is rendered only after a real event; the client automatically sends `typing:stop` after 900 ms of inactivity. Durable messages are reloaded through HTTP after reconnecting or refreshing.

Redis-backed multi-replica Socket.IO fan-out, replay cursors, delivery/read receipts, group calls, and call reconnection are not implemented yet. Call media uses the LiveKit SFU and does not traverse the application Socket.IO server.
