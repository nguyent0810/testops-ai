CREATE TABLE "parsed_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_document_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"heading" text,
	"content" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parsed_sections" ADD CONSTRAINT "parsed_sections_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parsed_sections_source_document_id_ordinal_idx" ON "parsed_sections" USING btree ("source_document_id","ordinal");