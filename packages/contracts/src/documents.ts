import { z } from "zod";

/** Body for finalizing an upload (Route Handler in C2) */
export const documentUploadCompleteBodySchema = z
  .object({
    mimeType: z.string().min(1).max(255).optional(),
    sizeBytes: z.number().int().positive().optional(),
  })
  .strict();

export type DocumentUploadCompleteBody = z.infer<typeof documentUploadCompleteBodySchema>;
