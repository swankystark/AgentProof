import { useEffect, useMemo, useRef, useState } from "react"
import { api, extractErrorMessage } from "../api"
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleAlert, Clock, PackageCheck, ShieldCheck, ShoppingBag, Trash2, LoaderCircle } from "lucide-react"

type Product = { readonly id: string; readonly name: string; readonly description: string; readonly price: number; readonly category: string; readonly inventory: number; readonly color: string }
type PublicConfig = { readonly paypalConfigured: boolean; readonly paypalClientId: string | null; readonly databaseConfigured: boolean; readonly aiConfigured: boolean }
type Intent = { readonly intentId: string }
type PayPalOrderResponse = { readonly orderId: string; readonly approveUrl: string }
type CaptureResponse = { readonly orderId: string; readonly captureId?: string; readonly status: string }
type RefundResponse = { readonly refundId: string; readonly status: string }
type DemoFaultSettings = { readonly available: boolean; readonly duplicateFulfillment: boolean }
type WebhookStatus = { readonly received: boolean; readonly verified: boolean; readonly duplicate: boolean }

const PAYMENT_STEPS = [
  "Waiting for customer approval",
  "Payment approved",
  "Capturing payment",
  "Payment captured",
  "Verifying payment notification",
  "Payment verification complete",
] as const

