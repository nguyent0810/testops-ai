import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import * as schema from "../src/schema/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");
const monorepoRoot = resolve(pkgRoot, "../..");
// Repo root `.env` (same as web app); then allow packages/db/.env to override.
config({ path: resolve(monorepoRoot, ".env") });
config({ path: resolve(monorepoRoot, ".env.local") });
config({ path: resolve(pkgRoot, ".env") });
config({ path: resolve(pkgRoot, ".env.local") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required to run migrations.");
  process.exit(1);
}

const sql = neon(url);
const db = drizzle(sql, { schema });

await migrate(db, { migrationsFolder: resolve(pkgRoot, "drizzle") });
console.log("Migrations applied.");
