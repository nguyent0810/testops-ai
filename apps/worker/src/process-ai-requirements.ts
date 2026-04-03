import {
  aiExtractedRequirementsEnvelopeSchema,
  type AiPipelineJobPayload,
} from "@repo/contracts";
import type { PoolDb } from "@repo/db";
import {
  aiGenerationJobs,
  parsedSections,
  requirements,
  sourceDocuments,
} from "@repo/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Redis } from "ioredis";
import OpenAI from "openai";
import {
  parseModelJsonValue,
  unwrapKnownModelEnvelope,
} from "./json-model-text.js";
import { scheduleTestCaseGenerationAfterRequirements } from "./schedule-test-cases-after-requirements.js";

function truncateErr(message: string, max = 500): string {
  return message.length <= max ? message : message.slice(0, max);
}

const MAX_CONTEXT_CHARS = 120_000;

function buildDeterministicContext(
  sections: { ordinal: number; heading: string | null; content: string }[],
): string {
  const sorted = [...sections].sort((a, b) => a.ordinal - b.ordinal);
  const parts = sorted.map((s) => {
    const h = s.heading?.trim() ? `# ${s.heading.trim()}\n` : "";
    return `${h}${s.content}`;
  });
  let body = parts.join("\n\n---\n\n");
  if (body.length > MAX_CONTEXT_CHARS) {
    body = body.slice(0, MAX_CONTEXT_CHARS) + "\n\n[truncated]";
  }
  return body;
}

async function callOpenAiExtractRequirements(
  apiKey: string,
  context: string,
): Promise<string> {
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const openai = new OpenAI({ apiKey });
  const userContent = `Document sections (separated by ---) are below. Extract functional requirements as JSON with this exact shape: {"requirements":[{"title":"string","description":"string"}]}. Use short titles. Put acceptance detail in description when present. Output JSON only, no markdown fences.\n\n${context}`;

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You respond with a single JSON object only. Each item in requirements must have title (required) and description (string, may be empty).",
      },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const text = completion.choices[0]?.message?.content;
  if (!text?.trim()) {
    throw new Error(
      "The AI returned no content. Wait a moment and try again, or shorten the document.",
    );
  }
  return text;
}

async function failJob(
  db: PoolDb,
  params: {
    jobId: string;
    projectId: string;
    message: string;
    fromStatus: "pending" | "running";
  },
): Promise<void> {
  await db
    .update(aiGenerationJobs)
    .set({
      status: "failed",
      errorMessage: truncateErr(params.message),
      progressPhase: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiGenerationJobs.id, params.jobId),
        eq(aiGenerationJobs.projectId, params.projectId),
        eq(aiGenerationJobs.status, params.fromStatus),
        eq(aiGenerationJobs.jobKind, "requirements"),
      ),
    );
}

