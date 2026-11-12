import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { evaluateFinancialInvariants } from "@agentproof/invariant-engine"
import { catalog } from "./catalog"
import { isDuplicateFulfillmentEnabled } from "./demo-faults"
import { createOrder, createAuthorizationOrder, authorizeOrder, captureAuthorization, voidAuthorization, captureOrder, getOrder, refundCapture } from "./paypal"
import { config } from "./config"
import { db } from "./db/client"
import { businessIntents, cartItems, carts, incidentReports, invariantResults, merchantOrders, paypalAuthorizations, paypalCaptures, paypalOrders, paypalRefunds, scenarioRuns, traceEvents } from "./db/schema"

export async function createCart(items: readonly { readonly productId: string; readonly quantity: number }[], sessionId = "demo-session"): Promise<{ readonly cartId: string; readonly total: number }> {
  if (!db) throw new Error("Database is unavailable")
  validateCartItems(items)
  const cartId = crypto.randomUUID()
  await db.insert(carts).values({ id: cartId, sessionId, status: "open" })
  if (items.length > 0) await db.insert(cartItems).values(items.map((item) => ({ id: crypto.randomUUID(), cartId, ...item })))
  return { cartId, total: cartTotal(items) }
}

export async function getCart(cartId: string, sessionId = "demo-session"): Promise<{ readonly cartId: string; readonly total: number; readonly items: readonly { readonly productId: string; readonly name: string; readonly quantity: number; readonly price: number }[] }> {
  if (!db) throw new Error("Database is unavailable")
  const [cart] = await db.select().from(carts).where(and(eq(carts.id, cartId), eq(carts.sessionId, sessionId))).limit(1)
  if (!cart) throw new RangeError("Cart was not found")
  const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cartId))
  const lines = items.map((item) => {
    const product = catalog.find((entry) => entry.id === item.productId)
    if (!product) throw new RangeError("Cart contains an unavailable product")
    return { productId: product.id, name: product.name, quantity: item.quantity, price: product.price }
  })
  return { cartId, total: lines.reduce((sum, item) => sum + item.price * item.quantity, 0), items: lines }
}

export async function updateCartItem(cartId: string, productId: string, quantity: number, sessionId = "demo-session"): Promise<{ readonly cartId: string; readonly total: number }> {
  if (!db) throw new Error("Database is unavailable")
  const product = catalog.find((entry) => entry.id === productId)
  if (!product || quantity > product.inventory) throw new RangeError("Product is unavailable in the requested quantity")
  const [cart] = await db.select().from(carts).where(and(eq(carts.id, cartId), eq(carts.sessionId, sessionId))).limit(1)
  if (!cart || cart.status !== "open") throw new RangeError("Cart is not open")
  const [existing] = await db.select().from(cartItems).where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId))).limit(1)
  if (quantity === 0) {
    if (existing) await db.delete(cartItems).where(eq(cartItems.id, existing.id))
  } else if (existing) await db.update(cartItems).set({ quantity }).where(eq(cartItems.id, existing.id))
  else await db.insert(cartItems).values({ id: crypto.randomUUID(), cartId, productId, quantity })
  const updated = await getCart(cartId, sessionId)
  return { cartId, total: updated.total }
}

export async function removeCartItem(cartId: string, productId: string, sessionId = "demo-session"): Promise<{ readonly cartId: string; readonly total: number }> {
  return updateCartItem(cartId, productId, 0, sessionId)
}

function validateCartItems(items: readonly { readonly productId: string; readonly quantity: number }[]): void {
  if (items.length > 20 || items.some((item) => !catalog.some((product) => product.id === item.productId && product.inventory >= item.quantity) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)) throw new RangeError("Cart contains an invalid product or quantity")
}

function cartTotal(items: readonly { readonly productId: string; readonly quantity: number }[]): number {
  return items.reduce((sum, item) => sum + (catalog.find((product) => product.id === item.productId)?.price ?? 0) * item.quantity, 0)
}

