import { z } from "zod";

/**
 * Expected JSON shape from the model (validated after parse).
 * Keep in sync with worker prompts.
 */
export const aiExtractedRequirementItemSchema = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().max(100_000).optional(),
  })
  .strict();

export const aiExtractedRequirementsEnvelopeSchema = z
  .object({
    requirements: z.array(aiExtractedRequirementItemSchema).min(1).max(200),
  })
  .strict();

export type AiExtractedRequirementItem = z.infer<
  typeof aiExtractedRequirementItemSchema
>;
export type AiExtractedRequirementsEnvelope = z.infer<
  typeof aiExtractedRequirementsEnvelopeSchema
>;
