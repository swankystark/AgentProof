import { describe, expect, test } from "bun:test"
import { interleaveActors, regressionArtifact, replaySchedule, runChaosCampaign, runSchedule, shrinkFailure, transitionPayPalState, type ScheduleStep } from "../../packages/scenario-engine/src/chaos"

const captureActor: readonly ScheduleStep[] = [
  { actor: "buyer", action: "create_order" }, { actor: "buyer", action: "approve" },
  { actor: "worker-a", action: "capture_send" }, { actor: "worker-a", action: "capture_succeed" },
  { actor: "worker-a", action: "drop_response" }, { actor: "worker-b", action: "retry_capture" },
  { actor: "worker-b", action: "fulfill" }, { actor: "worker-a", action: "fulfill" },
]

describe("model-based payment chaos core", () => {
  test("repeats seeded actor interleavings exactly and preserves per-actor order", () => {
    const actors = [[{ actor: "a", action: "capture_send" as const }, { actor: "a", action: "capture_succeed" as const }], [{ actor: "b", action: "webhook_deliver" as const }]]
    const first = interleaveActors(actors, 42, 20)
    expect(interleaveActors(actors, 42, 20)).toEqual(first)
    expect(new Set(first.map((schedule) => schedule.map((step) => step.actor).join(""))).size).toBeGreaterThan(1)
    for (const schedule of first) expect(schedule.findIndex((step) => step.action === "capture_send")).toBeLessThan(schedule.findIndex((step) => step.action === "capture_succeed"))
  })

  test("detects duplicate fulfillment only in the vulnerable merchant schedule", () => {
    const safe = runSchedule(captureActor)
    const vulnerable = runSchedule(captureActor, { duplicateFulfillmentUnsafe: true })
    expect(safe.state.captures).toBe(1)
    expect(safe.state.fulfillments).toBe(1)
    expect(safe.failedInvariants).not.toContain("I4")
    expect(vulnerable.state.captures).toBe(1)
    expect(vulnerable.state.fulfillments).toBe(2)
    expect(vulnerable.failedInvariants).toContain("I4")
  })

  test("shrinks a failing event sequence to its smallest counterexample", () => {
    const shrink = shrinkFailure(captureActor, (candidate) => candidate.some((step) => step.action === "fulfill") && candidate.filter((step) => step.action === "fulfill").length > 1)
    expect(shrink.minimal.filter((step) => step.action === "fulfill")).toHaveLength(2)
    expect(shrink.minimal.length).toBe(2)
    expect(shrink.history[0]).toBe(captureActor.length)
    expect(shrink.attempts).toBeGreaterThan(0)
  })

  test("replays a logical schedule and emits a stable regression artifact", () => {
    const first = replaySchedule(captureActor, { duplicateFulfillmentUnsafe: true })
    const again = replaySchedule(captureActor, { duplicateFulfillmentUnsafe: true })
    expect(again).toEqual(first)
    expect(regressionArtifact(captureActor, first.failedInvariants, 81)).toEqual(regressionArtifact(captureActor, first.failedInvariants, 81))
  })

  test("rejects illegal PayPal transitions", () => {
    expect(() => transitionPayPalState("CREATED", "CAPTURED")).toThrow(RangeError)
  })

  test("campaign records bounded local schedule exploration and shrinks a reproducible violation", () => {
    const campaign = { name: "capture and webhook race", seed: 17, maxExecutions: 30, maxConcurrentActors: 3, maximumAmount: 100, duplicateFulfillmentUnsafe: true }
    const result = runChaosCampaign(campaign)
    expect(result.executions).toBeLessThanOrEqual(campaign.maxExecutions)
    expect(result.schedulesGenerated).toBeGreaterThan(0)
    expect(result.uniqueFailureClasses).toContain("I4")
    expect(result.minimizedSchedule?.length).toBeLessThan(result.originalSchedule?.length ?? 0)
    expect(result.regression?.expectedFailures).toContain("I4")
    expect(replaySchedule(result.minimizedSchedule ?? [], { duplicateFulfillmentUnsafe: true }).failedInvariants).toContain("I4")
  })
})