export async function processAiExtractRequirements(
  db: PoolDb,
  payload: AiPipelineJobPayload,
  options?: { queueConnection?: Redis },
): Promise<void> {
  const { documentId, projectId, jobId, correlationId } = payload;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    await failJob(db, {
      jobId,
      projectId,
      message: "OPENAI_API_KEY is not set",
      fromStatus: "pending",
    });
    return;
  }

  const jobRows = await db
    .select()
    .from(aiGenerationJobs)
    .where(
      and(
        eq(aiGenerationJobs.id, jobId),
        eq(aiGenerationJobs.projectId, projectId),
      ),
    )
    .limit(1);

  const existing = jobRows[0];
  if (!existing) {
    console.warn(`[worker] ai.extract_requirements missing job row id=${jobId}`);
    return;
  }

  if (existing.sourceDocumentId !== documentId) {
    await db
      .update(aiGenerationJobs)
      .set({
        status: "failed",
        errorMessage: truncateErr("Job payload document mismatch"),
        progressPhase: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiGenerationJobs.id, jobId),
          eq(aiGenerationJobs.projectId, projectId),
          inArray(aiGenerationJobs.status, ["pending", "running"]),
          eq(aiGenerationJobs.jobKind, "requirements"),
        ),
      );
    return;
  }

  if (existing.jobKind !== "requirements") {
    await db
      .update(aiGenerationJobs)
      .set({
        status: "failed",
        errorMessage: truncateErr("Job kind mismatch (expected requirements)"),
        progressPhase: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiGenerationJobs.id, jobId),
          eq(aiGenerationJobs.projectId, projectId),
          inArray(aiGenerationJobs.status, ["pending", "running"]),
        ),
      );
    return;
  }

  if (existing.status === "completed") {
    console.log(
      `[worker] ai.extract_requirements skip completed id=${jobId} correlationId=${correlationId}`,
    );
    return;
  }

  if (existing.status === "failed") {
    return;
  }

  const claimed = await db
    .update(aiGenerationJobs)
    .set({
      status: "running",
      progressPhase: "loading_context",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiGenerationJobs.id, jobId),
        eq(aiGenerationJobs.projectId, projectId),
        eq(aiGenerationJobs.status, "pending"),
        eq(aiGenerationJobs.jobKind, "requirements"),
      ),
    )
    .returning({ id: aiGenerationJobs.id });

  if (claimed.length === 0) {
    if (existing.status === "running") {
      console.warn(
        `[worker] ai.extract_requirements skip already running id=${jobId}`,
      );
    }
    return;
  }

  try {
    const docRows = await db
      .select({ id: sourceDocuments.id })
      .from(sourceDocuments)
      .where(
        and(
          eq(sourceDocuments.id, documentId),
          eq(sourceDocuments.projectId, projectId),
        ),
      )
      .limit(1);

    if (!docRows[0]) {
      throw new Error(
        "This document is no longer available. Refresh the page or choose another file.",
      );
    }

    const sections = await db
      .select({
        ordinal: parsedSections.ordinal,
        heading: parsedSections.heading,
        content: parsedSections.content,
      })
      .from(parsedSections)
      .where(eq(parsedSections.sourceDocumentId, documentId))
      .orderBy(asc(parsedSections.ordinal));

    if (sections.length === 0) {
      throw new Error(
        "Document text is not ready yet. Wait for the file to finish processing, then try again.",
      );
    }

    const context = buildDeterministicContext(sections);

    await db
      .update(aiGenerationJobs)
      .set({
        progressPhase: "calling_model",
        updatedAt: new Date(),
      })
      .where(eq(aiGenerationJobs.id, jobId));

    const rawText = await callOpenAiExtractRequirements(apiKey, context);

    await db
      .update(aiGenerationJobs)
      .set({
        progressPhase: "persisting",
        updatedAt: new Date(),
      })
      .where(eq(aiGenerationJobs.id, jobId));

    let parsedJson: unknown;
    try {
      parsedJson = parseModelJsonValue(rawText);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        msg.toLowerCase().includes("json") || msg.includes("empty")
          ? msg
          : `The AI returned text we could not parse as JSON: ${msg}`,
      );
    }

    parsedJson = unwrapKnownModelEnvelope(parsedJson);

    if (Array.isArray(parsedJson)) {
      parsedJson = { requirements: parsedJson };
    }

    const validated = aiExtractedRequirementsEnvelopeSchema.safeParse(parsedJson);
    if (!validated.success) {
      const parts = validated.error.issues.slice(0, 2).map((i) => {
        const p = i.path.length ? i.path.join(".") : "root";
        return `${p}: ${i.message}`;
      });
      throw new Error(
        `AI response did not match the expected shape (${parts.join("; ")})`,
      );
    }

    const rows = validated.data.requirements.map((r, i) => ({
      projectId,
      sourceDocumentId: documentId,
      aiGenerationJobId: jobId,
      ordinal: i + 1,
      title: r.title,
      description: r.description ?? "",
      status: "active" as const,
    }));

    await db.transaction(async (tx) => {
      await tx
        .delete(requirements)
        .where(eq(requirements.sourceDocumentId, documentId));
      await tx.insert(requirements).values(rows);
      await tx
        .update(aiGenerationJobs)
        .set({
          status: "completed",
          progressPhase: null,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiGenerationJobs.id, jobId),
            eq(aiGenerationJobs.status, "running"),
            eq(aiGenerationJobs.jobKind, "requirements"),
          ),
        );
    });

    console.log(
      `[worker] ai.extract_requirements ok jobId=${jobId} requirements=${rows.length} correlationId=${correlationId}`,
    );

    if (options?.queueConnection) {
      await scheduleTestCaseGenerationAfterRequirements(
        db,
        options.queueConnection,
        { documentId, projectId, requirementsJobId: jobId },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(aiGenerationJobs)
      .set({
        status: "failed",
        errorMessage: truncateErr(message),
        progressPhase: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiGenerationJobs.id, jobId),
          eq(aiGenerationJobs.projectId, projectId),
          eq(aiGenerationJobs.status, "running"),
          eq(aiGenerationJobs.jobKind, "requirements"),
        ),
      );
    console.error(
      `[worker] ai.extract_requirements failed jobId=${jobId} correlationId=${correlationId}`,
      err,
    );
  }
}
