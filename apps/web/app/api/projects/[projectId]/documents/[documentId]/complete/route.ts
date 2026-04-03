/**
 * Upload completion is client-asserted (no S3 HeadObject verification yet) — intentional alpha debt.
 * `storageKey` is set at presign time and must not change here.
 */
import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { documentUploadCompleteBodySchema } from "@repo/contracts";
import { sourceDocuments } from "@repo/db";
import { getDb } from "@/lib/db";
import { getProjectIfMember } from "@/lib/project-access";
import { enqueueIngestParse } from "@/lib/queue";
import { zodErrorToApiMessage } from "@/lib/upload-url-body-schema";

export const dynamic = "force-dynamic";

type RouteCtx = {
  params: Promise<{ projectId: string; documentId: string }>;
};

export async function POST(
  req: NextRequest,
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

  const rows = await db
    .select()
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.id, documentId),
        eq(sourceDocuments.projectId, projectId),
      ),
    )
    .limit(1);
  const doc = rows[0];
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (doc.uploadedByUserId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (doc.status === "queued") {
    return NextResponse.json({
      documentId,
      status: "queued" as const,
      idempotent: true,
    });
  }

  if (doc.status !== "uploading") {
    return NextResponse.json(
      { error: "Document is not awaiting upload completion" },
      { status: 409 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = documentUploadCompleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorToApiMessage(parsed.error) },
      { status: 400 },
    );
  }

  const now = new Date();
  const nextMime = parsed.data.mimeType?.trim() || doc.mimeType;
  const nextSize =
    parsed.data.sizeBytes !== undefined ? parsed.data.sizeBytes : doc.sizeBytes;

  await db
    .update(sourceDocuments)
    .set({
      mimeType: nextMime,
      sizeBytes: nextSize,
      status: "queued",
      updatedAt: now,
      errorMessage: null,
    })
    .where(eq(sourceDocuments.id, documentId));

  const payload = {
    documentId,
    projectId,
    correlationId: randomUUID(),
  };

  try {
    await enqueueIngestParse(payload);
  } catch (err) {
    console.error("[complete] enqueue failed:", err);
    await db
      .update(sourceDocuments)
      .set({
        status: "uploading",
        updatedAt: new Date(),
        errorMessage: "Failed to queue processing job",
      })
      .where(eq(sourceDocuments.id, documentId));
    return NextResponse.json(
      { error: "Could not queue document processing" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    documentId,
    status: "queued" as const,
  });
}
