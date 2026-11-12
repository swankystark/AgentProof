import { and, asc, desc, eq, isNull, or } from "drizzle-orm"
import { chaosCampaignSchema } from "@agentproof/contracts"
import { runChaosCampaign } from "@agentproof/scenario-engine"
import { db } from "./db/client"
import { chaosCampaigns, chaosExecutions, traceEvents } from "./db/schema"

export async function createChaosCampaign(input: unknown, sessionId = "demo-session"): Promise<unknown> {
  const parsed = chaosCampaignSchema.safeParse(input)
  if (!parsed.success) throw new TypeError("Invalid chaos campaign configuration")
  if (!db) throw new Error("Database is unavailable; start PostgreSQL before running campaigns")
  const result = runChaosCampaign(parsed.data)
  const { executionDetails, ...summary } = result
  const campaignId = crypto.randomUUID()
  await db.insert(chaosCampaigns).values({ id: campaignId, sessionId, name: parsed.data.name, seed: parsed.data.seed, status: "completed", configuration: parsed.data, result: summary })
  if (executionDetails.length) await db.insert(chaosExecutions).values(executionDetails.map((execution) => ({ id: crypto.randomUUID(), campaignId, ordinal: execution.ordinal, schedule: execution.schedule, failedInvariants: [...execution.failedInvariants], stateSnapshot: execution.stateSnapshot })))
  if (result.originalSchedule) {
    await db.insert(chaosExecutions).values([{ id: crypto.randomUUID(), campaignId, ordinal: result.executions + 1, schedule: result.minimizedSchedule ?? [], failedInvariants: result.uniqueFailureClasses, stateSnapshot: { replayIdentity: result.replayIdentity, minimizedSchedule: result.minimizedSchedule ?? [], shrinkHistory: result.shrinkHistory ?? [], artifact: result.regression ?? null } }])
    await db.insert(traceEvents).values({ id: crypto.randomUUID(), sessionId, source: "chaos-engine", eventType: "COUNTEREXAMPLE_SHRUNK", details: { campaignId, replayIdentity: result.replayIdentity, originalEventCount: result.originalSchedule.length, minimalEventCount: result.minimizedSchedule?.length ?? 0, shrinkHistory: result.shrinkHistory ?? [] } })
  }
  await db.insert(traceEvents).values({ id: crypto.randomUUID(), sessionId, source: "chaos-engine", eventType: "CAMPAIGN_COMPLETED", details: { campaignId, executions: result.executions, failures: result.failures, failureClasses: [...result.uniqueFailureClasses], seed: parsed.data.seed, externalPaymentRequests: 0 } })
  return { campaignId, executionMode: "local_model_exploration", externalPaymentRequests: 0, ...summary }
}

export async function getLatestChaosCampaign(sessionId?: string): Promise<unknown> {
  if (!db) return null
  const [row] = await db.select().from(chaosCampaigns).where(sessionId ? sessionId === "demo-session" ? or(eq(chaosCampaigns.sessionId, sessionId), isNull(chaosCampaigns.sessionId)) : eq(chaosCampaigns.sessionId, sessionId) : undefined).orderBy(desc(chaosCampaigns.createdAt)).limit(1)
  if (!row) return null
  const executions = await db.select().from(chaosExecutions).where(eq(chaosExecutions.campaignId, row.id)).orderBy(asc(chaosExecutions.ordinal))
  return { ...row, executions }
}
