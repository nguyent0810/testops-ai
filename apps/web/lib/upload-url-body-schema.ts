import { type ZodError, z } from "zod";

function basenameOnly(filename: string): string {
  const base = filename.trim().split(/[/\\]/).pop() ?? filename.trim();
  return base.slice(0, 512);
}

export const uploadUrlBodySchema = z.object({
  filename: z
    .string()
    .min(1, "filename required")
    .max(512)
    .transform(basenameOnly)
    .refine((s) => s.length > 0, { message: "invalid filename" }),
  mimeType: z.string().min(1).max(255).optional(),
});

export type UploadUrlBody = z.infer<typeof uploadUrlBodySchema>;

/** Single-line message for 400 responses (alpha UX). */
export function zodErrorToApiMessage(err: ZodError): string {
  const first = err.issues[0];
  if (!first) return "Invalid request";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}
