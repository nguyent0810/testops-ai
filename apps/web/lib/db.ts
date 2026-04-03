import { createDb, type Db } from "@repo/db";

const globalForDb = globalThis as unknown as { __tmDb?: Db };

export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!globalForDb.__tmDb) {
    globalForDb.__tmDb = createDb(url);
  }
  return globalForDb.__tmDb;
}
