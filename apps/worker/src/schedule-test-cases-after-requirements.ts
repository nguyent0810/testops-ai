import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import type { PoolDb } from "@repo/db";
import { aiGenerationJobs } from "@repo/db";
import { eq } from "drizzle-orm";
import { enqueueAiGenerateTestCasesJob } from "./enqueue-ai.js";

function truncateErr(message: string, max = 500): string {
  return message.length <= max ? message : message.slice(0, max);
}

/**
 * Insert `ai_generation_jobs` (`job_kind` = test_cases) and enqueue `ai.generate_test_cases`.
 * On enqueue failure, marks the job row `failed`.
 */
export async function scheduleTestCaseGenerationAfterRequirements(
  db: PoolDb,
  queueConnection: Redis,
  params: {
    documentId: string;
    projectId: string;
    requirementsJobId: string;
  },
): Promise<void> {
  const correlationId = randomUUID();
  const inserted = await db
    .insert(aiGenerationJobs)
    .values({
      projectId: params.projectId,
      sourceDocumentId: params.documentId,
      status: "pending",
      jobKind: "test_cases",
      requirementsJobId: params.requirementsJobId,
      correlationId,
    })
    .returning({ id: aiGenerationJobs.id });

  const row = inserted[0];
  if (!row) {
    console.error(
      "[worker] scheduleTestCases: insert ai_generation_jobs returned no row",
    );
    return;
  }

  try {
    await enqueueAiGenerateTestCasesJob(queueConnection, {
      documentId: params.documentId,
      projectId: params.projectId,
      jobId: row.id,
      requirementsJobId: params.requirementsJobId,
      correlationId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(aiGenerationJobs)
      .set({
        status: "failed",
        errorMessage: truncateErr(`Failed to queue test-case job: ${msg}`),
        updatedAt: new Date(),
      })
      .where(eq(aiGenerationJobs.id, row.id));
    console.error("[worker] scheduleTestCases: enqueue failed:", err);
  }
}
