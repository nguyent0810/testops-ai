import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  organizations,
  projectMemberships,
  projects,
} from "@repo/db";
import { createProjectBodySchema } from "@/lib/create-project-schema";
import { getDb } from "@/lib/db";
import { isUniqueConstraintError } from "@/lib/db-errors";
import {
  listProjectsInOrganization,
  userIsOrgMember,
} from "@/lib/project-access";
import { PROJECT_CREATOR_ROLE } from "@/lib/project-roles";
import { zodErrorToApiMessage } from "@/lib/upload-url-body-schema";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ orgId: string }> };

export async function GET(
  _req: NextRequest,
  context: RouteCtx,
): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await context.params;
  const db = getDb();

  const orgRow = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (orgRow.length === 0) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const allowed = await userIsOrgMember(db, { userId, organizationId: orgId });
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const list = await listProjectsInOrganization(db, orgId);
  return NextResponse.json({ projects: list });
}

export async function POST(
  req: NextRequest,
  context: RouteCtx,
): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await context.params;
  const db = getDb();

  const orgRow = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (orgRow.length === 0) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const allowed = await userIsOrgMember(db, { userId, organizationId: orgId });
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createProjectBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorToApiMessage(parsed.error) },
      { status: 400 },
    );
  }

  const { name, slug } = parsed.data;
  const now = new Date();

  try {
    const inserted = await db
      .insert(projects)
      .values({
        organizationId: orgId,
        name,
        slug,
        createdAt: now,
        updatedAt: now,
      })
      .returning({
        id: projects.id,
        organizationId: projects.organizationId,
        name: projects.name,
        slug: projects.slug,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      });

    const project = inserted[0];
    if (!project) {
      return NextResponse.json({ error: "Create failed" }, { status: 500 });
    }

    try {
      await db.insert(projectMemberships).values({
        projectId: project.id,
        userId,
        role: PROJECT_CREATOR_ROLE,
        createdAt: now,
        updatedAt: now,
      });
    } catch (membershipErr) {
      await db.delete(projects).where(eq(projects.id, project.id));
      throw membershipErr;
    }

    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json(
        { error: "Project slug already exists in this organization" },
        { status: 409 },
      );
    }
    console.error("[POST /api/organizations/.../projects]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
