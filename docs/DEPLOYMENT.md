# Deployment (internal alpha)

This monorepo contains:

- **`apps/web`** — Next.js app (intended for **Vercel** or any Node host that runs `next start`).
- **`apps/worker`** — Long-lived **BullMQ** worker (must run separately from the web app).
- **`packages/db`** — Drizzle schema + SQL migrations for **Neon Postgres**.

Third-party services: **Clerk** (auth + org/user sync via webhook), **Neon**, **Redis** (TLS URL), **S3-compatible storage**, **OpenAI** (worker only).

---

## Required third-party services

| Service | Used by | Notes |
|--------|---------|--------|
| **Neon** | Web, worker, migrations | Same logical database; use pooled URL for serverless web if Neon recommends it. |
| **Redis** | Web (enqueue), worker (consume) | Same `REDIS_URL`; must be reachable from **both** (often `rediss://`). |
| **S3-compatible bucket** | Web (presign PUT), worker (GetObject) | Same region, bucket, and credentials (or IAM on worker host). **Browser uploads require bucket CORS** allowing `PUT` from your web origin. |
| **Clerk** | Web | Production keys, allowed origins/redirects, and **webhook** to `/api/webhooks/clerk` with signing secret. |
| **OpenAI** | Worker only | `OPENAI_API_KEY` on the worker process. |

---

## Database migration flow

1. Create a Neon database and copy the connection string.
2. Set `DATABASE_URL` in the environment where you run migrations (CI or local with `packages/db/.env`).
3. From the **repository root**:

   ```bash
   pnpm install
   pnpm --filter @repo/db db:migrate
   ```

4. Apply migrations **before** or as part of first deploy so web and worker see the same schema.

If DDL fails through a pooler, use Neon’s **direct (non-pooled)** connection string for migrations only (see Neon docs).

**No Prisma** — migrations are Drizzle SQL under `packages/db/drizzle/`.

---

## Web deploy flow (Vercel)

1. Connect the Git repo to Vercel.
2. Set **Root Directory** to **`apps/web`** (so Next.js resolves correctly).
3. Vercel will use `apps/web/vercel.json` for install/build commands that run the monorepo from the repo root.
4. Add environment variables in the Vercel project (see `apps/web/.env.example` and sections below).
5. In **Clerk**, set the production **Frontend API / URLs** and add webhook endpoint:  
   `https://<your-domain>/api/webhooks/clerk` with the same **`CLERK_WEBHOOK_SIGNING_SECRET`** as in Vercel.

**S3 CORS** (required for browser upload): allow `PUT` from your site origin and the `Content-Type` header you send on presigned PUT.

---

## Worker deploy flow

1. Build on the server or in CI:

   ```bash
   pnpm install
   pnpm --filter @repo/worker run build
   ```

2. Run:

   ```bash
   node apps/worker/dist/index.js
   ```

   (Or `pnpm --filter @repo/worker start` from repo root if `cwd` includes the workspace.)

3. Set environment variables (see `apps/worker/.env.example`). **Same** `DATABASE_URL`, `REDIS_URL`, and S3 settings as production web (plus `OPENAI_API_KEY`).

4. Use a **long-lived** process (systemd, Docker, Railway, Fly, etc.). The worker does not need to accept HTTP traffic.

See **`apps/worker/README.md`** for the short contract (build / start / env).

---

## Environment variables (overview)

| Area | Variables | Where |
|------|-----------|--------|
| **Auth (Clerk)** | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` | Web |
| **Database** | `DATABASE_URL` | Web, worker, `packages/db` migrate |
| **Redis** | `REDIS_URL` | Web, worker |
| **Storage** | `AWS_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (optional if instance role provides creds) | Web, worker |
| **AI** | `OPENAI_API_KEY`, optional `OPENAI_MODEL` | Worker only |

Authoritative templates: `apps/web/.env.example`, `apps/worker/.env.example`, `packages/db/.env.example`.

---

## Smoke validation checklist

After deploy:

- [ ] Sign in (Clerk) loads; no redirect loop.
- [ ] `/api/webhooks/clerk` receives events (create org/user in Clerk; verify rows or logs).
- [ ] **Upload** a small PDF or `.txt` → document shows **queued** → **parsed** (or a clear **failed** message).
- [ ] **Redis**: if `REDIS_URL` is wrong, upload **complete** step fails with queue error — fix Redis first.
- [ ] **AI**: requirements job runs then test-case job (or failed job shows `errorMessage` in UI).
- [ ] Edit a test case and **save**; no 401/403.

---

## Operational notes (alpha)

- **Upload completion** does not verify object size in S3 (documented alpha behavior in code).
- **BullMQ** job retry/attempt defaults are library defaults unless you change worker code later.
- **Worker** runs OpenAI calls synchronously inside jobs; ensure the host allows sufficient wall time for long documents.
