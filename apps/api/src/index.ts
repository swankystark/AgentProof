import { serve } from "@hono/node-server"
import { cors } from "hono/cors"
import { Hono } from "hono"
import { z } from "zod"
import { chaosCampaignSchema, chaosReplaySchema, createOrderRequestSchema, faultProfileSchema, refundRequestSchema, scenarioRunRequestSchema } from "@agentproof/contracts"
import { aiConfigured, config, databaseConfigured, paypalConfigured } from "./config"
import { checkDatabase } from "./db/client"
import { catalog, searchProducts } from "./catalog"
import { generateScenario, investigateIncident } from "./ai"
import { captureAuthorizedPayment, completeAuthorization, completeCheckout, createBusinessIntent, createCart, getCart, removeCartItem, requestRefund, retrieveOrder, saveIncident, startAuthorizationCheckout, startCheckout, updateCartItem, voidAuthorizedPayment } from "./merchant"
import { getDashboardData, getLatestScenarioRun, runScenario } from "./scenarios"
import { oauthHealth } from "./paypal"
import { receiveWebhook } from "./webhooks"
import { runBuyerAgent } from "./buyer-agent"
import { getDemoFaultSettings, setDuplicateFulfillment } from "./demo-faults"
import { createChaosCampaign, getLatestChaosCampaign } from "./chaos"
import { answerAnalyticsQuestion } from "./analytics-assistant"
import { replaySchedule } from "@agentproof/scenario-engine"

const app = new Hono()
app.use("*", cors({ origin: config.WEB_ORIGIN, allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], allowHeaders: ["Content-Type"] }))

app.get("/health", async (context) => {
  let database = false
  try { database = await checkDatabase() } catch { database = false }
  let paypal = false
  if (paypalConfigured) {
    try { paypal = await oauthHealth() } catch { paypal = false }
  }
  return context.json({ status: "ok", services: { database: { configured: databaseConfigured, connected: database }, paypal: { configured: paypalConfigured, connected: paypal, environment: "sandbox" }, ai: { configured: aiConfigured }, webhook: { configured: Boolean(process.env.PAYPAL_WEBHOOK_ID) }, agGrid: { configured: true, edition: "Community" }, agStudio: { configured: Boolean(config.AG_STUDIO_LICENSE_KEY), mode: config.AG_STUDIO_LICENSE_KEY ? "licensed" : "development" } } })
})

app.get("/ready", async (context) => {
  const database = await checkDatabase().catch(() => false)
  return context.json({ ready: database, checks: { database } }, database ? 200 : 503)
})

