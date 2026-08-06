# golf-mns-fantasy

PGA fantasy pools and leagues for [golf.mnsfantasy.com](https://golf.mnsfantasy.com).

Vite + React 19 + Vercel serverless functions + Neon Postgres (`golf` schema),
Clerk auth shared across `*.mnsfantasy.com`.

## Local development

```bash
vercel dev
```

Not `npm run dev` — that serves the UI but cannot run anything in `api/`.

`.env.local` needs Clerk **development** keys (`pk_test_`/`sk_test_`);
production keys are domain-locked and will render a blank page on
localhost. See `.env.example`.

## Scripts

| Command | Purpose |
|---|---|
| `vercel dev` | Full local stack — UI plus API routes |
| `npm run build` | Typecheck `src` and `api`, then bundle |
| `npm run db:push` | Push Drizzle schema (scoped to the `golf` schema) |

## Architecture

See `CLAUDE.md` in this directory, and the workspace `CLAUDE.md` one
level up for platform-wide rules.
