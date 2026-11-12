ALTER TABLE "chaos_campaigns" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "scenario_runs" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "trace_events" ADD COLUMN "session_id" text;