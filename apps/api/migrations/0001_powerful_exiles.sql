CREATE TABLE "chaos_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"seed" integer NOT NULL,
	"status" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chaos_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"schedule" jsonb NOT NULL,
	"failed_invariants" jsonb NOT NULL,
	"state_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