export async function createBusinessIntent(input: { readonly description: string; readonly approvedMaximum: number; readonly cartId?: string; readonly sessionId?: string }): Promise<{ readonly intentId: string }> {
  if (!db) throw new Error("Database is unavailable; start PostgreSQL before creating a merchant intent")
  if (input.cartId) await getCart(input.cartId, input.sessionId ?? "demo-session")
  const intentId = crypto.randomUUID()
  await db.insert(businessIntents).values({ id: intentId, sessionId: input.sessionId ?? "demo-session", cartId: input.cartId ?? null, description: input.description, approvedMaximum: input.approvedMaximum.toFixed(2) })
  return { intentId }
}

export async function startCheckout(input: { readonly intentId: string; readonly amount: number; readonly approvedMaximum: number; readonly mockCode?: string; readonly scenarioRunId?: string; readonly sessionId?: string }): Promise<{ readonly orderId: string; readonly approveUrl: string }> {
  if (!db) throw new Error("Database is unavailable; start PostgreSQL before checkout")
  const [intent] = await db.select().from(businessIntents).where(eq(businessIntents.id, input.intentId)).limit(1)
  if (!intent) throw new RangeError("Business intent was not found")
  if (intent.sessionId !== (input.sessionId ?? "demo-session")) throw new RangeError("Business intent belongs to a different testing session")
  if (Number(intent.approvedMaximum) !== input.approvedMaximum || input.amount > Number(intent.approvedMaximum)) throw new RangeError("Checkout amount exceeds the business intent's approved maximum")
  if (intent.cartId) {
    const cart = await getCart(intent.cartId, intent.sessionId)
    if (cart.total !== input.amount) throw new RangeError("Cart contents changed after approval; create a new business intent")
  }
  const merchantOrderId = crypto.randomUUID()
  await db.insert(merchantOrders).values({ id: merchantOrderId, intentId: intent.id, cartId: intent.cartId ?? "demo-cart", scenarioRunId: input.scenarioRunId ?? null, status: "CREATED", amount: input.amount.toFixed(2) })
  const order = await createOrder({ intentId: intent.id, amount: input.amount, currency: "USD", ...(input.mockCode === undefined ? {} : { mockCode: input.mockCode }) })
  const approveUrl = order.links.find((link) => link.rel === "approve")?.href
  if (!approveUrl) throw new Error("PayPal did not provide an approval URL")
  await db.insert(paypalOrders).values({ id: crypto.randomUUID(), merchantOrderId, paypalOrderId: order.id, status: order.status })
  await db.insert(traceEvents).values({ id: crypto.randomUUID(), source: "paypal", eventType: "ORDER_CREATED", details: { paypalOrderId: order.id, merchantOrderId, amount: input.amount } })
  return { orderId: order.id, approveUrl }
}

export async function startAuthorizationCheckout(input: { readonly intentId: string; readonly amount: number; readonly approvedMaximum: number }): Promise<{ readonly orderId: string; readonly approveUrl: string }> {
  if (!db) throw new Error("Database is unavailable; start PostgreSQL before checkout")
  const [intent] = await db.select().from(businessIntents).where(eq(businessIntents.id, input.intentId)).limit(1)
  if (!intent) throw new RangeError("Business intent was not found")
  if (Number(intent.approvedMaximum) !== input.approvedMaximum || input.amount > Number(intent.approvedMaximum)) throw new RangeError("Checkout amount exceeds the business intent's approved maximum")
  if (intent.cartId) {
    const cart = await getCart(intent.cartId)
    if (cart.total !== input.amount) throw new RangeError("Cart contents changed after approval; create a new business intent")
  }
  const merchantOrderId = crypto.randomUUID()
  await db.insert(merchantOrders).values({ id: merchantOrderId, intentId: intent.id, cartId: intent.cartId ?? "demo-cart", status: "CREATED", amount: input.amount.toFixed(2) })
  const order = await createAuthorizationOrder({ intentId: intent.id, amount: input.amount, currency: "USD" })
  const approveUrl = order.links.find((link) => link.rel === "approve")?.href
  if (!approveUrl) throw new Error("PayPal did not provide an approval URL")
  await db.insert(paypalOrders).values({ id: crypto.randomUUID(), merchantOrderId, paypalOrderId: order.id, status: order.status })
  await db.insert(traceEvents).values({ id: crypto.randomUUID(), source: "paypal", eventType: "AUTHORIZATION_ORDER_CREATED", details: { paypalOrderId: order.id, merchantOrderId, amount: input.amount } })
  return { orderId: order.id, approveUrl }
}

