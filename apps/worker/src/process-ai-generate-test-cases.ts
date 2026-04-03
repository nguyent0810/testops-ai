import {
  aiGeneratedTestCasesEnvelopeSchema,
  type AiTestCasesJobPayload,
} from "@repo/contracts";
import type { PoolDb, TestCaseStepRow } from "@repo/db";
import {
  aiGenerationJobs,
  requirements,
  sourceDocuments,
  testCases,
  traceabilityLinks,
} from "@repo/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import OpenAI from "openai";
import {
  parseModelJsonValue,
  unwrapKnownModelEnvelope,
} from "./json-model-text.js";

function truncateErr(message: string, max = 500): string {
  return message.length <= max ? message : message.slice(0, max);
}

const MAX_REQUIREMENTS_CONTEXT_CHARS = 120_000;

function buildDeterministicRequirementsContext(
  rows: { ordinal: number; title: string; description: string }[],
): string {
  const sorted = [...rows].sort((a, b) => a.ordinal - b.ordinal);
  const parts = sorted.map(
    (r) =>
      `### Requirement ordinal ${r.ordinal}\nTitle: ${r.title}\nDescription:\n${r.description.trim() || "(none)"}`,
  );
  let body = parts.join("\n\n---\n\n");
  if (body.length > MAX_REQUIREMENTS_CONTEXT_CHARS) {
    body =
      body.slice(0, MAX_REQUIREMENTS_CONTEXT_CHARS) + "\n\n[truncated]";
  }
  return body;
}

function normalizeSteps(steps: TestCaseStepRow[]): TestCaseStepRow[] {
  return [...steps].sort((a, b) => a.order - b.order);
}

async function callOpenAiGenerateTestCases(
  apiKey: string,
  context: string,
): Promise<string> {
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const openai = new OpenAI({ apiKey });
  const userContent = `You are given requirements below. Each requirement has a stable integer ordinal (use these exact numbers in requirementOrdinals).

Produce manual-style test cases as JSON with this exact top-level shape:
{"test_cases":[{"requirementOrdinals":[1],"title":"string","precondition":"string (optional)","steps":[{"order":1,"action":"string","expected":"string"}],"expectedResult":"string (optional)","priority":"p0"|"p1"|"p2"|"p3"(optional)}]}

Rules:
- Every test case must reference at least one valid requirement ordinal from the list.
- steps must be non-empty; order must be positive integers starting at 1, unique per test case.
- priority defaults to p2 if omitted.
- Output JSON only, no markdown fences.

Requirements:
${context}`;

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You respond with a single JSON object only. Keys must match the user schema exactly (camelCase for nested fields, test_cases at root).",
      },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const text = completion.choices[0]?.message?.content;
  if (!text?.trim()) {
    throw new Error(
      "The AI returned no content. Wait a moment and try again, or shorten the requirements list.",
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
        eq(aiGenerationJobs.jobKind, "test_cases"),
      ),
    );
}

