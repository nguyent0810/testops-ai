CREATE TYPE "public"."ai_job_kind" AS ENUM('requirements', 'test_cases');--> statement-breakpoint
CREATE TYPE "public"."test_case_priority" AS ENUM('p0', 'p1', 'p2', 'p3');--> statement-breakpoint
CREATE TYPE "public"."test_case_status" AS ENUM('draft', 'in_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"requirements_job_id" uuid NOT NULL,
	"ai_generation_job_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"title" text NOT NULL,
	"precondition" text DEFAULT '' NOT NULL,
	"steps" jsonb NOT NULL,
	"expected_result" text DEFAULT '' NOT NULL,
	"priority" "test_case_priority" DEFAULT 'p2' NOT NULL,
	"status" "test_case_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traceability_links" (
	"requirement_id" uuid NOT NULL,
	"test_case_id" uuid NOT NULL,
	CONSTRAINT "traceability_links_requirement_id_test_case_id_pk" PRIMARY KEY("requirement_id","test_case_id")
);
--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD COLUMN "job_kind" "ai_job_kind" DEFAULT 'requirements' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD COLUMN "requirements_job_id" uuid;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_requirements_job_id_ai_generation_jobs_id_fk" FOREIGN KEY ("requirements_job_id") REFERENCES "public"."ai_generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_ai_generation_job_id_ai_generation_jobs_id_fk" FOREIGN KEY ("ai_generation_job_id") REFERENCES "public"."ai_generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traceability_links" ADD CONSTRAINT "traceability_links_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traceability_links" ADD CONSTRAINT "traceability_links_test_case_id_test_cases_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "public"."test_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "test_cases_project_id_idx" ON "test_cases" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "test_cases_source_document_id_idx" ON "test_cases" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "test_cases_requirements_job_id_idx" ON "test_cases" USING btree ("requirements_job_id");--> statement-breakpoint
CREATE INDEX "test_cases_ai_generation_job_id_idx" ON "test_cases" USING btree ("ai_generation_job_id");--> statement-breakpoint
CREATE INDEX "traceability_links_test_case_id_idx" ON "traceability_links" USING btree ("test_case_id");--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_requirements_job_id_ai_generation_jobs_id_fk" FOREIGN KEY ("requirements_job_id") REFERENCES "public"."ai_generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generation_jobs_job_kind_idx" ON "ai_generation_jobs" USING btree ("job_kind");