CREATE TYPE "public"."ai_generation_job_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."requirement_status" AS ENUM('active', 'deprecated');--> statement-breakpoint
CREATE TABLE "ai_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"status" "ai_generation_job_status" DEFAULT 'pending' NOT NULL,
	"progress_phase" text,
	"error_message" text,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"ai_generation_job_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "requirement_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_ai_generation_job_id_ai_generation_jobs_id_fk" FOREIGN KEY ("ai_generation_job_id") REFERENCES "public"."ai_generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generation_jobs_project_id_idx" ON "ai_generation_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ai_generation_jobs_source_document_id_idx" ON "ai_generation_jobs" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "ai_generation_jobs_status_idx" ON "ai_generation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requirements_project_id_idx" ON "requirements" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "requirements_source_document_id_idx" ON "requirements" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "requirements_ai_generation_job_id_idx" ON "requirements" USING btree ("ai_generation_job_id");