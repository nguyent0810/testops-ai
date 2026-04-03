import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema/index.js";

/**
 * Serverless-friendly DB (Next.js Route Handlers, short-lived requests).
 * Do not import this from Client Components.
 */
export function createDb(connectionString: string): NeonHttpDatabase<typeof schema> {
  const sql = neon(connectionString);
  return drizzle(sql, { schema });
}

export type Db = NeonHttpDatabase<typeof schema>;
