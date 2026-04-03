/** Allowed `project_memberships.role` values — enforce at app boundary (DB stays `text`). */
export const PROJECT_ROLES = ["admin", "member"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

/** New projects: creator is always `admin`. */
export const PROJECT_CREATOR_ROLE: ProjectRole = "admin";

export function normalizeProjectRole(raw: string): ProjectRole | null {
  const v = raw.trim().toLowerCase();
  if (v === "admin" || v === "member") return v;
  return null;
}

export function assertProjectRole(raw: string): ProjectRole {
  const r = normalizeProjectRole(raw);
  if (!r) {
    throw new Error(`Invalid project role: ${JSON.stringify(raw)}`);
  }
  return r;
}
