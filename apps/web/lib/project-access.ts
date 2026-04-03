import { and, eq } from "drizzle-orm";
import type { Db } from "@repo/db";
import {
  organizationMemberships,
  projectMemberships,
  projects,
} from "@repo/db";

export type ProjectRow = typeof projects.$inferSelect;

const projectColumns = {
  id: projects.id,
  organizationId: projects.organizationId,
  name: projects.name,
  slug: projects.slug,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
} as const;

export type ProjectSummary = Pick<
  ProjectRow,
  "id" | "organizationId" | "name" | "slug" | "createdAt" | "updatedAt"
>;

/**
 * Coarse access: user must have a `project_memberships` row (no per-route policy yet).
 */
export async function userHasProjectAccess(
  db: Db,
  params: { userId: string; projectId: string },
): Promise<boolean> {
  const row = await db
    .select({ p: projectMemberships.projectId })
    .from(projectMemberships)
    .where(
      and(
        eq(projectMemberships.projectId, params.projectId),
        eq(projectMemberships.userId, params.userId),
      ),
    )
    .limit(1);
  return row.length > 0;
}

export async function userIsOrgMember(
  db: Db,
  params: { userId: string; organizationId: string },
): Promise<boolean> {
  const row = await db
    .select({ x: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, params.organizationId),
        eq(organizationMemberships.userId, params.userId),
      ),
    )
    .limit(1);
  return row.length > 0;
}

/** Projects the user belongs to (for future list UI / APIs). */
export async function listProjectsForUser(
  db: Db,
  userId: string,
): Promise<Pick<ProjectRow, "id" | "organizationId" | "name" | "slug">[]> {
  return db
    .select({
      id: projects.id,
      organizationId: projects.organizationId,
      name: projects.name,
      slug: projects.slug,
    })
    .from(projects)
    .innerJoin(projectMemberships, eq(projectMemberships.projectId, projects.id))
    .where(eq(projectMemberships.userId, userId));
}

/** All projects in an org (caller must verify org membership). */
export async function listProjectsInOrganization(
  db: Db,
  organizationId: string,
): Promise<ProjectSummary[]> {
  return db
    .select(projectColumns)
    .from(projects)
    .where(eq(projects.organizationId, organizationId));
}

export async function getProjectIfMember(
  db: Db,
  params: { userId: string; projectId: string },
): Promise<ProjectSummary | null> {
  const rows = await db
    .select(projectColumns)
    .from(projects)
    .innerJoin(projectMemberships, eq(projectMemberships.projectId, projects.id))
    .where(
      and(
        eq(projects.id, params.projectId),
        eq(projectMemberships.userId, params.userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
