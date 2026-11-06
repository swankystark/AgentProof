export type FinancialSnapshot = {
  readonly authorizedAmount: number
  readonly capturedAmount: number
  readonly refundedAmount: number
  readonly approvedMaximum: number
  readonly successfulCaptures: number
  readonly fulfillmentCount: number
  readonly duplicateWebhookEffects: number
  readonly paymentState: "CREATED" | "PENDING" | "FAILED" | "AUTHORIZED" | "CAPTURED" | "REFUNDED"
  readonly paypalState: string
  readonly merchantState: string
  readonly intentCount: number
  readonly financialEffects: number
  readonly evidenceIds: readonly string[]
  readonly idempotentRetrySafe?: boolean
  readonly reconciliationConverged?: boolean
}

export type InvariantResult = {
  readonly id: `I${number}`
  readonly name: string
  readonly passed: boolean
  readonly severity: "critical" | "high" | "medium"
  readonly explanation: string
  readonly evidenceIds: readonly string[]
}

const check = (
  id: InvariantResult["id"],
  name: string,
  passed: boolean,
  explanation: string,
  evidenceIds: readonly string[],
): InvariantResult => ({ id, name, passed, severity: passed ? "medium" : "critical", explanation, evidenceIds })

export function evaluateFinancialInvariants(state: FinancialSnapshot): readonly InvariantResult[] {
  return [
    check("I1", "Captured does not exceed authorized", state.capturedAmount <= state.authorizedAmount,
      `Captured ${state.capturedAmount.toFixed(2)}; authorized ${state.authorizedAmount.toFixed(2)}.`, state.evidenceIds),
    check("I2", "Refunded does not exceed captured", state.refundedAmount <= state.capturedAmount,
      `Refunded ${state.refundedAmount.toFixed(2)}; captured ${state.capturedAmount.toFixed(2)}.`, state.evidenceIds),
    check("I3", "One intent has permitted financial effect", state.intentCount <= 1 && state.financialEffects <= 1,
      `Intent count ${state.intentCount}; financial effects ${state.financialEffects}.`, state.evidenceIds),
    check("I4", "Capture does not duplicate fulfillment", state.successfulCaptures <= 1 && state.fulfillmentCount <= 1,
      `${state.successfulCaptures} capture(s), ${state.fulfillmentCount} fulfillment(s).`, state.evidenceIds),
    check("I5", "Final amount stays within approved maximum", state.capturedAmount <= state.approvedMaximum,
      `Captured ${state.capturedAmount.toFixed(2)}; approved maximum ${state.approvedMaximum.toFixed(2)}.`, state.evidenceIds),
    check("I6", "Webhook replay has no duplicate effects", state.duplicateWebhookEffects === 0,
      `${state.duplicateWebhookEffects} duplicate webhook side effect(s).`, state.evidenceIds),
    check("I7", "Merchant state reconciles with PayPal", state.merchantState === state.paypalState,
      `PayPal is ${state.paypalState}; merchant is ${state.merchantState}.`, state.evidenceIds),
    check("I8", "Only a successful payment can fulfill", state.paymentState === "CAPTURED" || state.paymentState === "REFUNDED" || state.fulfillmentCount === 0,
      `Payment ${state.paymentState}; fulfillment count ${state.fulfillmentCount}.`, state.evidenceIds),
    check("I9", "Refund requires a captured payment", state.refundedAmount === 0 || state.capturedAmount > 0,
      `Captured ${state.capturedAmount.toFixed(2)}; refunded ${state.refundedAmount.toFixed(2)}.`, state.evidenceIds),
    check("I10", "Financial transitions have evidence", (state.financialEffects === 0 || state.evidenceIds.length > 0),
      `${state.evidenceIds.length} evidence record(s) linked to financial state.`, state.evidenceIds),
    check("I11", "Idempotent retry preserves exactly-once effects", state.idempotentRetrySafe ?? true,
      `Financial effects ${state.financialEffects}; captures ${state.successfulCaptures}; fulfillments ${state.fulfillmentCount}.`, state.evidenceIds),
    check("I12", "Recovered state converges with PayPal", state.reconciliationConverged ?? true,
      `PayPal is ${state.paypalState}; merchant is ${state.merchantState}.`, state.evidenceIds),
  ]
}

export function calculateReadinessScore(results: readonly InvariantResult[]): number {
  if (results.length === 0) return 100
  const weights = { critical: 20, high: 12, medium: 5 } as const
  const penalty = results.filter((result) => !result.passed).reduce((sum, result) => sum + weights[result.severity], 0)
  return Math.max(0, Math.min(100, 100 - penalty))
}
