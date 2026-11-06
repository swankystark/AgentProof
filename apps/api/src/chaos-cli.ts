import { runChaosCampaign } from "@agentproof/scenario-engine"
import { z } from "zod"

const optionsSchema = z.object({ seed: z.number().int().min(0).max(2_147_483_647), runs: z.number().int().min(1).max(1000), actors: z.number().int().min(1).max(3), injectDuplicateFulfillment: z.boolean(), expectFailure: z.boolean() })

function readOptions(args: readonly string[]): z.infer<typeof optionsSchema> {
  const getNumber = (flag: string, fallback: number): number => {
    const value = args.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1)
    return value === undefined ? fallback : Number(value)
  }
  return optionsSchema.parse({ seed: getNumber("--seed", 42), runs: getNumber("--runs", 25), actors: getNumber("--actors", 3), injectDuplicateFulfillment: args.includes("--inject-duplicate-fulfillment"), expectFailure: args.includes("--expect-failure") })
}

try {
  const options = readOptions(process.argv.slice(2))
  const result = runChaosCampaign({ name: "AgentProof CI schedule campaign", seed: options.seed, maxExecutions: options.runs, maxConcurrentActors: options.actors, maximumAmount: 100, duplicateFulfillmentUnsafe: options.injectDuplicateFulfillment })
  const passed = options.expectFailure ? result.failures > 0 : result.failures === 0
  const { executionDetails, ...summary } = result
  process.stdout.write(`${JSON.stringify({ passed, executionMode: "local_model_exploration", externalPaymentRequests: 0, executionsRecorded: executionDetails.length, result: summary }, null, 2)}\n`)
  if (!passed) process.exitCode = 1
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Invalid chaos campaign options"}\n`)
  process.exitCode = 2
}
