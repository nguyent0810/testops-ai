/** Detect Postgres unique violation for HTTP 409 mapping. */
export function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const o = err as { code?: string; message?: string; cause?: unknown };
  if (o.code === "23505") return true;
  if (typeof o.message === "string" && /unique/i.test(o.message)) return true;
  if (o.cause) return isUniqueConstraintError(o.cause);
  return false;
}
