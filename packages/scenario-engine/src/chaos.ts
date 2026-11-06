import { evaluateFinancialInvariants, type InvariantResult } from "../../invariant-engine/src/index"

export type PayPalState = "CREATED" | "APPROVED" | "AUTHORIZED" | "CAPTURE_PENDING" | "CAPTURED" | "PARTIALLY_REFUNDED" | "REFUNDED" | "VOIDED" | "FAILED"
export type MerchantState = "CART" | "ORDER_CREATED" | "PAYMENT_PENDING" | "PAID" | "FULFILLMENT_PENDING" | "FULFILLED" | "REFUND_PENDING" | "REFUNDED" | "CANCELLED" | "FAILED"
export type ChaosAction = "create_order" | "approve" | "capture_send" | "capture_succeed" | "drop_response" | "retry_capture" | "webhook_deliver" | "fulfill" | "refund" | "reconcile"
export type Fault = "response_lost" | "webhook_delayed" | "duplicate_webhook" | "worker_crash_after_effect" | "duplicate_fulfillment"
export type ScheduleStep = { readonly actor: string; readonly action: ChaosAction; readonly fault?: Fault }
export type PaymentModel = { readonly paypal: PayPalState; readonly merchant: MerchantState; readonly captures: number; readonly fulfillments: number; readonly refunds: number; readonly amount: number; readonly maximum: number; readonly webhookEffects: number; readonly evidence: readonly string[] }
export type ScheduleResult = { readonly state: PaymentModel; readonly invariantResults: readonly InvariantResult[]; readonly failedInvariants: readonly string[] }

const allowed: Readonly<Record<PayPalState, readonly PayPalState[]>> = {
  CREATED: ["APPROVED", "FAILED", "VOIDED"], APPROVED: ["AUTHORIZED", "CAPTURE_PENDING", "CAPTURED", "FAILED", "VOIDED"],
  AUTHORIZED: ["CAPTURE_PENDING", "CAPTURED", "VOIDED", "FAILED"], CAPTURE_PENDING: ["CAPTURED", "FAILED"],
  CAPTURED: ["PARTIALLY_REFUNDED", "REFUNDED"], PARTIALLY_REFUNDED: ["PARTIALLY_REFUNDED", "REFUNDED"], REFUNDED: [], VOIDED: [], FAILED: [],
}

export function transitionPayPalState(from: PayPalState, to: PayPalState): PayPalState {
  if (!allowed[from].includes(to)) throw new RangeError(`Invalid PayPal transition ${from} -> ${to}`)
  return to
}

const merchantTransitions: Readonly<Record<MerchantState, readonly MerchantState[]>> = {
  CART: ["ORDER_CREATED", "CANCELLED"], ORDER_CREATED: ["PAYMENT_PENDING", "CANCELLED", "FAILED"], PAYMENT_PENDING: ["PAID", "FAILED", "CANCELLED"],
  PAID: ["FULFILLMENT_PENDING", "REFUND_PENDING", "REFUNDED"], FULFILLMENT_PENDING: ["FULFILLED", "FAILED"], FULFILLED: ["REFUND_PENDING", "REFUNDED"],
  REFUND_PENDING: ["REFUNDED", "FAILED"], REFUNDED: [], CANCELLED: [], FAILED: ["PAYMENT_PENDING", "REFUND_PENDING"],
}

export function transitionMerchantState(from: MerchantState, to: MerchantState): MerchantState {
  if (!merchantTransitions[from].includes(to)) throw new RangeError(`Invalid merchant transition ${from} -> ${to}`)
  return to
}

