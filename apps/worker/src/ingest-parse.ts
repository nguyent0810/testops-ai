import type { IngestParseJobPayload } from "@repo/contracts";
import type { PoolDb } from "@repo/db";
import type { Redis } from "ioredis";
import { parsedSections, sourceDocuments } from "@repo/db";
import { and, eq } from "drizzle-orm";
import { chunkIntoSections } from "./chunk-sections.js";
import { downloadObject } from "./s3-download.js";
import { extractRawText, resolveExtractKind } from "./extract-text.js";
import { scheduleAiRequirementExtractionAfterParse } from "./schedule-ai-after-parse.js";

export type ProcessIngestParseOptions = {
  /** When set, creates an `ai_generation_jobs` row and enqueues requirement extraction. */
  queueConnection?: Redis;
};

function truncateErr(message: string, max = 500): string {
  return message.length <= max ? message : message.slice(0, max);
}

export async function processIngestParse(
  db: PoolDb,
  payload: IngestParseJobPayload,
  options?: ProcessIngestParseOptions,
): Promise<void> {
  const { documentId, projectId, correlationId } = payload;

  const found = await db
    .select()
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.id, documentId),
        eq(sourceDocuments.projectId, projectId),
      ),
    )
    .limit(1);

  const doc = found[0];
  if (!doc) {
    console.warn(`[worker] ingest.parse missing document id=${documentId}`);
    return;
  }

  if (doc.status === "parsed") {
    console.log(`[worker] ingest.parse skip already parsed id=${documentId}`);
    return;
  }

  if (doc.status !== "queued") {
    console.warn(
      `[worker] ingest.parse skip status=${doc.status} id=${documentId} correlationId=${correlationId}`,
    );
    return;
  }

  if (!doc.storageKey.trim()) {
    await db
      .update(sourceDocuments)
      .set({
        status: "failed",
        errorMessage: truncateErr("Missing storageKey"),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sourceDocuments.id, documentId),
          eq(sourceDocuments.projectId, projectId),
          eq(sourceDocuments.status, "queued"),
        ),
      );
    return;
  }

  const claimed = await db
    .update(sourceDocuments)
    .set({
      status: "parsing",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sourceDocuments.id, documentId),
        eq(sourceDocuments.projectId, projectId),
        eq(sourceDocuments.status, "queued"),
      ),
    )
    .returning({ id: sourceDocuments.id });

  if (claimed.length === 0) {
    console.warn(`[worker] ingest.parse lost claim id=${documentId}`);
    return;
  }

  try {
    const buffer = await downloadObject(doc.storageKey);
    if (buffer.length === 0) {
      throw new Error("Downloaded file is empty (0 bytes)");
    }
    const kind = resolveExtractKind(doc.mimeType, doc.filename);
    if (!kind) {
      throw new Error(
        `Unsupported file type (mime=${doc.mimeType}, filename=${doc.filename})`,
      );
    }
    const rawText = await extractRawText(buffer, kind);
    const visible = rawText
      .replace(/\uFEFF/g, "")
      .replace(/[\s\u00a0\u200b\u200c\u200d\ufeff]/g, "");
    if (!visible) {
      throw new Error(
        "No readable text was extracted from this file. It may be a scanned or image-only PDF, password-protected, empty, or use an encoding we cannot read.",
      );
    }
    const sectionInputs = chunkIntoSections(rawText);
    const values = sectionInputs.map((s, i) => ({
      sourceDocumentId: documentId,
      ordinal: i + 1,
      heading: s.heading,
      content: s.content.length > 0 ? s.content : " ",
    }));

    await db.transaction(async (tx) => {
      await tx
        .delete(parsedSections)
        .where(eq(parsedSections.sourceDocumentId, documentId));
      await tx.insert(parsedSections).values(values);
      await tx
        .update(sourceDocuments)
        .set({
          status: "parsed",
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(sourceDocuments.id, documentId),
            eq(sourceDocuments.projectId, projectId),
            eq(sourceDocuments.status, "parsing"),
          ),
        );
    });

    console.log(
      `[worker] ingest.parse ok id=${documentId} sections=${values.length} correlationId=${correlationId}`,
    );

    if (options?.queueConnection) {
      await scheduleAiRequirementExtractionAfterParse(
        db,
        options.queueConnection,
        { documentId, projectId },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(sourceDocuments)
      .set({
        status: "failed",
        errorMessage: truncateErr(message),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sourceDocuments.id, documentId),
          eq(sourceDocuments.projectId, projectId),
          eq(sourceDocuments.status, "parsing"),
        ),
      );
    console.error(
      `[worker] ingest.parse failed id=${documentId} correlationId=${correlationId}`,
      err,
    );
  }
}
