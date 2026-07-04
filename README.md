# PeakStreak

A learning-accountability dashboard for people who use YouTube playlists as a self-study tool. Paste a playlist link, see how long it will realistically take to finish, and build a daily streak until you complete it.

## The Problem

People save YouTube playlists ("100 Days of Code," a full ML course, a lecture series) with real intent to finish them — and then stop after video 3, often without noticing. YouTube is built for *discovery and watch-time*, not for *completion of a learning goal*. PeakStreak fills that gap.

## What It Does

- **Realistic time estimates** — paste a playlist URL and see the total watch time and a projected finish date based on your chosen daily pace.
- **Streaks & heatmap** — a GitHub-style contribution graph and daily streak counter that make progress visible and motivating.
- **Watch tracking** — per-video progress tracked automatically while you watch, so "where was I?" is never a question.
- **Notes** — a private notes panel alongside the player, so what you learn compounds instead of evaporating.
- **Email nudges** — timezone-aware reminder emails that pull you back before a streak breaks.

## Tech Stack

| Layer | Choice |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Framework | Next.js (TypeScript) in `apps/web` |
| UI | shadcn/ui shared component library in `packages/ui` |
| Database | Postgres with Drizzle ORM (Neon-ready) |
| Auth | Auth.js v5 — email/password + Google OAuth |
| Video metadata | YouTube Data API v3, server-side with 24h caching |
| Email | Resend transactional emails |
| Scheduling | Vercel Cron — streak evaluation + reminders |

## Getting Started

Prerequisites: Node 20+, pnpm 10, and a local Postgres (e.g. `brew install postgresql@16`).

```bash
# 1. Install dependencies
pnpm install

# 2. Create the local database
createdb peakstreak

# 3. Configure environment
cp .env.example apps/web/.env.local
# then edit apps/web/.env.local:
#   DATABASE_URL=postgresql://localhost:5432/peakstreak
#   AUTH_SECRET=$(openssl rand -base64 32)
#   YOUTUBE_API_KEY=<your key from Google Cloud Console>
# GOOGLE_CLIENT_ID/SECRET are optional locally (the Google button hides
# without them); RESEND_API_KEY is optional (emails log to the console).

# 4. Apply database migrations
pnpm --filter web db:migrate

# 5. Run the app
pnpm dev
```

Visit `http://localhost:3000`. Verify the setup at `http://localhost:3000/api/health` — it should return `{"status":"ok","database":"connected"}`.

Other useful commands (run from the repo root):

```bash
pnpm --filter web test         # unit tests (pace math, streaks, dates, URL parsing)
pnpm --filter web db:generate  # generate a migration after editing lib/db/schema.ts
pnpm --filter web db:studio    # browse the database in Drizzle Studio
pnpm typecheck                 # typecheck all workspaces
```

The web app lives in `apps/web`. To add shadcn/ui components, run from the repo root:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

Components are placed in `packages/ui/src/components` and imported as:

```tsx
import { Button } from "@workspace/ui/components/button";
```

## Project Docs

- [PRD.md](PRD.md) — product requirements: personas, goals, feature scoping
- [ARCHITECTURE.md](ARCHITECTURE.md) — technical architecture and system design
- [DESIGN.md](DESIGN.md) — design direction
- [SECURITY.md](SECURITY.md) — security considerations
- [TICKETS.md](TICKETS.md) — ordered, self-contained feature tickets for the MVP build

## Status

All v1 tickets (PS-1 through PS-14) are implemented: auth, playlist ingestion with quota-safe caching, pace estimates, dashboard with streaks and an activity heatmap, the watch view with genuine watch-time tracking, autosaving notes with export, the completion celebration, timezone-aware reminder emails on an hourly cron, the public landing funnel, and self-hosted analytics. 79 unit/integration tests cover the streak, pace, timezone, progress, and reminder logic (`pnpm --filter web test`).

To go live you still need real credentials in production env: a YouTube Data API key, Google OAuth client, Resend key with domain DNS (SPF/DKIM/DMARC), a Postgres URL, and `CRON_SECRET` matching the Vercel cron config in `apps/web/vercel.json`.