export function interleaveActors(actors: readonly (readonly ScheduleStep[])[], seed: number, limit = 100): readonly (readonly ScheduleStep[])[] {
  if (!Number.isInteger(seed) || seed < 0 || !Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new RangeError("Seed must be non-negative and schedule limit must be 1..10000")
  let state = seed >>> 0
  const random = (): number => { state = (state * 1664525 + 1013904223) >>> 0; return state }
  const unique = new Map<string, readonly ScheduleStep[]>()
  for (let attempt = 0; attempt < limit * 4 && unique.size < limit; attempt++) {
    const positions = actors.map(() => 0)
    const schedule: ScheduleStep[] = []
    while (positions.some((position, index) => position < (actors[index]?.length ?? 0))) {
      const available = actors.map((actor, index) => (positions[index] ?? 0) < actor.length ? index : -1).filter((index) => index >= 0)
      const selected = available[random() % available.length]
      if (selected === undefined) break
      const step = actors[selected]?.[positions[selected] ?? 0]
      if (!step) break
      schedule.push(step)
      positions[selected] = (positions[selected] ?? 0) + 1
    }
    unique.set(schedule.map((step) => `${step.actor}:${step.action}:${step.fault ?? ""}`).join("|"), schedule)
  }
  return [...unique.values()]
}

export function runSchedule(schedule: readonly ScheduleStep[], options: { readonly maximum?: number; readonly duplicateFulfillmentUnsafe?: boolean } = {}): ScheduleResult {
  const maximum = options.maximum ?? 100
  let state: PaymentModel = { paypal: "CREATED", merchant: "CART", captures: 0, fulfillments: 0, refunds: 0, amount: 89, maximum, webhookEffects: 0, evidence: [] }
  let captureSucceeded = false
  let webhookDelivered = false
  const observedFailures = new Set<string>()
  for (const step of schedule) {
    const evidence = [...state.evidence, `${step.actor}:${step.action}`]
    switch (step.action) {
      case "create_order": state = { ...state, merchant: "ORDER_CREATED", evidence }; break
      case "approve": state = { ...state, paypal: transitionPayPalState(state.paypal, "APPROVED"), merchant: "PAYMENT_PENDING", evidence }; break
      case "capture_send": state = { ...state, paypal: state.paypal === "APPROVED" || state.paypal === "AUTHORIZED" ? transitionPayPalState(state.paypal, "CAPTURE_PENDING") : state.paypal, evidence }; break
      case "capture_succeed":
        if (!captureSucceeded) state = { ...state, paypal: transitionPayPalState(state.paypal, "CAPTURED"), captures: 1, evidence }
        captureSucceeded = true
        break
      case "drop_response": state = { ...state, evidence }; break
      case "retry_capture":
        if (!captureSucceeded) { state = { ...state, paypal: transitionPayPalState(state.paypal, "CAPTURED"), captures: 1 }; captureSucceeded = true }
        state = { ...state, evidence }
        break
      case "webhook_deliver":
        if (!captureSucceeded) { state = { ...state, evidence }; break }
        webhookDelivered = true
        state = { ...state, merchant: "PAID", webhookEffects: Math.max(state.webhookEffects, 1), evidence }
        break
      case "fulfill":
        if (captureSucceeded || webhookDelivered) state = { ...state, merchant: "FULFILLED", fulfillments: state.fulfillments + (options.duplicateFulfillmentUnsafe ? 1 : state.fulfillments === 0 ? 1 : 0), evidence }
        break
      case "refund": if (captureSucceeded) state = { ...state, paypal: transitionPayPalState(state.paypal, "REFUNDED"), refunds: state.amount, merchant: "REFUNDED", evidence }; break
      case "reconcile": if (captureSucceeded && state.merchant !== "FULFILLED") state = { ...state, merchant: "PAID", evidence }; break
    }
    for (const result of evaluateModel(state, captureSucceeded)) if (!result.passed) observedFailures.add(result.id)
  }
  const results = evaluateModel(state, captureSucceeded)
  for (const result of results) if (!result.passed) observedFailures.add(result.id)
  return { state, invariantResults: results, failedInvariants: [...observedFailures].sort() }
}

function evaluateModel(state: PaymentModel, captureSucceeded: boolean): readonly InvariantResult[] {
  return evaluateFinancialInvariants({ authorizedAmount: captureSucceeded ? state.amount : 0, capturedAmount: captureSucceeded ? state.amount : 0, refundedAmount: state.refunds, approvedMaximum: state.maximum, successfulCaptures: state.captures, fulfillmentCount: state.fulfillments, duplicateWebhookEffects: Math.max(0, state.webhookEffects - 1), paymentState: state.paypal === "CAPTURED" || state.paypal === "REFUNDED" ? state.paypal : state.paypal === "FAILED" ? "FAILED" : "PENDING", paypalState: state.paypal, merchantState: state.merchant === "FULFILLED" || state.merchant === "PAID" ? "CAPTURED" : state.paypal, intentCount: state.captures > 1 ? 2 : 1, financialEffects: state.captures, evidenceIds: state.evidence, idempotentRetrySafe: state.captures <= 1 && state.fulfillments <= 1, reconciliationConverged: !(state.paypal === "CAPTURED" && state.merchant === "FAILED") })
}

export function shrinkFailure<T>(input: readonly T[], stillFails: (candidate: readonly T[]) => boolean, maxAttempts = 500): { readonly minimal: readonly T[]; readonly history: readonly number[]; readonly attempts: number } {
  if (input.length === 0 || !stillFails(input)) return { minimal: [...input], history: [input.length], attempts: 0 }
  let current = [...input]
  const history = [current.length]
  let granularity = 2
  let attempts = 0
  while (current.length >= 2 && attempts < maxAttempts) {
    const chunkSize = Math.ceil(current.length / granularity)
    let reduced = false
    for (let start = 0; start < current.length && attempts < maxAttempts; start += chunkSize) {
      attempts++
      const candidate = current.filter((_, index) => index < start || index >= start + chunkSize)
      let candidateFails = false
      if (candidate.length > 0) {
        try { candidateFails = stillFails(candidate) } catch { candidateFails = false }
      }
      if (candidateFails) { current = candidate; history.push(current.length); granularity = Math.max(2, granularity - 1); reduced = true; break }
    }
    if (!reduced) { if (granularity >= current.length) break; granularity = Math.min(current.length, granularity * 2) }
  }
  return { minimal: current, history, attempts }
}

export function replaySchedule(schedule: readonly ScheduleStep[], options?: { readonly maximum?: number; readonly duplicateFulfillmentUnsafe?: boolean }): ScheduleResult {
  return runSchedule(schedule, options)
}

export function regressionArtifact(schedule: readonly ScheduleStep[], expectedFailures: readonly string[], seed: number): { readonly version: 1; readonly seed: number; readonly schedule: readonly ScheduleStep[]; readonly expectedFailures: readonly string[]; readonly replayIdentity: string } {
  const replayIdentity = `AP-${seed.toString(36).toUpperCase()}-${schedule.length.toString().padStart(3, "0")}`
  return { version: 1, seed, schedule, expectedFailures: [...expectedFailures], replayIdentity }
}

export type ChaosCampaign = { readonly name: string; readonly seed: number; readonly maxExecutions: number; readonly maxConcurrentActors: number; readonly maximumAmount: number; readonly duplicateFulfillmentUnsafe: boolean }
export type ChaosCampaignExecution = { readonly ordinal: number; readonly schedule: readonly ScheduleStep[]; readonly failedInvariants: readonly string[]; readonly stateSnapshot: PaymentModel }
export type ChaosCampaignResult = { readonly campaign: ChaosCampaign; readonly schedulesGenerated: number; readonly executions: number; readonly failures: number; readonly uniqueFailureClasses: readonly string[]; readonly replayIdentity?: string; readonly originalSchedule?: readonly ScheduleStep[]; readonly minimizedSchedule?: readonly ScheduleStep[]; readonly shrinkHistory?: readonly number[]; readonly regression?: ReturnType<typeof regressionArtifact>; readonly resilienceScore: number; readonly executionDetails: readonly ChaosCampaignExecution[] }

export function runChaosCampaign(campaign: ChaosCampaign): ChaosCampaignResult {
  if (!Number.isInteger(campaign.maxExecutions) || campaign.maxExecutions < 1 || campaign.maxExecutions > 1000) throw new RangeError("Campaign executions must be between 1 and 1000")
  if (!Number.isInteger(campaign.maxConcurrentActors) || campaign.maxConcurrentActors < 1 || campaign.maxConcurrentActors > 3) throw new RangeError("Campaign concurrency must be between 1 and 3")
  const buyerSchedule: readonly ScheduleStep[] = [{ actor: "buyer", action: "create_order" }, { actor: "buyer", action: "approve" }, { actor: "buyer", action: "capture_send" }, { actor: "buyer", action: "capture_succeed" }, { actor: "buyer", action: "drop_response" }, { actor: "buyer", action: "retry_capture" }]
  const webhookSchedule: readonly ScheduleStep[] = [{ actor: "webhook-worker", action: "webhook_deliver" }, { actor: "webhook-worker", action: "fulfill" }, { actor: "webhook-worker", action: "webhook_deliver", fault: "duplicate_webhook" }]
  const fulfillmentSchedule: readonly ScheduleStep[] = [{ actor: "fulfillment-worker", action: "fulfill", ...(campaign.duplicateFulfillmentUnsafe ? { fault: "duplicate_fulfillment" } : {}) }, { actor: "fulfillment-worker", action: "fulfill", ...(campaign.duplicateFulfillmentUnsafe ? { fault: "worker_crash_after_effect" } : {}) }]
  const actorSchedules: (readonly ScheduleStep[])[] = [buyerSchedule, webhookSchedule, fulfillmentSchedule].slice(0, campaign.maxConcurrentActors)
  const schedules = interleaveActors(actorSchedules, campaign.seed, campaign.maxExecutions)
  let firstFailure: { readonly schedule: readonly ScheduleStep[]; readonly result: ScheduleResult } | undefined
  const classes = new Set<string>()
  let failures = 0
  const allResults: ScheduleResult[] = []
  const executionDetails: ChaosCampaignExecution[] = []
  for (const [index, schedule] of schedules.entries()) {
    const result = runSchedule(schedule, { maximum: campaign.maximumAmount, duplicateFulfillmentUnsafe: campaign.duplicateFulfillmentUnsafe })
    allResults.push(result)
    executionDetails.push({ ordinal: index + 1, schedule, failedInvariants: result.failedInvariants, stateSnapshot: result.state })
    if (result.failedInvariants.length) {
      failures++
      for (const id of result.failedInvariants) classes.add(id)
      firstFailure ??= { schedule, result }
    }
  }
  const shrink = firstFailure ? shrinkFailure(firstFailure.schedule, (candidate) => runSchedule(candidate, { maximum: campaign.maximumAmount, duplicateFulfillmentUnsafe: campaign.duplicateFulfillmentUnsafe }).failedInvariants.some((id) => firstFailure?.result.failedInvariants.includes(id))) : undefined
  const minimized = shrink?.minimal
  const regression = minimized && firstFailure ? regressionArtifact(minimized, runSchedule(minimized, { maximum: campaign.maximumAmount, duplicateFulfillmentUnsafe: campaign.duplicateFulfillmentUnsafe }).failedInvariants, campaign.seed) : undefined
  const passedExecutions = allResults.filter((result) => result.failedInvariants.length === 0).length
  const resilienceScore = schedules.length === 0 ? 100 : Math.round((passedExecutions / schedules.length) * 100)
  return { campaign, schedulesGenerated: schedules.length, executions: schedules.length, failures, uniqueFailureClasses: [...classes].sort(), resilienceScore, executionDetails, ...(firstFailure && regression && minimized && shrink ? { replayIdentity: regression.replayIdentity, originalSchedule: firstFailure.schedule, minimizedSchedule: minimized, shrinkHistory: shrink.history, regression } : {}) }
}