app.get("/api/dashboard", async (context) => context.json(await getDashboardData()))
app.get("/api/chaos/latest", async (context) => context.json({ campaign: await getLatestChaosCampaign() }))
app.post("/api/chaos/campaigns", async (context) => {
  let input: unknown
  try { input = await context.req.json() } catch { return context.json({ error: "Malformed chaos campaign" }, 400) }
  const parsed = chaosCampaignSchema.safeParse(input)
  if (!parsed.success) return context.json({ error: "Invalid chaos campaign", details: parsed.error.flatten() }, 400)
  try { return context.json(await createChaosCampaign(parsed.data), 201) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Chaos campaign failed" }, 503) }
})
app.post("/api/chaos/replay", async (context) => {
  let input: unknown
  try { input = await context.req.json() } catch { return context.json({ error: "Malformed replay artifact" }, 400) }
  const parsed = chaosReplaySchema.safeParse(input)
  if (!parsed.success) return context.json({ error: "Invalid replay artifact", details: parsed.error.flatten() }, 400)
  const schedule = parsed.data.schedule.map(({ actor, action, fault }) => ({ actor, action, ...(fault ? { fault } : {}) }))
  const replay = replaySchedule(schedule, { maximum: parsed.data.maximum, duplicateFulfillmentUnsafe: parsed.data.duplicateFulfillmentUnsafe })
  const reproduced = parsed.data.expectedFailures.length === 0
    ? replay.failedInvariants.length === 0
    : parsed.data.expectedFailures.length === replay.failedInvariants.length && parsed.data.expectedFailures.every((id) => replay.failedInvariants.includes(id))
  return context.json({ outcome: reproduced ? "REPRODUCED" : "NO_LONGER_REPRODUCES", reproduced, expectedFailures: parsed.data.expectedFailures, ...replay })
})
app.get("/api/public-config", (context) => context.json({ paypalConfigured, paypalClientId: paypalConfigured ? config.PAYPAL_CLIENT_ID : null, databaseConfigured, aiConfigured, agStudioLicenseKey: config.AG_STUDIO_LICENSE_KEY ?? null }))
app.post("/api/analytics/assistant", async (context) => {
  const parsed = z.object({ question: z.string().min(2).max(1200) }).safeParse(await context.req.json())
  if (!parsed.success) return context.json({ error: "Invalid analytics question" }, 400)
  try {
    const [dashboard, campaign] = await Promise.all([getDashboardData(), getLatestChaosCampaign()])
    return context.json({ answer: await answerAnalyticsQuestion(parsed.data.question, { readiness: dashboard.readiness, traces: dashboard.traces.slice(0, 25), latestCampaign: campaign }) })
  } catch (error) { return context.json({ error: error instanceof Error ? error.message : "Analytics assistant failed" }, 503) }
})
app.get("/api/merchant/demo-faults", (context) => context.json(getDemoFaultSettings()))

app.put("/api/merchant/demo-faults", async (context) => {
  const parsed = z.object({ duplicateFulfillment: z.boolean() }).safeParse(await context.req.json())
  if (!parsed.success) return context.json({ error: "Invalid demo fault setting" }, 400)
  try { return context.json(setDuplicateFulfillment(parsed.data.duplicateFulfillment)) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Fault profile cannot be enabled" }, 403) }
})
app.get("/api/catalog", (context) => context.json({ products: catalog }))
app.get("/api/catalog/search", (context) => context.json({ products: searchProducts(context.req.query("q") ?? "") }))

app.post("/api/agent/buy", async (context) => {
  let payload: unknown
  try { payload = await context.req.json() } catch { return context.json({ error: "Malformed buyer objective" }, 400) }
  try { return context.json(await runBuyerAgent(payload), 200) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Buyer agent failed" }, 503) }
})
app.get("/api/scenarios/:id/latest", async (context) => context.json({ run: await getLatestScenarioRun(context.req.param("id")) }))

app.post("/api/scenarios/:id/run", async (context) => {
  const parsed = scenarioRunRequestSchema.safeParse(await context.req.json())
  if (!parsed.success) return context.json({ error: "Invalid scenario request", details: parsed.error.flatten() }, 400)
  try { return context.json(await runScenario(context.req.param("id"), parsed.data.mode), 201) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Scenario run failed" }, 503) }
})

app.post("/api/scenarios/generate", async (context) => {
  const parsed = z.object({ context: z.string().min(1).max(1200) }).safeParse(await context.req.json())
  if (!parsed.success) return context.json({ error: "Invalid generator input", details: parsed.error.flatten() }, 400)
  try { return context.json({ scenario: await generateScenario(parsed.data.context) }, 201) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Scenario generation failed" }, 503) }
})

app.post("/api/merchant/intents", async (context) => {
  const parsed = z.object({ description: z.string().min(3).max(300), approvedMaximum: z.number().positive().max(10000), cartId: z.string().uuid().optional() }).safeParse(await context.req.json())
  if (!parsed.success) return context.json({ error: "Invalid business intent", details: parsed.error.flatten() }, 400)
  try { return context.json(await createBusinessIntent({ description: parsed.data.description, approvedMaximum: parsed.data.approvedMaximum, ...(parsed.data.cartId ? { cartId: parsed.data.cartId } : {}) }), 201) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Could not create intent" }, 503) }
})

app.post("/api/merchant/carts", async (context) => {
  const parsed = z.object({ items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(20) })).max(20) }).safeParse(await context.req.json())
  if (!parsed.success) return context.json({ error: "Invalid cart", details: parsed.error.flatten() }, 400)
  try { return context.json(await createCart(parsed.data.items), 201) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Could not create cart" }, 400) }
})

app.get("/api/merchant/carts/:id", async (context) => {
  try { return context.json(await getCart(context.req.param("id"))) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Could not get cart" }, 404) }
})

app.put("/api/merchant/carts/:id/items/:productId", async (context) => {
  const parsed = z.object({ quantity: z.number().int().min(0).max(20) }).safeParse(await context.req.json())
  if (!parsed.success) return context.json({ error: "Invalid cart quantity", details: parsed.error.flatten() }, 400)
  try { return context.json(await updateCartItem(context.req.param("id"), context.req.param("productId"), parsed.data.quantity)) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Could not update cart" }, 400) }
})

app.delete("/api/merchant/carts/:id/items/:productId", async (context) => {
  try { return context.json(await removeCartItem(context.req.param("id"), context.req.param("productId"))) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Could not remove cart item" }, 400) }
})

app.post("/api/merchant/orders", async (context) => {
  const parsed = createOrderRequestSchema.safeParse(await context.req.json())
  if (!parsed.success) return context.json({ error: "Invalid checkout request", details: parsed.error.flatten() }, 400)
  const mockHeader = context.req.header("x-agentproof-fault")
  let mockCode: string | undefined
  if (mockHeader) {
    let decoded: unknown
    try { decoded = JSON.parse(mockHeader) } catch { return context.json({ error: "Malformed fault profile" }, 400) }
    const profile = faultProfileSchema.safeParse(decoded)
    if (!profile.success || profile.data.source !== "PAYPAL_REAL_NEGATIVE_TEST" || !profile.data.applicationCode || config.PAYPAL_NEGATIVE_TESTING !== "true") return context.json({ error: "Requested PayPal negative-test profile is not enabled" }, 400)
    mockCode = profile.data.applicationCode
  }
  try { return context.json(await startCheckout({ ...parsed.data, ...(mockCode ? { mockCode } : {}) }), 201) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Could not start checkout" }, 502) }
})

app.post("/api/merchant/authorization-orders", async (context) => {
  const parsed = createOrderRequestSchema.safeParse(await context.req.json())
  if (!parsed.success) return context.json({ error: "Invalid authorization checkout request", details: parsed.error.flatten() }, 400)
  try { return context.json(await startAuthorizationCheckout(parsed.data), 201) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Could not start authorization checkout" }, 502) }
})

app.post("/api/merchant/orders/:id/authorize", async (context) => {
  try { return context.json(await completeAuthorization(context.req.param("id"))) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Could not authorize order" }, 502) }
})

app.post("/api/merchant/authorizations/:id/capture", async (context) => {
  try { return context.json(await captureAuthorizedPayment(context.req.param("id"))) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Could not capture authorization" }, 502) }
})

app.post("/api/merchant/authorizations/:id/void", async (context) => {
  try { return context.json(await voidAuthorizedPayment(context.req.param("id"))) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Could not void authorization" }, 502) }
})

app.post("/api/merchant/orders/:id/capture", async (context) => {
  try { return context.json(await completeCheckout(context.req.param("id"))) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Could not capture order", retryable: error instanceof Error && error.name === "LocalNetworkFault" }, error instanceof Error && error.name === "LocalNetworkFault" ? 503 : 502) }
})

app.get("/api/merchant/orders/:id", async (context) => {
  try { return context.json(await retrieveOrder(context.req.param("id"))) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Could not retrieve order" }, 502) }
})

app.post("/api/merchant/refunds", async (context) => {
  const parsed = refundRequestSchema.safeParse(await context.req.json())
  if (!parsed.success) return context.json({ error: "Invalid refund request", details: parsed.error.flatten() }, 400)
  try { return context.json(await requestRefund(parsed.data.captureId, parsed.data.amount), 201) }
  catch (error) { return context.json({ error: error instanceof Error ? error.message : "Could not refund capture" }, 502) }
})

app.post("/api/webhooks/paypal", async (context) => {
  try {
    const result = await receiveWebhook(context.req.raw.headers, await context.req.json())
    return context.json(result, result.accepted ? 200 : 400)
  } catch (error) { return context.json({ error: error instanceof Error ? error.message : "Webhook processing failed" }, 400) }
})

app.post("/api/scenarios/:id/investigate", async (context) => {
  const parsed = z.object({ runId: z.string().uuid(), invariantFailures: z.array(z.string()), evidence: z.array(z.string()) }).safeParse(await context.req.json())
  if (!parsed.success) return context.json({ error: "Invalid investigation request" }, 400)
  try {
    const report = await investigateIncident({ scenarioId: context.req.param("id"), invariantFailures: parsed.data.invariantFailures, evidence: parsed.data.evidence })
    await saveIncident({ scenarioRunId: parsed.data.runId, ...report })
    return context.json(report)
  } catch (error) { return context.json({ error: error instanceof Error ? error.message : "Investigation failed" }, 503) }
})

app.onError((error, context) => {
  console.error(JSON.stringify({ level: "error", route: context.req.path, error: error.name, message: error.message }))
  return context.json({ error: "Request failed" }, 500)
})

serve({ fetch: app.fetch, port: config.API_PORT }, (info) => {
  console.log(JSON.stringify({ level: "info", event: "api_listening", port: info.port, sandbox: true }))
})
