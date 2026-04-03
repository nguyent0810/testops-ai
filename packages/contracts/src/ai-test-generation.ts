import { z } from "zod";
import { testCasePrioritySchema } from "./enums.js";
import { testCaseStepSchema } from "./test-cases.js";

/** BullMQ `job.data` for test case generation (after requirements job completes). */
export const aiTestCasesJobPayloadSchema = z.object({
  documentId: z.string().uuid(),
  projectId: z.string().uuid(),
  jobId: z.string().uuid(),
  requirementsJobId: z.string().uuid(),
  correlationId: z.string().uuid(),
});

export const aiGeneratedTestCaseItemSchema = z
  .object({
    requirementOrdinals: z.array(z.number().int().positive()).min(1).max(50),
    title: z.string().min(1).max(500),
    precondition: z.string().max(20_000).optional(),
    steps: z.array(testCaseStepSchema).min(1).max(50),
    expectedResult: z.string().max(20_000).optional(),
    priority: testCasePrioritySchema.optional(),
  })
  .strict();

export const aiGeneratedTestCasesEnvelopeSchema = z
  .object({
    test_cases: z.array(aiGeneratedTestCaseItemSchema).min(1).max(200),
  })
  .strict();

export type AiTestCasesJobPayload = z.infer<typeof aiTestCasesJobPayloadSchema>;
export type AiGeneratedTestCaseItem = z.infer<typeof aiGeneratedTestCaseItemSchema>;
