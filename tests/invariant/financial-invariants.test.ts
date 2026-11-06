import { describe, expect, test } from "bun:test"
import { calculateReadinessScore, evaluateFinancialInvariants, type FinancialSnapshot } from "../../packages/invariant-engine/src/index"

const safeSnapshot: FinancialSnapshot = {
  authorizedAmount: 89,
  capturedAmount: 89,
  refundedAmount: 0,
  approvedMaximum: 100,
  successfulCaptures: 1,
  fulfillmentCount: 1,
  duplicateWebhookEffects: 0,
  paymentState: "CAPTURED",
  paypalState: "CAPTURED",
  merchantState: "CAPTURED",
  intentCount: 1,
  financialEffects: 1,
  evidenceIds: ["capture-evidence-1"],
}

describe("deterministic financial invariant engine", () => {
  test("passes when a single capture is approved, fulfilled, reconciled, and evidenced", () => {
    const results = evaluateFinancialInvariants(safeSnapshot)
    expect(results).toHaveLength(12)
    expect(results.every((result) => result.passed)).toBe(true)
    expect(calculateReadinessScore(results)).toBe(100)
  })

  test("fails the specific controls breached by an oversized duplicate payment and refund", () => {
    const results = evaluateFinancialInvariants({
      ...safeSnapshot,
      capturedAmount: 125,
      refundedAmount: 130,
      successfulCaptures: 2,
      fulfillmentCount: 2,
      duplicateWebhookEffects: 1,
      merchantState: "PENDING",
      intentCount: 2,
      financialEffects: 2,
    })
    const failures = results.filter((result) => !result.passed).map((result) => result.id)
    expect(failures).toEqual(["I1", "I2", "I3", "I4", "I5", "I6", "I7"])
    expect(calculateReadinessScore(results)).toBe(0)
  })

  test("does not mark a pending payment fulfilled", () => {
    const results = evaluateFinancialInvariants({ ...safeSnapshot, paymentState: "PENDING", fulfillmentCount: 1 })
    expect(results.find((result) => result.id === "I8")?.passed).toBe(false)
  })
})
