import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import type { PoolDb } from "@repo/db";
import { aiGenerationJobs } from "@repo/db";
import { eq } from "drizzle-orm";
import { enqueueAiExtractRequirementsJob } from "./enqueue-ai.js";

function truncateErr(message: string, max = 500): string {
  return message.length <= max ? message : message.slice(0, max);
}

/**
 * Insert `ai_generation_jobs` (pending) and enqueue `ai.extract_requirements`.
 * On enqueue failure, marks the job row `failed` (document remains `parsed`).
 */
export async function scheduleAiRequirementExtractionAfterParse(
  db: PoolDb,
  queueConnection: Redis,
  params: { documentId: string; projectId: string },
): Promise<void> {
  const correlationId = randomUUID();
  const inserted = await db
    .insert(aiGenerationJobs)
    .values({
      projectId: params.projectId,
      sourceDocumentId: params.documentId,
      status: "pending",
      jobKind: "requirements",
      correlationId,
    })
    .returning({ id: aiGenerationJobs.id });

  const row = inserted[0];
  if (!row) {
    console.error("[worker] scheduleAi: insert ai_generation_jobs returned no row");
    return;
  }

  try {
    await enqueueAiExtractRequirementsJob(queueConnection, {
      documentId: params.documentId,
      projectId: params.projectId,
      jobId: row.id,
      correlationId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(aiGenerationJobs)
      .set({
        status: "failed",
        errorMessage: truncateErr(`Failed to queue AI job: ${msg}`),
        updatedAt: new Date(),
      })
      .where(eq(aiGenerationJobs.id, row.id));
    console.error("[worker] scheduleAi: enqueue failed:", err);
  }
}
