# SIMT CSE Quiz Platform

B.Sc. in Computer Science & Engineering, Dept. of CSE, SIMT (Saic Institute of Management and Technology), Technology Unit, University of Dhaka.

**Developed by Argha Paul, Student ID: CSE-2324001**

## What it is

A CSE Quiz Platform for SIMT students:

- Individual signup / login with Student ID (`CSE-2324001` format)
- Solo Quiz — 30 random questions per attempt, Easy / Medium / Hard mixed
- Live Group Quiz — everyone joins one room, answers the same questions together, 30 or 50 questions, live leaderboard
- Animated questions and explanations, marks, correct / wrong count, rank
- Leaderboard with photo, name and Student ID
- History — attempts, total questions answered, live events with date, marks and rank
- Profile photo upload
- Admin Dashboard — Admin Login only for the admin Gmail, all registered students, quiz attempts, marks, ranking, wrong answers; add / edit / delete questions, categories and campus contact info from the dashboard

## Tech stack (as built)

- Frontend: React 19 + Redux Toolkit (`client/src/store.ts`), TypeScript, Tailwind CSS, arrow functions throughout
- Backend: TypeScript server actions in `server/src/actions.ts` (REST-style API)
- Database: Drizzle ORM with SQL migrations in `drizzle/` (0001–0008). **Note: this build uses SQLite through Drizzle (`sqliteTable` in `server/src/schema.ts`), not MySQL.** The table structure in `drizzle/` and `server/src/schema.ts` is the database design; it can be ported to MySQL.
- Question bank: `server/src/questions-data.ts` — **269 questions** in this version (C Programming 48, DBMS 47, Networking 44, Data Structures 36, OOP 35, Digital Logic 29, Future Topics 29; Easy 54, Medium 142, Hard 73). The target was 1500–2000; the bank grows by adding questions from the Admin Dashboard or by adding more to this file.
- Campus contact: M/3, Section-14, Mirpur, Dhaka-1216; 01961 614 776; 01936 005 818; simt.dhaka@gmail.com; simt.ac.bd
- Logo: B.Sc. Engineering shield logo (`client/src/assets/simt-eng-logo.webp`), not the Diploma round logo.

## Folders

- `client/` — React frontend (App.tsx, store.ts, api.ts, theme.css)
- `server/src/` — server actions, question bank, database schema
- `drizzle/` — SQL migrations
- `live-demo/` — static single-file demo version (index.html + assets). This is the version with the Live Group start-button fix from 26 Nov 2026 night. That fix is in the static demo only and is not yet merged into the TypeScript source in `client/` / `server/`.

## Run locally

```bash
bun install
bun run build
```

Requires Bun 1.3+. Node.js / npm users: install dependencies with your package manager and adapt the build scripts in `package.json`.

## Admin login

Admin Login on the login page accepts only the admin Gmail. Never share the admin password in chat or commit it to the repo.
