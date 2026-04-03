import { auth } from "@clerk/nextjs/server";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { requirements, sourceDocuments } from "@repo/db";
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
      id: requirements.id,
      projectId: requirements.projectId,
      sourceDocumentId: requirements.sourceDocumentId,
      aiGenerationJobId: requirements.aiGenerationJobId,
      ordinal: requirements.ordinal,
      title: requirements.title,
      description: requirements.description,
      status: requirements.status,
      createdAt: requirements.createdAt,
      updatedAt: requirements.updatedAt,
    })
    .from(requirements)
    .where(
      documentId
        ? and(
            eq(requirements.projectId, projectId),
            eq(requirements.sourceDocumentId, documentId),
          )
        : eq(requirements.projectId, projectId),
    )
    .orderBy(asc(requirements.sourceDocumentId), asc(requirements.ordinal));

  return NextResponse.json({ requirements: rows });
}
