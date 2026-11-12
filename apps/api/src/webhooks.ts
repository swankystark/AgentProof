import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "./db/client"
import { paypalCaptures, paypalOrders, paypalWebhookEvents, traceEvents, merchantOrders, businessIntents } from "./db/schema"
import { verifyWebhook } from "./paypal"

const paypalEventSchema = z.object({ id: z.string().min(1), event_type: z.string().min(1), resource: z.object({ id: z.string().optional(), status: z.string().optional(), supplementary_data: z.object({ related_ids: z.object({ order_id: z.string().optional() }).optional() }).optional(), amount: z.object({ value: z.string().optional() }).optional() }).optional() })

export async function receiveWebhook(headers: Headers, payload: unknown): Promise<{ readonly accepted: boolean; readonly duplicate: boolean }> {
  if (!db) throw new Error("Database is unavailable")
  const parsed = paypalEventSchema.safeParse(payload)
  if (!parsed.success) throw new TypeError("Malformed PayPal webhook event")
  const event = parsed.data
  if (!(await verifyWebhook(headers, event))) return { accepted: false, duplicate: false }
  const inserted = await db.insert(paypalWebhookEvents).values({ id: event.id, eventType: event.event_type, payload: event }).onConflictDoNothing().returning({ id: paypalWebhookEvents.id })
  if (inserted.length === 0) return { accepted: true, duplicate: true }
  const resource = event.resource
  const eventType = event.event_type
  let associatedSessionId: string | null = null
  const orderId = resource?.supplementary_data?.related_ids?.order_id
  if (orderId) {
    const [mapping] = await db.select().from(paypalOrders).where(eq(paypalOrders.paypalOrderId, orderId)).limit(1)
    if (mapping) {
      const [order] = await db.select().from(merchantOrders).where(eq(merchantOrders.id, mapping.merchantOrderId)).limit(1)
      if (order) {
        const [intent] = await db.select().from(businessIntents).where(eq(businessIntents.id, order.intentId)).limit(1)
        if (intent) associatedSessionId = intent.sessionId
      }
    }
  }
  await db.insert(traceEvents).values({ id: crypto.randomUUID(), sessionId: associatedSessionId, source: "paypal-webhook", eventType, details: { paypalEventId: event.id, resourceId: resource?.id ?? "unknown", signatureVerified: true, duplicate: false } })
  if (eventType === "PAYMENT.CAPTURE.COMPLETED" && resource?.id) {
    const orderId = resource.supplementary_data?.related_ids?.order_id
    if (orderId) {
      const [mapping] = await db.select().from(paypalOrders).where(eq(paypalOrders.paypalOrderId, orderId)).limit(1)
      if (mapping) {
        const captured = await db.insert(paypalCaptures).values({ id: crypto.randomUUID(), merchantOrderId: mapping.merchantOrderId, captureId: resource.id, amount: resource.amount?.value ?? "0.00", status: "COMPLETED" }).onConflictDoNothing().returning({ id: paypalCaptures.id })
        if (captured.length > 0) await db.update(merchantOrders).set({ status: "COMPLETED", fulfillmentCount: 1 }).where(eq(merchantOrders.id, mapping.merchantOrderId))
      }
    }
  }
  return { accepted: true, duplicate: false }
}
