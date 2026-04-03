import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

// Monorepo: Next.js only auto-loads `.env*` from `apps/web/`. Load repo-root `.env`
// when present so local dev can keep a single root file (gitignored).
const here = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(here, "../..");
const rootEnv = path.join(monorepoRoot, ".env");
if (existsSync(rootEnv)) {
  loadEnv({ path: rootEnv });
}

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/db", "@repo/contracts"],
};

export default nextConfig;
