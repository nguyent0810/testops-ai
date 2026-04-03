# Test management (internal alpha)

Monorepo: **Next.js** (`apps/web`), **BullMQ worker** (`apps/worker`), **Drizzle + Neon** (`packages/db`).

## Quick start (local)

```bash
pnpm install
pnpm dev
```

Copy env templates: `apps/web/.env.example`, `apps/worker/.env.example`, `packages/db/.env.example`.

## Deploy

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for Vercel web, separate worker, migrations, third-party services, and smoke checks.
