import ky from "ky"
import { config, paypalConfigured } from "./config"

const paypalBase = "https://api-m.sandbox.paypal.com"
type TokenResponse = { readonly access_token: string; readonly expires_in: number }
type PayPalOrder = { readonly id: string; readonly status: string; readonly links: readonly { readonly rel: string; readonly href: string }[] }
type PayPalCapture = { readonly id: string; readonly status: string; readonly purchase_units?: readonly { readonly payments?: { readonly captures?: readonly { readonly id: string; readonly status: string; readonly amount: { readonly value: string; readonly currency_code: string } }[] } }[] }
type PayPalRefund = { readonly id: string; readonly status: string }
type TokenCache = { readonly token: string; readonly expiresAt: number }

let tokenCache: TokenCache | undefined

export class PayPalError extends Error {
  constructor(readonly status: number, message: string, readonly debugId?: string) {
    super(message)
    this.name = "PayPalError"
  }
}

async function accessToken(): Promise<string> {
  if (!paypalConfigured || !config.PAYPAL_CLIENT_ID || !config.PAYPAL_CLIENT_SECRET) throw new PayPalError(503, "PayPal Sandbox credentials are not configured")
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token
  const response = await ky.post(`${paypalBase}/v1/oauth2/token`, {
    headers: { Authorization: `Basic ${Buffer.from(`${config.PAYPAL_CLIENT_ID}:${config.PAYPAL_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials", timeout: 15_000, retry: 0,
  }).json<TokenResponse>()
  tokenCache = { token: response.access_token, expiresAt: Date.now() + response.expires_in * 1000 }
  return tokenCache.token
}

async function paypalRequest<T>(path: string, options: { readonly method: "GET" | "POST"; readonly body?: unknown; readonly requestId?: string; readonly mockCode?: string }): Promise<T> {
  const token = await accessToken()
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  if (options.requestId) headers["PayPal-Request-Id"] = options.requestId
  if (options.mockCode && config.PAYPAL_NEGATIVE_TESTING === "true") headers["PayPal-Mock-Response"] = JSON.stringify({ mock_application_codes: options.mockCode })
  try {
    return await ky(`${paypalBase}${path}`, { method: options.method, headers, ...(options.body === undefined ? {} : { json: options.body }), timeout: 20_000, retry: 0 }).json<T>()
  } catch (error) {
    if (error instanceof Error && "response" in error) {
      const response = error.response
      const debugId = response instanceof Response ? response.headers.get("paypal-debug-id") ?? undefined : undefined
      const message = response instanceof Response ? `PayPal request failed (${response.status})` : "PayPal request failed"
      throw new PayPalError(response instanceof Response ? response.status : 502, message, debugId)
    }
    throw error
  }
}

export async function createOrder(input: { readonly intentId: string; readonly amount: number; readonly currency: "USD"; readonly mockCode?: string }): Promise<PayPalOrder> {
  return createOrderWithIntent({ ...input, intent: "CAPTURE" })
}

export async function createAuthorizationOrder(input: { readonly intentId: string; readonly amount: number; readonly currency: "USD" }): Promise<PayPalOrder> {
  return createOrderWithIntent({ ...input, intent: "AUTHORIZE" })
}

async function createOrderWithIntent(input: { readonly intentId: string; readonly amount: number; readonly currency: "USD"; readonly intent: "CAPTURE" | "AUTHORIZE"; readonly mockCode?: string }): Promise<PayPalOrder> {
  const units = [{ reference_id: input.intentId, invoice_id: input.intentId.slice(0, 127), amount: { currency_code: input.currency, value: input.amount.toFixed(2) } }]
  return paypalRequest<PayPalOrder>("/v2/checkout/orders", { method: "POST", body: { intent: input.intent, purchase_units: units, application_context: { brand_name: "AgentProof Demo Merchant", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING" } }, requestId: `agentproof-order-${input.intentId}`, ...(input.mockCode === undefined ? {} : { mockCode: input.mockCode }) })
}

export async function captureOrder(orderId: string, requestId: string): Promise<PayPalCapture> {
  return paypalRequest<PayPalCapture>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", body: {}, requestId })
}

type PayPalAuthorization = { readonly id: string; readonly status: string; readonly amount: { readonly value: string; readonly currency_code: string } }

export async function authorizeOrder(orderId: string, requestId: string): Promise<{ readonly status: string; readonly purchase_units?: readonly { readonly payments?: { readonly authorizations?: readonly PayPalAuthorization[] } }[] }> {
  return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, { method: "POST", body: {}, requestId })
}

export async function captureAuthorization(authorizationId: string, requestId: string): Promise<PayPalCapture> {
  return paypalRequest(`/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`, { method: "POST", body: {}, requestId })
}

export async function voidAuthorization(authorizationId: string, requestId: string): Promise<{ readonly id: string; readonly status: string }> {
  return paypalRequest(`/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, { method: "POST", body: {}, requestId })
}

export async function getOrder(orderId: string): Promise<PayPalOrder> {
  return paypalRequest<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" })
}

export async function refundCapture(captureId: string, requestId: string, amount?: number): Promise<PayPalRefund> {
  return paypalRequest<PayPalRefund>(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, { method: "POST", body: amount === undefined ? {} : { amount: { value: amount.toFixed(2), currency_code: "USD" } }, requestId })
}

export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  if (!config.PAYPAL_WEBHOOK_ID) return false
  const transmissionId = headers.get("paypal-transmission-id")
  const transmissionTime = headers.get("paypal-transmission-time")
  const certUrl = headers.get("paypal-cert-url")
  const authAlgo = headers.get("paypal-auth-algo")
  const transmissionSig = headers.get("paypal-transmission-sig")
  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) return false
  const result = await paypalRequest<{ readonly verification_status: string }>("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: { auth_algo: authAlgo, cert_url: certUrl, transmission_id: transmissionId, transmission_sig: transmissionSig, transmission_time: transmissionTime, webhook_id: config.PAYPAL_WEBHOOK_ID, webhook_event: event },
  })
  return result.verification_status === "SUCCESS"
}

export async function oauthHealth(): Promise<boolean> {
  await accessToken()
  return true
}
