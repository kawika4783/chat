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
| GET | `/api/conversations/:id/messages` | Read up to 100 authorized persistent messages |
| POST | `/api/conversations/:id/messages` | Persist text using `{ text, clientId }` and publish it realtime |
| GET | `/api/admin/recordings` | Admin-only recording metadata and status refresh |
| POST | `/api/admin/recordings/:id/playback-token` | Audit access and issue a short-lived private-object URL |

The current API intentionally omits contacts, attachments, read receipts, account recovery, recording export/download controls, and administrative user management.
