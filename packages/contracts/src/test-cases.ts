import { z } from "zod";
import { testCasePrioritySchema, testCaseStatusSchema } from "./enums.js";

export const testCaseStepSchema = z.object({
  order: z.number().int().positive(),
  action: z.string().min(1).max(10_000),
  expected: z.string().min(1).max(10_000),
});

/** PATCH body for a single test case */
export const testCasePatchBodySchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    precondition: z.string().max(20_000).optional(),
    steps: z.array(testCaseStepSchema).min(1).optional(),
    expectedResult: z.string().max(20_000).optional(),
    priority: testCasePrioritySchema.optional(),
    status: testCaseStatusSchema.optional(),
  })
  .strict();

export type TestCaseStep = z.infer<typeof testCaseStepSchema>;
export type TestCasePatchBody = z.infer<typeof testCasePatchBodySchema>;
