import { z } from "zod";

export const requirementStatusValues = ["active", "deprecated"] as const;
export const requirementStatusSchema = z.enum(requirementStatusValues);
export type RequirementStatus = z.infer<typeof requirementStatusSchema>;

export const testCasePriorityValues = ["p0", "p1", "p2", "p3"] as const;
export const testCasePrioritySchema = z.enum(testCasePriorityValues);
export type TestCasePriority = z.infer<typeof testCasePrioritySchema>;

export const testCaseStatusValues = ["draft", "in_review", "approved", "rejected"] as const;
export const testCaseStatusSchema = z.enum(testCaseStatusValues);
export type TestCaseStatus = z.infer<typeof testCaseStatusSchema>;

export const bullmqJobNameValues = ["ingest.parse", "ai.pipeline"] as const;
export const bullmqJobNameSchema = z.enum(bullmqJobNameValues);
export type BullmqJobName = z.infer<typeof bullmqJobNameSchema>;
