import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { sourceDocuments } from "@repo/db";
import { getDb } from "@/lib/db";
import { getProjectIfMember } from "@/lib/project-access";
import {
  buildDocumentStorageKey,
  newDocumentId,
  presignPutDocument,
} from "@/lib/s3";
import {
  uploadUrlBodySchema,
  zodErrorToApiMessage,
} from "@/lib/upload-url-body-schema";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ projectId: string }> };

export async function POST(
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = uploadUrlBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorToApiMessage(parsed.error) },
      { status: 400 },
    );
  }

  const { filename, mimeType: bodyMime } = parsed.data;
  const contentType = bodyMime?.trim() || "application/octet-stream";
  const documentId = newDocumentId();
  const storageKey = buildDocumentStorageKey(projectId, documentId, filename);
  const now = new Date();

  await db.insert(sourceDocuments).values({
    id: documentId,
    projectId,
    uploadedByUserId: userId,
    storageKey,
    filename,
    mimeType: contentType,
    sizeBytes: 0,
    status: "uploading",
    createdAt: now,
    updatedAt: now,
  });

  try {
    const uploadUrl = await presignPutDocument({
      storageKey,
      contentType,
    });
    return NextResponse.json({
      documentId,
      storageKey,
      uploadUrl,
      method: "PUT" as const,
      headers: { "Content-Type": contentType },
    });
  } catch (err) {
    console.error("[upload-url] presign failed:", err);
    await db.delete(sourceDocuments).where(eq(sourceDocuments.id, documentId));
    return NextResponse.json(
      { error: "Could not create upload URL" },
      { status: 500 },
    );
  }
}