export async function completeAuthorization(orderId: string): Promise<{ readonly orderId: string; readonly authorizationId?: string; readonly status: string }> {
  if (!db) throw new Error("Database is unavailable")
  const [mapping] = await db.select().from(paypalOrders).where(eq(paypalOrders.paypalOrderId, orderId)).limit(1)
  if (!mapping) throw new RangeError("PayPal order is not linked to an AgentProof intent")
  const result = await authorizeOrder(orderId, `agentproof-authorize-${orderId}`)
  const authorization = result.purchase_units?.flatMap((unit) => unit.payments?.authorizations ?? []).find((item) => item.status === "CREATED")
  if (!authorization) return { orderId, status: result.status }
  await db.insert(paypalAuthorizations).values({ id: crypto.randomUUID(), paypalOrderId: orderId, authorizationId: authorization.id, amount: authorization.amount.value, status: authorization.status }).onConflictDoNothing()
  await db.insert(traceEvents).values({ id: crypto.randomUUID(), source: "paypal", eventType: "PAYMENT.AUTHORIZATION.CREATED", details: { orderId, authorizationId: authorization.id, amount: authorization.amount.value } })
  return { orderId, authorizationId: authorization.id, status: authorization.status }
}

export async function captureAuthorizedPayment(authorizationId: string): Promise<{ readonly authorizationId: string; readonly captureId?: string; readonly status: string }> {
  if (!db) throw new Error("Database is unavailable")
  const [authorization] = await db.select().from(paypalAuthorizations).where(eq(paypalAuthorizations.authorizationId, authorizationId)).limit(1)
  if (!authorization) throw new RangeError("Authorization was not found")
  const result = await captureAuthorization(authorizationId, `agentproof-auth-capture-${authorizationId}`)
  const capture = result.purchase_units?.flatMap((unit) => unit.payments?.captures ?? []).find((item) => item.status === "COMPLETED")
  if (!capture) return { authorizationId, status: result.status }
  const [order] = await db.select().from(paypalOrders).where(eq(paypalOrders.paypalOrderId, authorization.paypalOrderId)).limit(1)
  if (!order) throw new Error("Authorized PayPal order mapping is missing")
  await db.insert(paypalCaptures).values({ id: crypto.randomUUID(), merchantOrderId: order.merchantOrderId, captureId: capture.id, amount: capture.amount.value, status: capture.status }).onConflictDoNothing()
  await db.update(merchantOrders).set({ status: "COMPLETED", fulfillmentCount: 1 }).where(eq(merchantOrders.id, order.merchantOrderId))
  await db.update(paypalAuthorizations).set({ status: "CAPTURED" }).where(eq(paypalAuthorizations.authorizationId, authorizationId))
  await db.insert(traceEvents).values({ id: crypto.randomUUID(), source: "paypal", eventType: "AUTHORIZED_PAYMENT_CAPTURED", details: { authorizationId, captureId: capture.id, amount: capture.amount.value } })
  return { authorizationId, captureId: capture.id, status: capture.status }
}

export async function voidAuthorizedPayment(authorizationId: string): Promise<{ readonly authorizationId: string; readonly status: string }> {
  if (!db) throw new Error("Database is unavailable")
  const [authorization] = await db.select().from(paypalAuthorizations).where(eq(paypalAuthorizations.authorizationId, authorizationId)).limit(1)
  if (!authorization) throw new RangeError("Authorization was not found")
  const result = await voidAuthorization(authorizationId, `agentproof-auth-void-${authorizationId}`)
  await db.update(paypalAuthorizations).set({ status: result.status }).where(eq(paypalAuthorizations.authorizationId, authorizationId))
  await db.insert(traceEvents).values({ id: crypto.randomUUID(), source: "paypal", eventType: "PAYMENT.AUTHORIZATION.VOIDED", details: { authorizationId, status: result.status } })
  return { authorizationId, status: result.status }
}

