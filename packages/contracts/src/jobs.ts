import { z } from "zod";

/** BullMQ `job.data` after `POST .../documents/:id/complete` */
export const ingestParseJobPayloadSchema = z.object({
  documentId: z.string().uuid(),
  projectId: z.string().uuid(),
  correlationId: z.string().uuid(),
});

/** BullMQ `job.data` for requirement + test generation (after parse) */
export const aiPipelineJobPayloadSchema = z.object({
  documentId: z.string().uuid(),
  projectId: z.string().uuid(),
  jobId: z.string().uuid(),
  correlationId: z.string().uuid(),
});

export type IngestParseJobPayload = z.infer<typeof ingestParseJobPayloadSchema>;
export type AiPipelineJobPayload = z.infer<typeof aiPipelineJobPayloadSchema>;
