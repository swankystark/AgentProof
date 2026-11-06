import { z } from "zod"

export const scenarioKinds = [
  "ambiguous-retry",
  "price-drift",
  "webhook-replay",
  "prompt-injection",
  "refund-chaos",
] as const

export const severityValues = ["critical", "high", "medium", "low"] as const

export const redTeamScenarioSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(scenarioKinds),
  title: z.string().min(1),
  objective: z.string().min(1),
  buyerIntent: z.string().min(1),
  buyerPersona: z.string().min(1),
  constraints: z.array(z.string()),
  injectedFaults: z.array(z.string()),
  merchantConditions: z.array(z.string()),
  expectedInvariants: z.array(z.string()),
  severity: z.enum(severityValues),
})

export type RedTeamScenario = z.infer<typeof redTeamScenarioSchema>

export const readinessSchema = z.object({
  score: z.number().min(0).max(100),
  critical: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  passes: z.number().int().nonnegative(),
  runs: z.number().int().nonnegative(),
})

export type Readiness = z.infer<typeof readinessSchema>

export const chaosCampaignSchema = z.object({ name: z.string().trim().min(3).max(100), seed: z.number().int().min(0).max(2_147_483_647), maxExecutions: z.number().int().min(1).max(1000), maxConcurrentActors: z.number().int().min(1).max(3), maximumAmount: z.number().positive().max(10000), duplicateFulfillmentUnsafe: z.boolean() })
export type ChaosCampaignInput = z.infer<typeof chaosCampaignSchema>
export const chaosScheduleStepSchema = z.object({ actor: z.string().min(1).max(80), action: z.enum(["create_order", "approve", "capture_send", "capture_succeed", "drop_response", "retry_capture", "webhook_deliver", "fulfill", "refund", "reconcile"]), fault: z.enum(["response_lost", "webhook_delayed", "duplicate_webhook", "worker_crash_after_effect", "duplicate_fulfillment"]).optional() })
export const chaosReplaySchema = z.object({ schedule: z.array(chaosScheduleStepSchema).min(1).max(200), expectedFailures: z.array(z.string().regex(/^I(?:[1-9]|1[0-2])$/)).default([]), maximum: z.number().positive().max(10000).default(100), duplicateFulfillmentUnsafe: z.boolean().default(false) })

export const scenarioRunRequestSchema = z.object({
  scenarioId: z.string().min(1),
  mode: z.enum(["analysis", "sandbox"]).default("analysis"),
})

export const createOrderRequestSchema = z.object({
  intentId: z.string().uuid(),
  amount: z.number().positive().max(10000),
  currency: z.literal("USD").default("USD"),
  approvedMaximum: z.number().positive().max(10000),
}).refine((request) => request.amount <= request.approvedMaximum, {
  message: "Order amount exceeds the human-approved maximum",
  path: ["amount"],
})

export const refundRequestSchema = z.object({
  captureId: z.string().min(1),
  amount: z.number().positive().max(10000).optional(),
})

export const faultProfileSchema = z.object({
  source: z.enum(["PAYPAL_REAL_NEGATIVE_TEST", "LOCAL_NETWORK_FAULT"]),
  applicationCode: z.enum(["INTERNAL_SERVER_ERROR", "INSTRUMENT_DECLINED", "DUPLICATE_INVOICE_ID"]).optional(),
  loseResponseAfterSuccess: z.boolean().default(false),
})

export type PaypalFaultProfile = z.infer<typeof faultProfileSchema>