export async function completeCheckout(orderId: string, sessionId = "demo-session"): Promise<{ readonly orderId: string; readonly captureId?: string; readonly status: string }> {
  if (!db) throw new Error("Database is unavailable")
  const [mapping] = await db.select().from(paypalOrders).where(eq(paypalOrders.paypalOrderId, orderId)).limit(1)
  if (!mapping) throw new RangeError("PayPal order is not linked to an AgentProof intent")
  const [merchantOrder] = await db.select().from(merchantOrders).where(eq(merchantOrders.id, mapping.merchantOrderId)).limit(1)
  if (!merchantOrder) throw new RangeError("Merchant order was not found")
  const [intent] = await db.select().from(businessIntents).where(eq(businessIntents.id, merchantOrder.intentId)).limit(1)
  if (!intent || intent.sessionId !== sessionId) throw new RangeError("PayPal order belongs to a different testing session")
  const capture = await captureOrder(orderId, `agentproof-capture-${orderId}`)
  const captureData = capture.purchase_units?.flatMap((unit) => unit.payments?.captures ?? []).find((item) => item.status === "COMPLETED")
  if (!captureData) return { orderId, status: capture.status }
  if (Number(merchantOrder.amount) !== Number(captureData.amount.value)) throw new Error("Captured amount does not match the merchant order")
  if (merchantOrder.scenarioRunId) {
    const [scenarioRun] = await db.select().from(scenarioRuns).where(eq(scenarioRuns.id, merchantOrder.scenarioRunId)).limit(1)
    const pendingFault = z.object({ captureResponseLost: z.literal(true) }).safeParse(scenarioRun?.result)
    if (scenarioRun?.scenarioId === "ambiguous-retry" && pendingFault.success) {
      await db.update(scenarioRuns).set({ status: "retry_required", result: { orderId, captureResponseLost: false, localFaultTriggered: true } }).where(eq(scenarioRuns.id, scenarioRun.id))
      await db.insert(traceEvents).values({ id: crypto.randomUUID(), scenarioRunId: scenarioRun.id, source: "agentproof-fault-injection", eventType: "LOCAL_NETWORK_FAULT", details: { operation: "capture", paypalOperationSucceeded: true, responseDeliveredToMerchant: false } })
      throw new LocalNetworkFault("Capture succeeded in PayPal Sandbox, but the configured local response-loss fault interrupted the merchant response. Retry this order to reconcile using the same PayPal-Request-Id.")
    }
  }
  const inserted = await db.insert(paypalCaptures).values({ id: crypto.randomUUID(), merchantOrderId: mapping.merchantOrderId, captureId: captureData.id, amount: captureData.amount.value, status: captureData.status }).onConflictDoNothing().returning({ id: paypalCaptures.id })
  if (inserted.length === 0) return { orderId, captureId: captureData.id, status: captureData.status }
  const vulnerable = isDuplicateFulfillmentEnabled()
  const fulfillmentCount = vulnerable ? 2 : 1
  await db.update(merchantOrders).set({ status: "COMPLETED", fulfillmentCount }).where(eq(merchantOrders.id, mapping.merchantOrderId))
  const [scenarioRun] = await db.select().from(scenarioRuns).where(eq(scenarioRuns.id, merchantOrder.scenarioRunId ?? "")).limit(1)
  if (scenarioRun) {
    const snapshot = { authorizedAmount: Number(merchantOrder.amount), capturedAmount: Number(captureData.amount.value), refundedAmount: 0, approvedMaximum: Number((await db.select().from(businessIntents).where(eq(businessIntents.id, merchantOrder.intentId)).limit(1))[0]?.approvedMaximum ?? 0), successfulCaptures: 1, fulfillmentCount, duplicateWebhookEffects: 0, paymentState: "CAPTURED" as const, paypalState: "CAPTURED", merchantState: "CAPTURED", intentCount: 1, financialEffects: 1, evidenceIds: [captureData.id] }
    const results = evaluateFinancialInvariants(snapshot)
    await db.insert(invariantResults).values(results.map((result) => ({ id: crypto.randomUUID(), scenarioRunId: scenarioRun.id, invariantId: result.id, passed: result.passed, severity: result.severity, evidenceIds: [...result.evidenceIds], explanation: result.explanation })))
    await db.update(scenarioRuns).set({ status: results.every((result) => result.passed) ? "passed" : "failed", result: { orderId, captureId: captureData.id, invariantCount: results.length } }).where(eq(scenarioRuns.id, scenarioRun.id))
  }
  await db.insert(traceEvents).values({ id: crypto.randomUUID(), sessionId, scenarioRunId: merchantOrder.scenarioRunId, source: "paypal", eventType: "PAYMENT.CAPTURE.COMPLETED", details: { orderId, captureId: captureData.id, amount: captureData.amount.value, fulfillmentCount } })
  return { orderId, captureId: captureData.id, status: captureData.status }
}

