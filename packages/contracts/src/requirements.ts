import { z } from "zod";
import { requirementStatusSchema } from "./enums.js";

/** PATCH body for a single requirement */
export const requirementPatchBodySchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(100_000).optional(),
    status: requirementStatusSchema.optional(),
  })
  .strict();

export type RequirementPatchBody = z.infer<typeof requirementPatchBodySchema>;
