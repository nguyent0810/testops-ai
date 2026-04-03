import {
  type AnyPgColumn,
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  primaryKey,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Connectivity / migration stub only. */
export const dbPing = pgTable("db_ping", {
  id: serial("id").primaryKey(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("projects_organization_id_slug_unique").on(t.organizationId, t.slug)],
);

export const projectMemberships = pgTable(
  "project_memberships",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Coarse role: `admin` | `member` (enforced in app when inserting). */
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);

export const sourceDocumentStatusEnum = pgEnum("source_document_status", [
  "uploading",
  "uploaded",
  "queued",
  "parsing",
  "parsed",
  "failed",
]);

export const sourceDocuments = pgTable(
  "source_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    uploadedByUserId: text("uploaded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().default(""),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    status: sourceDocumentStatusEnum("status").notNull().default("uploading"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("source_documents_project_id_status_idx").on(t.projectId, t.status)],
);

export const parsedSections = pgTable(
  "parsed_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => sourceDocuments.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    heading: text("heading"),
    content: text("content").notNull(),
  },
  (t) => [
    index("parsed_sections_source_document_id_ordinal_idx").on(
      t.sourceDocumentId,
      t.ordinal,
    ),
  ],
);

export const aiGenerationJobStatusEnum = pgEnum("ai_generation_job_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const aiJobKindEnum = pgEnum("ai_job_kind", ["requirements", "test_cases"]);

export const requirementStatusEnum = pgEnum("requirement_status", [
  "active",
  "deprecated",
]);

export const testCasePriorityEnum = pgEnum("test_case_priority", [
  "p0",
  "p1",
  "p2",
  "p3",
]);

export const testCaseStatusEnum = pgEnum("test_case_status", [
  "draft",
  "in_review",
  "approved",
  "rejected",
]);

export const aiGenerationJobs = pgTable(
  "ai_generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => sourceDocuments.id, { onDelete: "cascade" }),
    status: aiGenerationJobStatusEnum("status").notNull().default("pending"),
    jobKind: aiJobKindEnum("job_kind").notNull().default("requirements"),
    /** For `test_cases` jobs: the completed `requirements` job whose rows are the input set. */
    requirementsJobId: uuid("requirements_job_id").references(
      (): AnyPgColumn => aiGenerationJobs.id,
      { onDelete: "set null" },
    ),
    /** Coarse worker step label for alpha (e.g. loading_context, calling_model, persisting). */
    progressPhase: text("progress_phase"),
    errorMessage: text("error_message"),
    correlationId: uuid("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("ai_generation_jobs_project_id_idx").on(t.projectId),
    index("ai_generation_jobs_source_document_id_idx").on(t.sourceDocumentId),
    index("ai_generation_jobs_status_idx").on(t.status),
    index("ai_generation_jobs_job_kind_idx").on(t.jobKind),
  ],
);

export const requirements = pgTable(
  "requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => sourceDocuments.id, { onDelete: "cascade" }),
    aiGenerationJobId: uuid("ai_generation_job_id")
      .notNull()
      .references(() => aiGenerationJobs.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: requirementStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("requirements_project_id_idx").on(t.projectId),
    index("requirements_source_document_id_idx").on(t.sourceDocumentId),
    index("requirements_ai_generation_job_id_idx").on(t.aiGenerationJobId),
  ],
);

export type TestCaseStepRow = {
  order: number;
  action: string;
  expected: string;
};

export const testCases = pgTable(
  "test_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => sourceDocuments.id, { onDelete: "cascade" }),
    /** Requirement-extraction AI job that owned the input requirements set. */
    requirementsJobId: uuid("requirements_job_id")
      .notNull()
      .references(() => aiGenerationJobs.id, { onDelete: "cascade" }),
    /** Test-case generation AI job that produced this row. */
    aiGenerationJobId: uuid("ai_generation_job_id")
      .notNull()
      .references(() => aiGenerationJobs.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    title: text("title").notNull(),
    precondition: text("precondition").notNull().default(""),
    steps: jsonb("steps").$type<TestCaseStepRow[]>().notNull(),
    expectedResult: text("expected_result").notNull().default(""),
    priority: testCasePriorityEnum("priority").notNull().default("p2"),
    status: testCaseStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("test_cases_project_id_idx").on(t.projectId),
    index("test_cases_source_document_id_idx").on(t.sourceDocumentId),
    index("test_cases_requirements_job_id_idx").on(t.requirementsJobId),
    index("test_cases_ai_generation_job_id_idx").on(t.aiGenerationJobId),
  ],
);

export const traceabilityLinks = pgTable(
  "traceability_links",
  {
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => requirements.id, { onDelete: "cascade" }),
    testCaseId: uuid("test_case_id")
      .notNull()
      .references(() => testCases.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.requirementId, t.testCaseId] }),
    index("traceability_links_test_case_id_idx").on(t.testCaseId),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId] })],
);