export class LocalNetworkFault extends Error {
  constructor(message: string) { super(message); this.name = "LocalNetworkFault" }
}

export async function retrieveOrder(orderId: string, sessionId = "demo-session"): Promise<unknown> {
  if (!db) throw new Error("Database is unavailable")
  const [mapping] = await db.select().from(paypalOrders).where(eq(paypalOrders.paypalOrderId, orderId)).limit(1)
  const [merchantOrder] = mapping ? await db.select().from(merchantOrders).where(eq(merchantOrders.id, mapping.merchantOrderId)).limit(1) : []
  const [intent] = merchantOrder ? await db.select().from(businessIntents).where(eq(businessIntents.id, merchantOrder.intentId)).limit(1) : []
  if (!intent || intent.sessionId !== sessionId) throw new RangeError("PayPal order belongs to a different testing session")
  return getOrder(orderId)
}

export async function requestRefund(captureId: string, amount?: number, sessionId = "demo-session"): Promise<{ readonly refundId: string; readonly status: string }> {
  if (!db) throw new Error("Database is unavailable")
  return db.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${captureId}))`)
    const [capture] = await transaction.select().from(paypalCaptures).where(eq(paypalCaptures.captureId, captureId)).limit(1)
    if (!capture) throw new RangeError("A refund requires a captured PayPal payment")
    const [merchantOrder] = await transaction.select().from(merchantOrders).where(eq(merchantOrders.id, capture.merchantOrderId)).limit(1)
    const [intent] = merchantOrder ? await transaction.select().from(businessIntents).where(eq(businessIntents.id, merchantOrder.intentId)).limit(1) : []
    if (!intent || intent.sessionId !== sessionId) throw new RangeError("Capture belongs to a different testing session")
    const refundAmount = amount ?? Number(capture.amount)
    const totals = await transaction.select({ refunded: sql<string>`coalesce(sum(${paypalRefunds.amount}), 0)` }).from(paypalRefunds).where(eq(paypalRefunds.captureId, captureId))
    if (Number(totals[0]?.refunded ?? 0) + refundAmount > Number(capture.amount)) throw new RangeError("Refund total would exceed captured amount")
    const refund = await refundCapture(captureId, `agentproof-refund-${captureId}-${amount?.toFixed(2) ?? "full"}`, amount)
    await transaction.insert(paypalRefunds).values({ id: crypto.randomUUID(), captureId, refundId: refund.id, amount: refundAmount.toFixed(2), status: refund.status }).onConflictDoNothing()
    await transaction.insert(traceEvents).values({ id: crypto.randomUUID(), source: "paypal", eventType: "PAYMENT.CAPTURE.REFUNDED", details: { captureId, refundId: refund.id, amount: refundAmount, status: refund.status } })
    return { refundId: refund.id, status: refund.status }
  })
}

export async function saveIncident(input: { readonly scenarioRunId: string; readonly summary: string; readonly remediation: string; readonly aiGenerated: boolean }): Promise<void> {
  if (!db) throw new Error("Database is unavailable")
  await db.insert(incidentReports).values({ id: crypto.randomUUID(), ...input })
}
