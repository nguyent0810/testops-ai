import { auth } from "@clerk/nextjs/server";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { sourceDocuments, testCases } from "@repo/db";
import { getDb } from "@/lib/db";
import { getProjectIfMember } from "@/lib/project-access";

export const dynamic = "force-dynamic";

type RouteCtx = {
  params: Promise<{ projectId: string }>;
};

export async function GET(
  req: NextRequest,
  context: RouteCtx,
): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await context.params;
  const db = getDb();

  const project = await getProjectIfMember(db, { userId, projectId });
  if (!project) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const documentId = req.nextUrl.searchParams.get("documentId")?.trim();
  if (documentId) {
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
  }

  const rows = await db
    .select({
      id: testCases.id,
      projectId: testCases.projectId,
      sourceDocumentId: testCases.sourceDocumentId,
      requirementsJobId: testCases.requirementsJobId,
      aiGenerationJobId: testCases.aiGenerationJobId,
      ordinal: testCases.ordinal,
      title: testCases.title,
      precondition: testCases.precondition,
      steps: testCases.steps,
      expectedResult: testCases.expectedResult,
      priority: testCases.priority,
      status: testCases.status,
      createdAt: testCases.createdAt,
      updatedAt: testCases.updatedAt,
    })
    .from(testCases)
    .where(
      documentId
        ? and(
            eq(testCases.projectId, projectId),
            eq(testCases.sourceDocumentId, documentId),
          )
        : eq(testCases.projectId, projectId),
    )
    .orderBy(asc(testCases.sourceDocumentId), asc(testCases.ordinal));

  return NextResponse.json({ testCases: rows });
}
