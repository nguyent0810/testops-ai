import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { IngestParseJobPayload } from "@repo/contracts";

const QUEUE_NAME = "ingest";

let sharedConnection: Redis | null = null;
let ingestQueue: Queue | null = null;

function getRedisConnection(): Redis {
  if (!sharedConnection) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL is not set");
    }
    sharedConnection = new Redis(url, {
      maxRetriesPerRequest: null,
    });
  }
  return sharedConnection;
}

export function getIngestQueue(): Queue {
  if (!ingestQueue) {
    ingestQueue = new Queue(QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return ingestQueue;
}

function isDuplicateJobError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /already exists|duplicate job/i.test(msg);
}

/** Enqueue document parse (stub worker for now). Idempotent on same `documentId` via fixed `jobId`. */
export async function enqueueIngestParse(
  payload: IngestParseJobPayload,
): Promise<void> {
  const queue = getIngestQueue();
  try {
    await queue.add("ingest.parse", payload, {
      jobId: `ingest-parse:${payload.documentId}`,
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
