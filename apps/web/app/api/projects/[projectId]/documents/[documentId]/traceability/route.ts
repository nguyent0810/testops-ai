import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { sourceDocuments, testCases, traceabilityLinks } from "@repo/db";
import { getDb } from "@/lib/db";
import { getProjectIfMember } from "@/lib/project-access";

export const dynamic = "force-dynamic";

type RouteCtx = {
  params: Promise<{ projectId: string; documentId: string }>;
};

export async function GET(
  _req: NextRequest,
  context: RouteCtx,
): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, documentId } = await context.params;
  const db = getDb();

  const project = await getProjectIfMember(db, { userId, projectId });
  if (!project) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const doc = await db
    .select({ id: sourceDocuments.id })
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.id, documentId),
        eq(sourceDocuments.projectId, projectId),
      ),
    )
    .limit(1);

  if (!doc[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const links = await db
    .select({
      requirementId: traceabilityLinks.requirementId,
      testCaseId: traceabilityLinks.testCaseId,
    })
    .from(traceabilityLinks)
    .innerJoin(testCases, eq(traceabilityLinks.testCaseId, testCases.id))
    .where(
      and(
        eq(testCases.sourceDocumentId, documentId),
        eq(testCases.projectId, projectId),
      ),
    );

  return NextResponse.json({ links });
}
