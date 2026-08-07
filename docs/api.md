# HTTP API design

All payloads are versioned under `/v1`, validated, and return `{ data, error, requestId }`. Cursor pagination is used for histories.

| Method | Route | Purpose |
|---|---|---|
| POST | `/auth/otp/request` | Request throttled OTP through `SMSProvider` |
| POST | `/auth/otp/verify` | Verify code, create session/profile requirement |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke current session |
| GET/PATCH | `/me` | Read/update profile and privacy settings |
| GET/DELETE | `/me/sessions/:id` | List or revoke device sessions |
| GET/POST | `/contacts` | Search/list/add contacts |
| DELETE | `/contacts/:userId` | Remove contact |
| POST/DELETE | `/blocks/:userId` | Block/unblock user |
| GET | `/conversations` | Recent conversations with unread counts |
| GET | `/conversations/:id/messages` | Authorized paged history |
| POST | `/conversations/:id/messages` | Persist a message with idempotency key |
| PATCH/DELETE | `/messages/:id` | Edit/delete own message under policy |
| POST/DELETE | `/messages/:id/reactions/:emoji` | Add/remove reaction |
| POST | `/conversations/:id/read` | Advance read cursor |
| GET | `/calls` | User call history |
| POST | `/calls` | Create authorized call attempt |
| GET | `/rtc/config` | Short-lived STUN/TURN configuration |
| GET | `/notifications` | In-app notifications |
| POST | `/notifications/:id/read` | Mark notification read |
| GET | `/admin/users` | Admin-filtered user list |
| GET/PATCH | `/admin/users/:id` | Inspect/enable/suspend/role update |
| DELETE | `/admin/users/:id` | Policy-gated deletion |
| POST | `/admin/users/:id/revoke-sessions` | Force logout |
| GET | `/admin/messages` | Policy-gated server-readable history search |
| GET | `/admin/calls` | Call metadata only |
| GET | `/admin/recordings` | Search recording metadata; `recordings:read` required |
| GET | `/admin/recordings/:id` | Read recording status and audited metadata |
| POST | `/admin/recordings/:id/playback-token` | Create a two-minute single-purpose signed playback URL and access log |
| DELETE | `/admin/recordings/:id` | Privileged early deletion with immutable audit event |
| GET | `/admin/audit` | Immutable admin audit events |

Recording endpoints additionally use `RECORDING_NOT_READY`, `RECORDING_EXPIRED`, `RECORDING_ACCESS_REQUIRED`, and `RECORDING_POLICY_BLOCKED`. The playback endpoint requires a reason and applies stricter rate limits; it never exposes the permanent object key as a usable URL.
