import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { testCasePatchBodySchema } from "@repo/contracts";
import { testCases } from "@repo/db";
import { getDb } from "@/lib/db";
import { getProjectIfMember } from "@/lib/project-access";
import { zodErrorToApiMessage } from "@/lib/upload-url-body-schema";

export const dynamic = "force-dynamic";

type RouteCtx = {
  params: Promise<{ projectId: string; testCaseId: string }>;
};

export async function PATCH(
  req: NextRequest,
  context: RouteCtx,
): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, testCaseId } = await context.params;
  const db = getDb();

  const project = await getProjectIfMember(db, { userId, projectId });
  if (!project) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = testCasePatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorToApiMessage(parsed.error) },
      { status: 400 },
    );
  }

  const p = parsed.data;
  const hasPatch =
    p.title !== undefined ||
    p.precondition !== undefined ||
    p.steps !== undefined ||
    p.expectedResult !== undefined ||
    p.priority !== undefined ||
    p.status !== undefined;

  if (!hasPatch) {
    return NextResponse.json(
      { error: "At least one field is required" },
      { status: 400 },
    );
  }

  const existing = await db
    .select({ id: testCases.id })
    .from(testCases)
    .where(
      and(eq(testCases.id, testCaseId), eq(testCases.projectId, projectId)),
    )
    .limit(1);

  if (!existing[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const now = new Date();
  await db
    .update(testCases)
    .set({
      ...(p.title !== undefined ? { title: p.title } : {}),
      ...(p.precondition !== undefined ? { precondition: p.precondition } : {}),
      ...(p.steps !== undefined ? { steps: p.steps } : {}),
      ...(p.expectedResult !== undefined
        ? { expectedResult: p.expectedResult }
        : {}),
      ...(p.priority !== undefined ? { priority: p.priority } : {}),
      ...(p.status !== undefined ? { status: p.status } : {}),
      updatedAt: now,
    })
    .where(eq(testCases.id, testCaseId));

  const [row] = await db
    .select({
      id: testCases.id,
      projectId: testCases.projectId,
      sourceDocumentId: testCases.sourceDocumentId,
      requirementsJobId: testCases.requirementsJobId,
      aiGenerationJobId: testCases.aiGenerationJobId,
      ordinal: testCases.ordinal,
      title: testCases.title,
      precondition: testCases.precondition,
      steps: testCases.steps,
      expectedResult: testCases.expectedResult,
      priority: testCases.priority,
      status: testCases.status,
      createdAt: testCases.createdAt,
      updatedAt: testCases.updatedAt,
    })
    .from(testCases)
    .where(eq(testCases.id, testCaseId))
    .limit(1);

  if (!row) {
    return NextResponse.json(
      { error: "Save succeeded but the test case could not be reloaded." },
      { status: 500 },
    );
  }

  return NextResponse.json({ testCase: row });
}