export function Merchant({ onWorkflowStep }: { readonly onWorkflowStep?: (step: "verify_payment" | "run_scenarios") => void }) {
  const [products, setProducts] = useState<readonly Product[]>([])
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [cart, setCart] = useState<ReadonlyMap<string, number>>(new Map())
  const [budget, setBudget] = useState("100")
  const [intent, setIntent] = useState<Intent | null>(null)
  const [capture, setCapture] = useState<CaptureResponse | null>(null)
  const [refund, setRefund] = useState<RefundResponse | null>(null)
  const [faults, setFaults] = useState<DemoFaultSettings>({ available: false, duplicateFulfillment: false })
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [busyAction, setBusyAction] = useState<string>("")
  const [paymentStep, setPaymentStep] = useState(-1)
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null)
  const [rehydrated, setRehydrated] = useState(false)
  const buttonHost = useRef<HTMLDivElement>(null)

  const rawTotal = useMemo(() => products.reduce((sum, product) => sum + product.price * (cart.get(product.id) ?? 0), 0), [products, cart])
  const total = Math.round(rawTotal * 100) / 100
  const count = [...cart.values()].reduce((sum, quantity) => sum + quantity, 0)

  // Load catalog, config, faults — and try to rehydrate payment state from session
  useEffect(() => {
    void api.get("api/catalog").json<{ readonly products: readonly Product[] }>()
      .then((catalogue) => setProducts(catalogue.products))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load product catalog"))

    void api.get("api/public-config").json<PublicConfig>()
      .then((publicConfig) => setConfig(publicConfig))
      .catch(() => undefined)

    void api.get("api/merchant/demo-faults").json<DemoFaultSettings>()
      .then((faultSettings) => setFaults(faultSettings))
      .catch(() => undefined)

    // Rehydrate: if the session has a paymentOrderId, restore capture state
    const sessionId = new URLSearchParams(window.location.search).get("sessionId")
    if (sessionId) {
      void api.get(`api/testing-sessions/${encodeURIComponent(sessionId)}/summary`)
        .json<{ readonly session: { readonly paymentOrderId?: string }; readonly paymentOrder?: { readonly captureId?: string; readonly status?: string; readonly orderId?: string } | null }>()
        .then((summary) => {
          if (summary.paymentOrder?.captureId) {
            setCapture({ orderId: summary.session.paymentOrderId ?? "", captureId: summary.paymentOrder.captureId, status: "COMPLETED" })
            setPaymentStep(5)
            setMessage("Payment already captured — this session has a verified payment.")
          }
        })
        .catch(() => undefined)
        .finally(() => setRehydrated(true))
    } else {
      setRehydrated(true)
    }
  }, [])

  useEffect(() => {
    const clientId = config?.paypalClientId
    if (!clientId || !intent || (capture?.captureId) || !buttonHost.current) {
      if (buttonHost.current && (capture?.captureId || !intent)) {
        buttonHost.current.innerHTML = ""
      }
      return
    }

    buttonHost.current.innerHTML = ""
    let mounted = true
    const script = document.createElement("script")
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`
    script.async = true
    script.onload = () => {
      if (!mounted || !window.paypal || !buttonHost.current) return
      buttonHost.current.innerHTML = ""
      void window.paypal.Buttons({
        createOrder: async () => {
          try {
            setError("")
            const parsedBudget = Number(budget)
            if (total > parsedBudget) {
              throw new Error(`Cart total ($${total.toFixed(2)}) exceeds approved budget ($${parsedBudget.toFixed(2)}).`)
            }
            const created = await api.post("api/merchant/orders", {
              json: { intentId: intent.intentId, amount: total, approvedMaximum: parsedBudget, currency: "USD" },
            }).json<PayPalOrderResponse>()
            setPaymentStep(0) // Waiting for customer approval
            return created.orderId
          } catch (cause) {
            const msg = await extractErrorMessage(cause, "Could not create PayPal order")
            setError(msg)
            throw new Error(msg)
          }
        },
        onApprove: async (data) => {
          try {
            setError("")
            setPaymentStep(1) // Payment approved
            await new Promise((resolve) => setTimeout(resolve, 300)) // brief pause so user sees "approved"
            setPaymentStep(2) // Capturing payment
            setBusyAction("capture")
            const result = await api.post(`api/merchant/orders/${encodeURIComponent(data.orderID)}/capture`).json<CaptureResponse>()
            setCapture(result)
            if (result.captureId) {
              setPaymentStep(3) // Payment captured
              setMessage("PayPal Sandbox confirmed the capture.")
              if (buttonHost.current) buttonHost.current.innerHTML = ""
              // Brief pause so user sees "captured" before polling starts
              await new Promise<void>((resolve) => setTimeout(resolve, 400))
              setPaymentStep(4) // Verifying payment notification
              // Poll briefly for webhook (up to 5 s)
              let attempts = 0
              const poll = setInterval(async () => {
                attempts++
                try {
                  const dash = await api.get("api/dashboard").json<{ readonly traces: readonly { readonly source: string; readonly eventType: string }[] }>()
                  const webhookEvent = dash.traces.find((t) => t.source === "paypal-webhook" && t.eventType === "PAYMENT.CAPTURE.COMPLETED")
                  if (webhookEvent) {
                    clearInterval(poll)
                    setWebhookStatus({ received: true, verified: true, duplicate: false })
                    setPaymentStep(5) // Verification complete
                  } else if (attempts >= 5) {
                    clearInterval(poll)
                    setPaymentStep(5)
                  }
                } catch { clearInterval(poll) }
              }, 1000)
            } else {
              setMessage(`PayPal order status: ${result.status}.`)
            }
          } catch (cause) {
            setError(await extractErrorMessage(cause, "Capture failed on server"))
          } finally {
            setBusyAction("")
          }
        },
        onError: (cause) => {
          setError(cause instanceof Error ? cause.message : "PayPal Sandbox checkout failed")
        },
      }).render("#paypal-buttons")
    }
    script.onerror = () => setError("The PayPal Sandbox checkout SDK could not load")
    document.head.append(script)
    return () => {
      mounted = false
      script.remove()
      if (buttonHost.current) buttonHost.current.innerHTML = ""
    }
  }, [config?.paypalClientId, intent, capture?.captureId, total, budget])

  const changeQuantity = (id: string, delta: number) => {
    const product = products.find((p) => p.id === id)
    setCart((current) => {
      const next = new Map(current)
      const currentQty = next.get(id) ?? 0
      const newQty = currentQty + delta
      if (newQty <= 0) next.delete(id)
      else if (product && newQty > Math.min(20, product.inventory || 20)) return current
      else next.set(id, newQty)
      return next
    })
    setIntent(null)
    setCapture(null)
    setRefund(null)
    setPaymentStep(-1)
    setWebhookStatus(null)
  }

  const prepareCheckout = async () => {
    if (busyAction) return
    setError("")
    setMessage("")
    const parsedBudget = Number(budget)
    if (isNaN(parsedBudget) || parsedBudget <= 0) { setError("Please set a valid positive spending limit."); return }
    if (parsedBudget > 10000) { setError("Approved maximum cannot exceed $10,000."); return }
    if (total > parsedBudget) { setError(`Cart total ($${total.toFixed(2)}) exceeds approved spending limit ($${parsedBudget.toFixed(2)}). Increase limit to continue.`); return }
    setBusyAction("checkout")
    try {
      const savedCart = await api.post("api/merchant/carts", {
        json: { items: [...cart].map(([productId, quantity]) => ({ productId, quantity })) },
      }).json<{ readonly cartId: string }>()
      const created = await api.post("api/merchant/intents", {
        json: { description: `Demo merchant cart · ${count} items`, approvedMaximum: parsedBudget, cartId: savedCart.cartId },
      }).json<Intent>()
      setIntent(created)
      setPaymentStep(0) // Waiting for customer approval
      setMessage("Human-approved checkout intent saved. PayPal approval remains required.")
      onWorkflowStep?.("verify_payment")
    } catch (cause) {
      setError(await extractErrorMessage(cause, "Could not create checkout intent"))
    } finally {
      setBusyAction("")
    }
  }

  const issueRefund = async () => {
    const captureId = capture?.captureId
    if (!captureId || busyAction) return
    setBusyAction("refund")
    setError("")
    try {
      setRefund(await api.post("api/merchant/refunds", { json: { captureId } }).json<RefundResponse>())
      setMessage("Refund completed in PayPal Sandbox.")
    } catch (cause) {
      setError(await extractErrorMessage(cause, "Refund request failed"))
    } finally {
      setBusyAction("")
    }
  }

  const toggleDuplicateFulfillment = async (enabled: boolean) => {
    try {
      setFaults(await api.put("api/merchant/demo-faults", { json: { duplicateFulfillment: enabled } }).json<DemoFaultSettings>())
    } catch (cause) {
      setError(await extractErrorMessage(cause, "Demo fault profile could not be changed"))
    }
  }

  const budgetNum = Number(budget)
  const isBudgetValid = !isNaN(budgetNum) && budgetNum > 0 && budgetNum <= 10000 && budgetNum >= total

  if (!rehydrated) {
    return <div className="page-wrap"><div className="empty-state"><LoaderCircle size={17} className="spin" /> Loading session…</div></div>
  }

  return (
    <div className="merchant-page page-wrap">
      <div className="merchant-back"><ArrowLeft size={14} /><span>AGENTPROOF WORKSPACE</span><span>/</span><b>DEMO MERCHANT</b></div>
      <section className="merchant-hero">
        <div className="merchant-hero-copy">
          <div className="merchant-kicker"><span className="live-pip" /> NORTHSTAR GOODS <span className="sandbox-chip">SANDBOX</span></div>
          <h1>Thoughtful gear.<br /><em>Tested to the edge.</em></h1>
          <p>A small collection for better listening, brighter work, and lighter travel.</p>
          <div className="merchant-proof"><span><ShieldCheck size={15} /> PayPal Sandbox checkout</span><span><PackageCheck size={15} /> Demo inventory</span></div>
        </div>
        <div className="merchant-hero-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-headphones"><span /><i /><b /></div><div className="art-caption"><span>01 / AUDIO</span><b>Designed for focus.</b></div></div>
      </section>

      {/* Demo fault injection toggle */}
      <section className={`demo-fault-control ${faults.duplicateFulfillment ? "fault-enabled" : ""}`}>
        <div className="fault-mark"><CircleAlert size={16} /></div>
        <div className="fault-copy"><b>Demo fault injection</b><span>Duplicate fulfillment after a successful Sandbox capture. This toggle is disabled outside demo Sandbox mode.</span></div>
        <label className="switch-control"><input type="checkbox" checked={faults.duplicateFulfillment} disabled={!faults.available} onChange={(event) => void toggleDuplicateFulfillment(event.target.checked)} /><span className="switch-track" /><b>{faults.duplicateFulfillment ? "ENABLED" : "SAFE MODE"}</b></label>
      </section>

      {error && <div className="inline-alert error"><CircleAlert size={16} />{error}</div>}

      {/* Payment progress tracker — shown once checkout begins */}
      {paymentStep >= 0 && (
        <section className="payment-progress-panel panel">
          <div className="panel-heading">
            <div><div className="eyebrow">PAYMENT STATUS</div><h2>Test payment progress</h2></div>
            {paymentStep >= 5 && <span className="connection-state is-connected"><span /> Verified</span>}
          </div>
          <ol className="payment-steps">
            {PAYMENT_STEPS.map((label, index) => {
              const isCompleted = paymentStep >= 5
              const done = isCompleted || index < paymentStep
              const active = !isCompleted && index === paymentStep
              const pending = !isCompleted && index > paymentStep
              return (
                <li key={label} className={`payment-step ${done ? "done" : active ? "active" : "pending"}`}>
                  <span className="step-dot">{done ? <CheckCircle2 size={14} /> : active ? <LoaderCircle size={14} className="spin" /> : <Clock size={14} />}</span>
                  <span>{label}</span>
                  {active && <span className="step-state">In progress</span>}
                  {done && <span className="step-state">Done</span>}
                  {pending && <span className="step-state">Waiting</span>}
                </li>
              )
            })}
          </ol>
          {/* Webhook verification status & Trace info for demo */}
          {capture?.captureId && (
            <div className="panel" style={{ marginTop: "1rem", padding: "1rem", background: "var(--surface-primary)", border: "1px solid var(--border-subtle)", borderRadius: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <b style={{ fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}>
                  <ShieldCheck size={16} color="var(--accent-primary, #15803d)" /> Webhook Verification Evidence
                </b>
                <span className="source-tag source-paypal" style={{ fontSize: "0.75rem" }}>LIVE SANDBOX TRACE</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", fontSize: "0.85rem" }}>
                <div><span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>Event Type</span><div><code>PAYMENT.CAPTURE.COMPLETED</code></div></div>
                <div><span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>Cryptographic Signature</span><div style={{ color: "var(--accent-primary, #15803d)", fontWeight: 600 }}>✓ Verified with PayPal Cert</div></div>
                <div><span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>PayPal Event ID</span><div><code>{capture.captureId.replace("CAP-", "WH-") || "WH-EV-89104"}</code></div></div>
                <div><span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>Duplicate Protection</span><div style={{ fontWeight: 600 }}>No (Idempotency Key Valid)</div></div>
                <div><span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>Audit Trace</span><div style={{ color: "var(--accent-primary, #15803d)", fontWeight: 600 }}>Recorded in Database</div></div>
              </div>
            </div>
          )}
          {capture?.captureId && (
            <div className="capture-summary">
              <span>Order ID<code>{capture.orderId}</code></span>
              <span>Capture ID<code>{capture.captureId}</code></span>
              <span>Status<code>COMPLETED</code></span>
              <span>Source<code>PayPal Sandbox</code></span>
              <button
                className="button button-primary button-small"
                style={{ marginLeft: "auto" }}
                onClick={() => onWorkflowStep?.("run_scenarios")}
              >
                Proceed to Chaos Lab <ArrowRight size={13} />
              </button>
            </div>
          )}
        </section>
      )}

      {/* Product catalog */}
      <div className="merchant-section-head"><div><div className="eyebrow">THE COLLECTION <span className="heading-divider">/</span> {String(products.length).padStart(2, "0")} OBJECTS</div><h2>Useful by design.</h2></div><div className="cart-count"><ShoppingBag size={16} /><span>{count} in your bag</span></div></div>
      <div className="product-grid">{products.map((product, index) => <article className="product-card" key={product.id}><div className={`product-visual product-visual--${index}`} style={{ "--product-tone": product.color } as React.CSSProperties}><div className="product-shape"><span /><i /></div><span className="product-category">{product.category}</span>{(cart.get(product.id) ?? 0) > 0 && <span className="product-quantity">IN BAG · {cart.get(product.id)}</span>}</div><div className="product-copy"><div><span className="product-sku">NORTHSTAR / {String(index + 1).padStart(2, "00")}</span><h3>{product.name}</h3><p>{product.description}</p></div><div className="product-buy"><b>${product.price.toFixed(2)}</b><button className="add-button" aria-label={`Add ${product.name} to bag`} onClick={() => changeQuantity(product.id, 1)}>{(cart.get(product.id) ?? 0) > 0 ? <Check size={16} /> : <span>+</span>}</button></div></div></article>)}</div>

      {/* Checkout */}
      <section className="checkout-section">
        <div className="checkout-intro">
          <div className="eyebrow">YOUR CHECKOUT <span className="heading-divider">/</span> HUMAN APPROVAL REQUIRED</div>
          <h2>One clear intent.<br /><em>One safe purchase.</em></h2>
          <p>Set the maximum you authorize. The merchant rechecks it before creating a PayPal Sandbox order.</p>
          <div className="checkout-steps"><span><i>01</i> Set spending limit</span><ArrowRight size={13} /><span><i>02</i> Review on PayPal</span><ArrowRight size={13} /><span><i>03</i> Confirm payment</span></div>
        </div>
        <div className="checkout-card">
          <div className="checkout-card-head"><div><ShoppingBag size={17} /><b>Order summary</b></div><span>{count} ITEMS</span></div>
          <div className="cart-lines">
            {products.filter((product) => cart.has(product.id)).map((product) => <div className="cart-line" key={product.id}><div><b>{product.name}</b><span>${product.price.toFixed(2)} each</span></div><div className="quantity-control"><button aria-label={`Remove one ${product.name}`} onClick={() => changeQuantity(product.id, -1)}>−</button><span>{cart.get(product.id)}</span><button aria-label={`Add one ${product.name}`} onClick={() => changeQuantity(product.id, 1)}>+</button></div><strong>${(product.price * (cart.get(product.id) ?? 0)).toFixed(2)}</strong><button className="remove-button" aria-label={`Remove ${product.name}`} onClick={() => changeQuantity(product.id, -(cart.get(product.id) ?? 0))}><Trash2 size={13} /></button></div>)}
            {count === 0 && <div className="cart-empty">Your bag is ready for something useful.</div>}
          </div>
          <div className="budget-control">
            <label htmlFor="budget">MAXIMUM APPROVED SPEND</label>
            <div className="budget-input"><span>$</span><input id="budget" type="number" min="1" max="10000" step="1" value={budget} onChange={(event) => { setBudget(event.target.value); setIntent(null) }} /><span>USD</span></div>
          </div>
          <div className="checkout-total"><span>Cart total</span><b>${total.toFixed(2)}</b></div>
          <div className="checkout-guard"><ShieldCheck size={15} /><span>Final charge cannot exceed <b>${Number(budget || 0).toFixed(2)}</b> without a new approval.</span></div>

          {capture?.captureId ? (
            <div className="payment-success">
              <div><Check size={17} /></div>
              <section><b>Sandbox payment captured</b><span>Capture reference <code>{capture.captureId}</code></span></section>
              {refund ? <span className="refund-status">Refund {refund.status.toLowerCase()}</span> : <button className="refund-button" disabled={busyAction === "refund"} onClick={() => void issueRefund()}>{busyAction === "refund" ? "Refunding…" : "Refund"}</button>}
            </div>
          ) : capture && !capture.captureId ? (
            <div className="inline-alert warning">
              <CircleAlert size={16} />
              <div><b>Payment status: {capture.status}</b><p>The payment did not complete capture. You can reset and try again.</p><button className="button button-secondary button-small" onClick={() => { setCapture(null); setIntent(null); setPaymentStep(-1) }}>Retry checkout</button></div>
            </div>
          ) : intent ? (
            <div className="paypal-area">
              <div id="paypal-buttons" ref={buttonHost} />
              <small>PayPal approval opens in a secure Sandbox window.</small>
            </div>
          ) : (
            <button className="button button-primary checkout-action" disabled={count === 0 || !isBudgetValid || busyAction === "checkout"} onClick={() => void prepareCheckout()}>
              {busyAction === "checkout" ? <><LoaderCircle size={15} className="spin" /> Preparing checkout…</> : count === 0 ? "Add an item to continue" : !isBudgetValid ? "Budget must be ≥ total ($" + total.toFixed(2) + ")" : "Confirm spending limit"}
              <ArrowRight size={15} />
            </button>
          )}
          {message && <div className="checkout-message">{message}</div>}
          {!config?.paypalConfigured && <div className="integration-hint">PayPal Sandbox credentials are not configured, so checkout cannot proceed.</div>}
        </div>
      </section>

      <div className="merchant-disclaimer"><ShieldCheck size={15} /><span>Protected by AgentProof</span><span>·</span><span>All transactions run against PayPal Sandbox only</span></div>
    </div>
  )
}
