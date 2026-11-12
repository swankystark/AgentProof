CREATE TABLE "testing_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"connected_system" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"current_step" text DEFAULT 'connect_system' NOT NULL,
	"payment_order_id" text,
	"campaign_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
