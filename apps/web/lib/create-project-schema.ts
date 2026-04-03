import { z } from "zod";

function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const createProjectBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "name required")
    .max(200, "name too long"),
  slug: z
    .string()
    .trim()
    .min(1, "slug required")
    .max(64, "slug too long")
    .transform(normalizeSlug)
    .refine((s) => s.length > 0, { message: "slug must contain letters or numbers" }),
});

export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;
