import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { aiGenerationJobs, sourceDocuments } from "@repo/db";
import { getDb } from "@/lib/db";
import { getProjectIfMember } from "@/lib/project-access";

export const dynamic = "force-dynamic";

type RouteCtx = {
  params: Promise<{ projectId: string; documentId: string }>;
};

/**
 * Latest AI generation jobs for a document (status / progress for UI polling).
 */
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

  const jobs = await db
    .select({
      id: aiGenerationJobs.id,
      jobKind: aiGenerationJobs.jobKind,
      requirementsJobId: aiGenerationJobs.requirementsJobId,
      status: aiGenerationJobs.status,
      progressPhase: aiGenerationJobs.progressPhase,
      errorMessage: aiGenerationJobs.errorMessage,
      correlationId: aiGenerationJobs.correlationId,
      createdAt: aiGenerationJobs.createdAt,
      updatedAt: aiGenerationJobs.updatedAt,
    })
    .from(aiGenerationJobs)
    .where(
      and(
        eq(aiGenerationJobs.sourceDocumentId, documentId),
        eq(aiGenerationJobs.projectId, projectId),
      ),
    )
    .orderBy(desc(aiGenerationJobs.createdAt))
    .limit(20);

  return NextResponse.json({ jobs });
}
