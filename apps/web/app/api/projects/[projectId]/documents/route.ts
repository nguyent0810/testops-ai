import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { sourceDocuments } from "@repo/db";
import { getDb } from "@/lib/db";
import { getProjectIfMember } from "@/lib/project-access";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ projectId: string }> };

export async function GET(
  _req: NextRequest,
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

  const rows = await db
    .select({
      id: sourceDocuments.id,
      filename: sourceDocuments.filename,
      mimeType: sourceDocuments.mimeType,
      sizeBytes: sourceDocuments.sizeBytes,
      status: sourceDocuments.status,
      errorMessage: sourceDocuments.errorMessage,
      uploadedByUserId: sourceDocuments.uploadedByUserId,
      createdAt: sourceDocuments.createdAt,
      updatedAt: sourceDocuments.updatedAt,
    })
    .from(sourceDocuments)
    .where(eq(sourceDocuments.projectId, projectId))
    .orderBy(desc(sourceDocuments.createdAt));

  return NextResponse.json({ documents: rows });
}