export async function processAiGenerateTestCases(
  db: PoolDb,
  payload: AiTestCasesJobPayload,
): Promise<void> {
  const { documentId, projectId, jobId, requirementsJobId, correlationId } =
    payload;

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
    console.warn(
      `[worker] ai.generate_test_cases missing job row id=${jobId}`,
    );
    return;
  }

  if (existing.jobKind !== "test_cases") {
    await db
      .update(aiGenerationJobs)
      .set({
        status: "failed",
        errorMessage: truncateErr("Job kind mismatch (expected test_cases)"),
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
        ),
      );
    return;
  }

  if (existing.requirementsJobId !== requirementsJobId) {
    await db
      .update(aiGenerationJobs)
      .set({
        status: "failed",
        errorMessage: truncateErr("requirementsJobId mismatch"),
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
      `[worker] ai.generate_test_cases skip completed id=${jobId} correlationId=${correlationId}`,
    );
    return;
  }

  if (existing.status === "failed") {
    return;
  }

  const reqJobRows = await db
    .select()
    .from(aiGenerationJobs)
    .where(eq(aiGenerationJobs.id, requirementsJobId))
    .limit(1);
  const reqJob = reqJobRows[0];
  if (
    !reqJob ||
    reqJob.status !== "completed" ||
    reqJob.jobKind !== "requirements" ||
    reqJob.sourceDocumentId !== documentId ||
    reqJob.projectId !== projectId
  ) {
    await failJob(db, {
      jobId,
      projectId,
      message: "Requirements job missing or not completed for this document",
      fromStatus: "pending",
    });
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
        eq(aiGenerationJobs.jobKind, "test_cases"),
      ),
    )
    .returning({ id: aiGenerationJobs.id });

  if (claimed.length === 0) {
    if (existing.status === "running") {
      console.warn(
        `[worker] ai.generate_test_cases skip already running id=${jobId}`,
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

    const reqRows = await db
      .select({
        id: requirements.id,
        ordinal: requirements.ordinal,
        title: requirements.title,
        description: requirements.description,
      })
      .from(requirements)
      .where(
        and(
          eq(requirements.sourceDocumentId, documentId),
          eq(requirements.aiGenerationJobId, requirementsJobId),
        ),
      )
      .orderBy(asc(requirements.ordinal));

    if (reqRows.length === 0) {
      throw new Error(
        "No requirements were found for this run. Re-run requirement extraction, then generate test cases again.",
      );
    }

    const ordinalToId = new Map<number, string>();
    for (const r of reqRows) {
      ordinalToId.set(r.ordinal, r.id);
    }

    const context = buildDeterministicRequirementsContext(
      reqRows.map((r) => ({
        ordinal: r.ordinal,
        title: r.title,
        description: r.description,
      })),
    );

    await db
      .update(aiGenerationJobs)
      .set({
        progressPhase: "calling_model",
        updatedAt: new Date(),
      })
      .where(eq(aiGenerationJobs.id, jobId));

    const rawText = await callOpenAiGenerateTestCases(apiKey, context);

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
      parsedJson = { test_cases: parsedJson };
    }

    const validated = aiGeneratedTestCasesEnvelopeSchema.safeParse(parsedJson);
    if (!validated.success) {
      const parts = validated.error.issues.slice(0, 2).map((i) => {
        const p = i.path.length ? i.path.join(".") : "root";
        return `${p}: ${i.message}`;
      });
      throw new Error(
        `AI response did not match the expected shape (${parts.join("; ")})`,
      );
    }

    const testCaseValues = validated.data.test_cases.map((tc, i) => {
      const priority = tc.priority ?? "p2";
      const steps = normalizeSteps(tc.steps as TestCaseStepRow[]);
      return {
        projectId,
        sourceDocumentId: documentId,
        requirementsJobId,
        aiGenerationJobId: jobId,
        ordinal: i + 1,
        title: tc.title,
        precondition: tc.precondition ?? "",
        steps,
        expectedResult: tc.expectedResult ?? "",
        priority,
        status: "draft" as const,
      };
    });

    const linkRows: { requirementId: string; testCaseId: string }[] = [];

    await db.transaction(async (tx) => {
      await tx
        .delete(testCases)
        .where(eq(testCases.sourceDocumentId, documentId));

      const inserted = await tx
        .insert(testCases)
        .values(testCaseValues)
        .returning({ id: testCases.id });

      if (inserted.length !== validated.data.test_cases.length) {
        throw new Error(
          "Could not save all generated test cases. Try again; if this persists, contact support.",
        );
      }

      for (let i = 0; i < validated.data.test_cases.length; i++) {
        const tc = validated.data.test_cases[i]!;
        const testCaseId = inserted[i]!.id;
        const ordinals = [...new Set(tc.requirementOrdinals)];
        for (const ord of ordinals) {
          const requirementId = ordinalToId.get(ord);
          if (!requirementId) {
            throw new Error(
              `The AI referenced requirement #${ord}, which is not in the current list. Re-run requirement extraction if you changed the document.`,
            );
          }
          linkRows.push({ requirementId, testCaseId });
        }
      }

      if (linkRows.length > 0) {
        await tx.insert(traceabilityLinks).values(linkRows);
      }

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
            eq(aiGenerationJobs.jobKind, "test_cases"),
          ),
        );
    });

    console.log(
      `[worker] ai.generate_test_cases ok jobId=${jobId} testCases=${testCaseValues.length} links=${linkRows.length} correlationId=${correlationId}`,
    );
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
          eq(aiGenerationJobs.jobKind, "test_cases"),
        ),
      );
    console.error(
      `[worker] ai.generate_test_cases failed jobId=${jobId} correlationId=${correlationId}`,
      err,
    );
  }
}
