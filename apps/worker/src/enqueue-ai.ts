import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { AiPipelineJobPayload, AiTestCasesJobPayload } from "@repo/contracts";

const QUEUE_NAME = "ai";

let aiQueue: Queue | null = null;

function getAiQueue(connection: Redis): Queue {
  if (!aiQueue) {
    aiQueue = new Queue(QUEUE_NAME, { connection });
  }
  return aiQueue;
}

function isDuplicateJobError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /already exists|duplicate job/i.test(msg);
}

export async function enqueueAiExtractRequirementsJob(
  connection: Redis,
  payload: AiPipelineJobPayload,
): Promise<void> {
  const queue = getAiQueue(connection);
  try {
    await queue.add("ai.extract_requirements", payload, {
      jobId: `ai-requirements:${payload.jobId}`,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    });
  } catch (err) {
    if (isDuplicateJobError(err)) {
      return;
    }
    throw err;
  }
}

export async function enqueueAiGenerateTestCasesJob(
  connection: Redis,
  payload: AiTestCasesJobPayload,
): Promise<void> {
  const queue = getAiQueue(connection);
  try {
    await queue.add("ai.generate_test_cases", payload, {
      jobId: `ai-test-cases:${payload.jobId}`,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    });
  } catch (err) {
    if (isDuplicateJobError(err)) {
      return;
    }
    throw err;
  }
}
