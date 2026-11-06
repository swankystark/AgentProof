import { describe, expect, test } from "bun:test"
import { redTeamScenarioSchema, scenarioKinds } from "../../packages/contracts/src/index"
import { predefinedScenarios } from "../../packages/scenario-engine/src/index"

describe("red-team scenario contracts", () => {
  test("ships exactly the five required deterministic scenarios", () => {
    expect(predefinedScenarios.map((scenario) => scenario.kind)).toEqual(scenarioKinds)
    expect(predefinedScenarios.every((scenario) => redTeamScenarioSchema.safeParse(scenario).success)).toBe(true)
  })

  test("rejects an unrecognized scenario kind and severity", () => {
    const scenario = predefinedScenarios[0]
    expect(scenario).toBeDefined()
    if (!scenario) throw new Error("Scenario fixture is missing")
    expect(redTeamScenarioSchema.safeParse({ ...scenario, kind: "arbitrary" }).success).toBe(false)
    expect(redTeamScenarioSchema.safeParse({ ...scenario, severity: "urgent" }).success).toBe(false)
  })
})
