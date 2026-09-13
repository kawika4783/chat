# Implemented HTTP API

Nginx exposes these endpoints below `/api`; the API service receives the paths without that prefix. JSON errors use `{ "error": "message" }`. Authenticated routes require the `halo_session` HTTP-only cookie.

| Method | Public route | Purpose |
|---|---|---|
| GET | `/api/health` | Database-backed readiness response |
| POST | `/api/auth/request-otp` | Validate/rate-limit a phone and create a five-minute OTP |
| POST | `/api/auth/verify-otp` | Consume OTP, upsert account/profile, create session cookie |
| POST | `/api/auth/admin/login` | Verify an administrator credential and create a session cookie |
| GET | `/api/auth/me` | Restore the current session |
| POST | `/api/auth/logout` | Revoke the current session and clear its cookie |
| GET | `/api/users?query=` | Search registered users without exposing their phone numbers |
| GET | `/api/calls` | Return the current user's latest call metadata |
| GET | `/api/calls/:id/join` | Issue a short-lived LiveKit room token to a call participant |
| GET | `/api/conversations` | List the current user's direct conversations |
| POST | `/api/conversations/direct` | Idempotently create a direct conversation with `userId` |
| PUT | `/api/contacts/:id/photo` | Resize/store an authenticated user's private per-contact photo |
| GET | `/api/conversations/:id/messages` | Read up to 100 authorized persistent messages |
| POST | `/api/conversations/:id/messages` | Persist text using `{ text, clientId }` and publish it realtime |
| GET | `/api/admin/recordings` | Admin-only recording metadata and status refresh |
| POST | `/api/admin/recordings/:id/playback-token` | Audit access and issue a short-lived private-object URL |
| GET | `/api/admin/users` | Admin-only user and last-login inventory |
| PATCH | `/api/admin/users/:id` | Validate and audit profile, login, role, or account-status edits |
| GET | `/api/admin/login-activity` | Admin-only session/login report with hashed sources |
| GET | `/api/admin/audit-log` | Admin-only administrative event report |

Socket.IO call events include participant disconnect propagation plus participant-controlled `recording:start` and `recording:stop`. The current API intentionally omits general attachments, read receipts, account recovery, and recording export/download controls.
