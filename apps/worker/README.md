# Worker (`@repo/worker`)

Long-lived **BullMQ** process: queues `ingest` (document parse) and `ai` (requirements + test-case generation).

## Build

From repository root:

```bash
pnpm install
pnpm --filter @repo/worker run build
```

Output: `apps/worker/dist/` (run `node dist/index.js` with `cwd` = `apps/worker`, or use `pnpm --filter @repo/worker start` from root).

## Start

```bash
pnpm --filter @repo/worker start
```

Equivalent: `node dist/index.js` after build, with `cwd` set to `apps/worker`.

## Required environment

See **`apps/worker/.env.example`**. Minimum at startup:

- `REDIS_URL` — same Redis as the web app (BullMQ).
- `DATABASE_URL` — same Neon database as the web app (pooled/serverless driver is not required here; worker uses the pool driver from `@repo/db`).

Required when jobs run:

- `AWS_REGION`, `S3_BUCKET` — same bucket as web; optional `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` if not using ambient IAM credentials.
- `OPENAI_API_KEY` — AI jobs fail clearly if missing.

## Runtime expectations

- **Node.js** (LTS recommended). Native dependencies include PDF/DOCX parsing; use Linux/macOS or a Windows-compatible runtime consistent with local dev.
- **Network**: outbound HTTPS to OpenAI, Neon, S3, and Redis.
- **BullMQ**: default retry/attempt behavior applies unless changed in code; jobs persist state in Postgres (`ai_generation_jobs`, document status, etc.).

## Not included

This process does **not** expose an HTTP server. Scale by running more worker instances only if you understand BullMQ concurrency and Redis connection limits.
