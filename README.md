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
| Database | Postgres (Neon) with Drizzle ORM *(planned)* |
| Auth | Auth.js — Google OAuth + email magic link *(planned)* |
| Video metadata | YouTube Data API v3, server-side with caching *(planned)* |
| Email | Resend / Postmark transactional emails *(planned)* |
| Scheduling | Vercel Cron — streak evaluation + reminders *(planned)* |

## Getting Started

```bash
pnpm install
pnpm dev
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

Early setup phase — the monorepo scaffold is in place; core features are being built ticket-by-ticket per [TICKETS.md](TICKETS.md).
