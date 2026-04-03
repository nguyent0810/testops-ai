import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema/index.js";

/**
 * Pooled Neon driver for long-lived Node processes (worker).
 */
export function createPoolDb(connectionString: string): NeonDatabase<typeof schema> {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

export type PoolDb = NeonDatabase<typeof schema>;
