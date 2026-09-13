# Wellrun School

An operating system for schools in Pakistan. This repo is the Layer 1 + Layer 2 foundation: a public school discovery network and a school operations console, sharing one NestJS + PostgreSQL backend.

## Apps

| App | Stack | Port | Role |
| --- | --- | --- | --- |
| `apps/discover` | Next.js, mobile-first | 3001 | Layer 1 — parents browse and compare schools |
| `apps/console` | Vite + React, desktop-first | 5173 | Layer 2 — staff run attendance, students, fees |
| `apps/api` | NestJS + Prisma | 3000 | Shared backend |

Layer 3 (AI school OS) is a stub only.

## Local setup

1. Copy `.env.example` to `apps/api/.env`, `apps/discover/.env.local`, and `apps/console/.env`.
2. Start PostgreSQL — either Docker (`pnpm db:up`) or local Prisma Postgres:

```bash
pnpm --filter @wellrun/api exec prisma dev --name wellrun-school --detach
```

3. From the repo root:

```bash
pnpm install
pnpm db:push
pnpm db:seed
pnpm dev
```

## Demo login (console)

- Email: `admin@greenfield.school`
- Password: `school123`

English UI first. Urdu / RTL keys are reserved in `packages/i18n` for later.
