import { useEffect, useMemo, useRef, useState } from "react"
import { api } from "../api"
import { ArrowLeft, ArrowRight, Check, CircleAlert, PackageCheck, ShieldCheck, ShoppingBag, Trash2 } from "lucide-react"

type Product = { readonly id: string; readonly name: string; readonly description: string; readonly price: number; readonly category: string; readonly inventory: number; readonly color: string }
type PublicConfig = { readonly paypalConfigured: boolean; readonly paypalClientId: string | null; readonly databaseConfigured: boolean; readonly aiConfigured: boolean }
type Intent = { readonly intentId: string }
type PayPalOrderResponse = { readonly orderId: string; readonly approveUrl: string }
type CaptureResponse = { readonly orderId: string; readonly captureId?: string; readonly status: string }
type RefundResponse = { readonly refundId: string; readonly status: string }
type DemoFaultSettings = { readonly available: boolean; readonly duplicateFulfillment: boolean }

export function Merchant() {
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
  const buttonHost = useRef<HTMLDivElement>(null)
  const total = useMemo(() => products.reduce((sum, product) => sum + product.price * (cart.get(product.id) ?? 0), 0), [products, cart])
  const count = [...cart.values()].reduce((sum, quantity) => sum + quantity, 0)

  useEffect(() => {
    Promise.all([api.get("api/catalog").json<{ readonly products: readonly Product[] }>(), api.get("api/public-config").json<PublicConfig>(), api.get("api/merchant/demo-faults").json<DemoFaultSettings>()])
      .then(([catalogue, publicConfig, faultSettings]) => { setProducts(catalogue.products); setConfig(publicConfig); setFaults(faultSettings); setError("") })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Merchant services are offline"))
  }, [])

  useEffect(() => {
    const clientId = config?.paypalClientId
    if (!clientId || !intent || capture || !buttonHost.current) return
    const script = document.createElement("script")
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`
    script.async = true
    script.onload = () => {
      if (!window.paypal || !buttonHost.current) return
      void window.paypal.Buttons({
        createOrder: async () => {
          const created = await api.post("api/merchant/orders", { json: { intentId: intent.intentId, amount: total, approvedMaximum: Number(budget), currency: "USD" } }).json<PayPalOrderResponse>()
          return created.orderId
        },
        onApprove: async (data) => {
          const result = await api.post(`api/merchant/orders/${encodeURIComponent(data.orderID)}/capture`).json<CaptureResponse>()
          setCapture(result)
          setMessage(result.captureId ? "PayPal Sandbox confirmed the capture." : `PayPal order status: ${result.status}`)
        },
        onError: (cause) => setError(cause instanceof Error ? cause.message : "PayPal Sandbox checkout failed"),
      }).render("#paypal-buttons")
    }
    script.onerror = () => setError("The PayPal Sandbox checkout SDK could not load")
    document.head.append(script)
    return () => script.remove()
  }, [config?.paypalClientId, intent, capture, total, budget])

  const changeQuantity = (id: string, delta: number) => {
    setCart((current) => {
      const next = new Map(current)
      const quantity = (next.get(id) ?? 0) + delta
      if (quantity <= 0) next.delete(id)
      else next.set(id, quantity)
      return next
    })
    setIntent(null)
    setCapture(null)
  }

  const prepareCheckout = async () => {
    setError("")
    setMessage("")
    try {
      const savedCart = await api.post("api/merchant/carts", { json: { items: [...cart].map(([productId, quantity]) => ({ productId, quantity })) } }).json<{ readonly cartId: string }>()
      const created = await api.post("api/merchant/intents", { json: { description: `Demo merchant cart · ${count} items`, approvedMaximum: Number(budget), cartId: savedCart.cartId } }).json<Intent>()
      setIntent(created)
      setMessage("Human-approved checkout intent saved. PayPal approval remains required.")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create checkout intent") }
  }

  const issueRefund = async () => {
    const captureId = capture?.captureId
    if (!captureId) return
    setError("")
    try { setRefund(await api.post("api/merchant/refunds", { json: { captureId } }).json<RefundResponse>()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Refund request failed") }
  }

  const toggleDuplicateFulfillment = async (enabled: boolean) => {
    try { setFaults(await api.put("api/merchant/demo-faults", { json: { duplicateFulfillment: enabled } }).json<DemoFaultSettings>()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Demo fault profile could not be changed") }
  }

  return <div className="merchant-page page-wrap">
    <div className="merchant-back"><ArrowLeft size={14} /><span>AGENTPROOF WORKSPACE</span><span>/</span><b>DEMO MERCHANT</b></div>
    <section className="merchant-hero"><div className="merchant-hero-copy"><div className="merchant-kicker"><span className="live-pip" /> NORTHSTAR GOODS <span className="sandbox-chip">SANDBOX</span></div><h1>Thoughtful gear.<br /><em>Tested to the edge.</em></h1><p>A small collection for better listening, brighter work, and lighter travel.</p><div className="merchant-proof"><span><ShieldCheck size={15} /> PayPal Sandbox checkout</span><span><PackageCheck size={15} /> Demo inventory</span></div></div><div className="merchant-hero-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-headphones"><span /><i /><b /></div><div className="art-caption"><span>01 / AUDIO</span><b>Designed for focus.</b></div></div></section>
    <section className={`demo-fault-control ${faults.duplicateFulfillment ? "fault-enabled" : ""}`}><div className="fault-mark"><CircleAlert size={16} /></div><div className="fault-copy"><b>Demo fault injection</b><span>Duplicate fulfillment after a successful Sandbox capture. This toggle is disabled outside demo Sandbox mode.</span></div><label className="switch-control"><input type="checkbox" checked={faults.duplicateFulfillment} disabled={!faults.available} onChange={(event) => void toggleDuplicateFulfillment(event.target.checked)} /><span className="switch-track" /><b>{faults.duplicateFulfillment ? "ENABLED" : "SAFE MODE"}</b></label></section>
    {error && <div className="inline-alert error"><CircleAlert size={16} />{error}</div>}
    <div className="merchant-section-head"><div><div className="eyebrow">THE COLLECTION <span className="heading-divider">/</span> 04 OBJECTS</div><h2>Useful by design.</h2></div><div className="cart-count"><ShoppingBag size={16} /><span>{count} in your bag</span></div></div>
    <div className="product-grid">{products.map((product, index) => <article className="product-card" key={product.id}><div className={`product-visual product-visual--${index}`} style={{ "--product-tone": product.color } as React.CSSProperties}><div className="product-shape"><span /><i /></div><span className="product-category">{product.category}</span>{(cart.get(product.id) ?? 0) > 0 && <span className="product-quantity">IN BAG · {cart.get(product.id)}</span>}</div><div className="product-copy"><div><span className="product-sku">NORTHSTAR / {String(index + 1).padStart(2, "0")}</span><h3>{product.name}</h3><p>{product.description}</p></div><div className="product-buy"><b>${product.price.toFixed(2)}</b><button className="add-button" aria-label={`Add ${product.name} to bag`} onClick={() => changeQuantity(product.id, 1)}>{(cart.get(product.id) ?? 0) > 0 ? <Check size={16} /> : <span>+</span>}</button></div></div></article>)}</div>
    <section className="checkout-section"><div className="checkout-intro"><div className="eyebrow">YOUR CHECKOUT <span className="heading-divider">/</span> HUMAN APPROVAL REQUIRED</div><h2>One clear intent.<br /><em>One safe purchase.</em></h2><p>Set the maximum you authorize. The merchant rechecks it before creating a PayPal Sandbox order.</p><div className="checkout-steps"><span><i>01</i> Set spending limit</span><ArrowRight size={13} /><span><i>02</i> Review on PayPal</span><ArrowRight size={13} /><span><i>03</i> Confirm payment</span></div></div><div className="checkout-card"><div className="checkout-card-head"><div><ShoppingBag size={17} /><b>Order summary</b></div><span>{count} ITEMS</span></div><div className="cart-lines">{products.filter((product) => cart.has(product.id)).map((product) => <div className="cart-line" key={product.id}><div><b>{product.name}</b><span>${product.price.toFixed(2)} each</span></div><div className="quantity-control"><button aria-label={`Remove one ${product.name}`} onClick={() => changeQuantity(product.id, -1)}>−</button><span>{cart.get(product.id)}</span><button aria-label={`Add one ${product.name}`} onClick={() => changeQuantity(product.id, 1)}>+</button></div><strong>${(product.price * (cart.get(product.id) ?? 0)).toFixed(2)}</strong><button className="remove-button" aria-label={`Remove ${product.name}`} onClick={() => changeQuantity(product.id, -(cart.get(product.id) ?? 0))}><Trash2 size={13} /></button></div>)}{count === 0 && <div className="cart-empty">Your bag is ready for something useful.</div>}</div><div className="budget-control"><label htmlFor="budget">MAXIMUM APPROVED SPEND</label><div className="budget-input"><span>$</span><input id="budget" type="number" min="1" max="10000" step="1" value={budget} onChange={(event) => { setBudget(event.target.value); setIntent(null) }} /><span>USD</span></div></div><div className="checkout-total"><span>Cart total</span><b>${total.toFixed(2)}</b></div><div className="checkout-guard"><ShieldCheck size={15} /><span>Final charge cannot exceed <b>${Number(budget || 0).toFixed(2)}</b> without a new approval.</span></div>
      {capture?.captureId ? <div className="payment-success"><div><Check size={17} /></div><section><b>Sandbox payment captured</b><span>Capture reference <code>{capture.captureId}</code></span></section>{refund ? <span className="refund-status">Refund {refund.status.toLowerCase()}</span> : <button className="refund-button" onClick={() => void issueRefund()}>Refund</button>}</div> : intent ? <div className="paypal-area"><div id="paypal-buttons" ref={buttonHost} /><small>PayPal approval opens in a secure Sandbox window.</small></div> : <button className="button button-primary checkout-action" disabled={count === 0 || !config?.databaseConfigured} onClick={() => void prepareCheckout()}>{count === 0 ? "Add an item to continue" : !config?.databaseConfigured ? "Database required for checkout" : "Confirm spending limit"}<ArrowRight size={15} /></button>}
      {message && <div className="checkout-message">{message}</div>}
      {!config?.paypalConfigured && <div className="integration-hint">PayPal Sandbox credentials are not configured, so checkout cannot proceed.</div>}
    </div></section>
    <div className="merchant-disclaimer"><ShieldCheck size={15} /><span>Protected by AgentProof</span><span>·</span><span>All transactions run against PayPal Sandbox only</span></div>
  </div>
}
