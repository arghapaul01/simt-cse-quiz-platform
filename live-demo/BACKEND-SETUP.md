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
- `GET /api/health` — `{ ok, storage: "upstash-redis" | "unconfigured" }`.

## Notes

- Accounts created while the database was off exist only in that browser.
  After the database is live, everyone signs up once fresh on the server.
- Live Group Quiz rooms still live in the browser only (unchanged).
- If the free Redis database is idle for 30 days, Upstash may delete it —
  just create it again the same way; nothing else changes.
