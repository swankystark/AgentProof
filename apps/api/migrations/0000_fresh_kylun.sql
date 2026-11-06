CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_run_id" text NOT NULL,
	"persona" text NOT NULL,
	"decision" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"cart_id" text,
	"approved_maximum" numeric(10, 2) NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" text PRIMARY KEY NOT NULL,
	"cart_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_run_id" text NOT NULL,
	"summary" text NOT NULL,
	"remediation" text NOT NULL,
	"ai_generated" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invariant_results" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_run_id" text NOT NULL,
	"invariant_id" text NOT NULL,
	"passed" boolean NOT NULL,
	"severity" text NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"intent_id" text NOT NULL,
	"cart_id" text NOT NULL,
	"scenario_run_id" text,
	"status" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"fulfillment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sandbox" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paypal_authorizations" (
	"id" text PRIMARY KEY NOT NULL,
	"paypal_order_id" text NOT NULL,
	"authorization_id" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "paypal_authorizations_authorization_id_unique" UNIQUE("authorization_id")
);
--> statement-breakpoint
CREATE TABLE "paypal_captures" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_order_id" text NOT NULL,
	"capture_id" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "paypal_captures_capture_id_unique" UNIQUE("capture_id")
);
--> statement-breakpoint
CREATE TABLE "paypal_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_order_id" text NOT NULL,
	"paypal_order_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paypal_orders_paypal_order_id_unique" UNIQUE("paypal_order_id")
);
--> statement-breakpoint
CREATE TABLE "paypal_refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"capture_id" text NOT NULL,
	"refund_id" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "paypal_refunds_refund_id_unique" UNIQUE("refund_id")
);
--> statement-breakpoint
CREATE TABLE "paypal_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"inventory" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"definition" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"status" text NOT NULL,
	"mode" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trace_events" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_run_id" text,
	"source" text NOT NULL,
	"event_type" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_webhook_events_event_id_unique" ON "paypal_webhook_events" USING btree ("id");