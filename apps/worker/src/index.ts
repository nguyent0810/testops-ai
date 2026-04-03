import "dotenv/config";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import {
  aiPipelineJobPayloadSchema,
  aiTestCasesJobPayloadSchema,
  ingestParseJobPayloadSchema,
} from "@repo/contracts";
import { createPoolDb } from "@repo/db";
import { processIngestParse } from "./ingest-parse.js";
import { processAiExtractRequirements } from "./process-ai-requirements.js";
import { processAiGenerateTestCases } from "./process-ai-generate-test-cases.js";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error("[worker] REDIS_URL is required");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[worker] DATABASE_URL is required");
  process.exit(1);
}

const db = createPoolDb(databaseUrl);

function makeRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
  });
}

const ingestConnection = makeRedis(redisUrl);
const aiWorkerConnection = makeRedis(redisUrl);
const queueConnection = makeRedis(redisUrl);

const ingestWorker = new Worker(
  "ingest",
  async (job) => {
    if (job.name !== "ingest.parse") {
      return;
    }
    const parsed = ingestParseJobPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      throw new Error(`invalid ingest.parse payload: ${parsed.error.message}`);
    }
    await processIngestParse(db, parsed.data, { queueConnection });
  },
  { connection: ingestConnection },
);

const aiWorker = new Worker(
  "ai",
  async (job) => {
    if (job.name === "ai.extract_requirements") {
      const parsed = aiPipelineJobPayloadSchema.safeParse(job.data);
      if (!parsed.success) {
        throw new Error(
          `invalid ai.extract_requirements payload: ${parsed.error.message}`,
        );
      }
      await processAiExtractRequirements(db, parsed.data, { queueConnection });
      return;
    }

    if (job.name === "ai.generate_test_cases") {
      const parsed = aiTestCasesJobPayloadSchema.safeParse(job.data);
      if (!parsed.success) {
        throw new Error(
          `invalid ai.generate_test_cases payload: ${parsed.error.message}`,
        );
      }
      await processAiGenerateTestCases(db, parsed.data);
      return;
    }
  },
  { connection: aiWorkerConnection },
);

function wireWorkerLogging(name: string, worker: Worker): void {
  worker.on("failed", (job, err) => {
    console.error(`[worker:${name}] job ${job?.id} failed`, err);
  });
  worker.on("error", (err) => {
    console.error(`[worker:${name}] worker error`, err);
  });
}

wireWorkerLogging("ingest", ingestWorker);
wireWorkerLogging("ai", aiWorker);

console.log(
  '[worker] listening: ingest (ingest.parse), ai (ai.extract_requirements, ai.generate_test_cases)',
);

async function shutdown(): Promise<void> {
  await ingestWorker.close();
  await aiWorker.close();
  await ingestConnection.quit();
  await aiWorkerConnection.quit();
  await queueConnection.quit();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
