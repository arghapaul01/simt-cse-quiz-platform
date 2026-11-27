# SIMT Quiz Platform — Free Server Backend (Vercel + Upstash Redis)

The public site now has a real server backend: `live-demo/api/*` (plain Node.js
serverless functions, no build step) + `live-demo/backend.js` (wires the page
to the API). Sign-up / login / profile photo / quiz history save on the
server and come back on login from any device. Until the database below is
created, the page keeps working exactly as before (browser-only storage).

## Enable it (one time, ~2 minutes, free, no card)

1. Open https://vercel.com/dashboard and open project **simt-cse-quiz-platform**.
2. Click the **Storage** tab → **Browse Marketplace** (or **Create Database**).
3. Choose **Upstash Redis** → **Add / Create** → accept the terms → pick any
   name (e.g. `simt-quiz-redis`) and a region (closest: Singapore `ap-southeast-1`
   is nearest to Bangladesh) → **Create**.
4. Vercel injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` into
   the project automatically. Then **Deployments** → latest deployment → **⋯ →
   Redeploy** (or just push any commit — Vercel redeploys on push).
5. Check: open https://simt-cse-quiz-platform.vercel.app/api/health
   It must say `"storage": "upstash-redis"`. Before this step it says
   `"unconfigured"` — that is expected, not an error.

## Free-tier limits that matter

- Upstash Redis free: **10,000 commands/day, 256 MB storage**, no card.
  A sign-up/login costs ~5 commands, a quiz sync ~3. A class of 100 students
  stays far below the daily limit.
- Vercel Hobby free: 100K function invocations/month — plenty for this app.
- Photos are downscaled to max 256px JPEG before upload (max 500 KB each).

## What the API does

- `POST /api/auth` — signup / login. Passwords stored only as scrypt hashes
  with a per-user salt. Login sessions are HMAC-signed tokens (30 days).
  20 auth tries per IP per 10 minutes (brute-force protection).
- `GET /api/me`, `PUT /api/me` — own profile + full quiz history.
- `POST /api/sync` — browser pushes current user + attempts (merge by
  id+date, so two devices never overwrite each other).
- `GET /api/admin/overview` — admin only (arghapaulnillarghapaul@gmail.com):
  total students, total attempts, every student's history. Password hashes
  are never sent to any client.
- `POST /api/admin { action: "reset-password", userId, newPassword }` —
  admin only: sets a new temporary password for a locked-out student.
  The student's current password is never shown and cannot be recovered
  (one-way scrypt hashes); the new password is never returned or stored
  in plaintext.
- `POST /api/admin { action: "delete-user", userId }` — admin only:
  permanently deletes that student's account and all their quiz attempts
  from the server. The admin's own account cannot be deleted this way.
  The Admin Dashboard has a two-click Delete button on each student's
  detail (hidden on the admin's own row). Deletion cannot be undone.
- `POST /api/admin { action: "delete-room", roomId }` — admin only:
  deletes a live room (record, code lookup, players set) before its
  7-day expiry. The lastroomset:* keys are left alone so the next room
  still has to draw a set different from the previous room's set.
- `GET /api/leaderboard` — public, no login: every registered student
  with quiz aggregates only (name, Student ID, photo, attempts, correct,
  total, best %). No emails, no answers, no password data. The page
  merges this into the leaderboard so every browser shows each player's
  current profile photo (single source of truth).
- Sign-up accepts any name, Student ID (any department, any length),
  email and password — only an empty field is rejected. CSE-2324001 is
  only the placeholder example on the form.
- `GET /api/health` — `{ ok, storage: "upstash-redis" | "unconfigured" }`.
- `POST /api/live` + `GET /api/live` — server-backed Live Group Quiz rooms
  (see "Live rooms" below). Max **50 players per room** including the host.

## Live rooms (server-backed)

Rooms used to live only in the browser that created them, so a room made on
one phone could not be joined from another phone. Now rooms live in Redis:

- `POST /api/live { action: "create", category, questionCount: 30|50, questionIds }`
  — host becomes player 1; the host draws the questions from the shared
  813-question bank, so everyone answers the same set.
- New-room rule: every new room draws a FRESH set, different from the
  previous room's set — never the same set twice in a row. The server
  compares a create's questionIds with the host's last set and the
  globally most recent set (Redis keys `lastroomset:<hostId>` and
  `lastroomset:global`) and rejects an identical set with
  `409 { sameAsPrevious: true }`; the client then re-draws and retries
  (up to 5 times). The local fallback re-draws the same way. Inside one
  room every player still gets the identical set in the identical order,
  and a finished room stays closed (join after finish is rejected).
- `POST /api/live { action: "join", code }` — join by 6-digit code, lobby only.
  The 51st join is rejected: `409 "রুম ভরে গেছে — এক রুমে সর্বোচ্চ ৫০ জন।"`
- `GET /api/live?action=room&roomId=…` — poll every ~2 s; the server advances
  the room (per-question 20 s deadline, 15 min total for 30 questions,
  25 min for 50) before answering, so all devices see the same state.
- `POST /api/live { action: "start" | "answer" | "finish", roomId, … }` —
  start is host-only; answers send selectedIndex + correctIndex and the
  server computes correct/wrong and the elapsed time.
- `GET /api/live?action=mine` — finished live-event records for the
  logged-in user, so live history shows on any device.
- Rooms expire after 7 days. If the server is unreachable, the page falls
  back to local-only rooms with the same 50-player cap and lobby rules.
- Known limits: the 50-cap uses SADD + SCARD in one pipeline, so two joins
  landing in the exact same instant could both slip through (51 players);
  in a classroom this is effectively impossible, and the local fallback
  enforces the cap exactly. Polling costs ~1 Redis command per client per
  2 s (a 50-player room polls ~25 commands/s while playing — fine inside
  the 10,000/day free tier for a class session, but don't leave the live
  view open for hours). The admin dashboard shows live events only for
  rooms on the admin's own device, as before.

## Notes

- Accounts created while the database was off exist only in that browser.
  After the database is live, everyone signs up once fresh on the server.
- If the free Redis database is idle for 30 days, Upstash may delete it —
  just create it again the same way; nothing else changes.
