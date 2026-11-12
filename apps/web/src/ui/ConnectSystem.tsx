import { useEffect, useState } from "react"
import { Activity, ArrowRight, CheckCircle2, CircleAlert, LoaderCircle, RefreshCw, ShieldCheck, Trash2 } from "lucide-react"
import { api, extractErrorMessage } from "../api"

type ServiceHealth = { readonly configured: boolean; readonly connected?: boolean; readonly mode?: string }
type Health = { readonly services: { readonly database: ServiceHealth; readonly paypal: ServiceHealth; readonly ai: ServiceHealth; readonly webhook: ServiceHealth; readonly agStudio?: ServiceHealth } }
type TestingSession = { readonly id: string; readonly connectedSystem: string; readonly status: string; readonly currentStep: string; readonly updatedAt: string }

export function ConnectSystem({ onOpenSession }: { readonly onOpenSession: (sessionId: string, step: string) => void }) {
  const [health, setHealth] = useState<Health | null>(null)
  const [sessions, setSessions] = useState<readonly TestingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")

  const refresh = async () => {
    setChecking(true)
    setError("")
    try {
      const [serviceStatus, sessionList] = await Promise.all([
        api.get("health").json<Health>(),
        api.get("api/testing-sessions").json<{ readonly sessions: readonly TestingSession[] }>(),
      ])
      setHealth(serviceStatus)
      setSessions(sessionList.sessions)
    } catch (cause) {
      setError(await extractErrorMessage(cause, "Could not check the payment system connection"))
    } finally {
      setLoading(false)
      setChecking(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const connected = health?.services.database.connected === true && health.services.paypal.connected === true

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await api.delete(`api/testing-sessions/${sessionId}`)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    } catch {
      // ignore
    }
  }

  const startSession = async () => {
    setCreating(true)
    setError("")
    try {
      const response = await api.post("api/testing-sessions", { json: { connectedSystem: "northstar-reference" } }).json<{ readonly session: TestingSession }>()
      onOpenSession(response.session.id, response.session.currentStep)
    } catch (cause) {
      setError(await extractErrorMessage(cause, "Could not start a testing session"))
    } finally {
      setCreating(false)
    }
  }

  return <div className="page-wrap connect-page">
    <div className="page-heading">
      <div><div className="eyebrow"><span className="live-pip" /> GET STARTED <span className="heading-divider">/</span> CONNECTION</div><h1>Connect your payment system.</h1><p>We’ll check the included Northstar Goods reference merchant and PayPal Sandbox before creating a testing session.</p></div>
      <button className="button button-secondary" onClick={() => void refresh()} disabled={checking}>{checking ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />} Check connection</button>
    </div>
    {error && <div className="inline-alert error"><CircleAlert size={15} /><span>{error}</span><button onClick={() => void refresh()}>Retry</button></div>}
    <section className="panel connection-panel">
      <div className="connection-system-mark"><ShieldCheck size={24} /></div>
      <div className="connection-system-copy"><div className="eyebrow">SUPPORTED REFERENCE INTEGRATION</div><h2>Northstar Goods + PayPal Sandbox</h2><p>AgentProof currently tests its included reference merchant. This check verifies the API, database, and Sandbox credentials. No payment is created here.</p></div>
      <div className={`connection-state ${connected ? "is-connected" : "is-disconnected"}`}><span />{loading ? "Checking" : connected ? "Connected" : "Needs attention"}</div>
      <div className="connection-checks">
        <ConnectionCheck label="AgentProof API" ok={Boolean(health)} loading={loading} />
        <ConnectionCheck label="PostgreSQL" ok={health?.services.database.connected === true} loading={loading} />
        <ConnectionCheck label="PayPal Sandbox" ok={health?.services.paypal.connected === true} loading={loading} />
        <ConnectionCheck label="Webhook verification" ok={health?.services.webhook.configured === true} loading={loading} optional />
      </div>
      {!connected && !loading && <p className="connection-help">A testing session needs the API, database, and PayPal Sandbox to be connected. Webhooks are optional for the local scenario-testing path.</p>}
      <div className="connection-actions"><span>Checkout requires your approval; AgentProof will not create a payment automatically.</span><button className="button button-primary" disabled={!connected || creating} onClick={() => void startSession()}>{creating ? <LoaderCircle size={15} className="spin" /> : <ArrowRight size={15} />} Start testing session</button></div>
    </section>
    <section className="sessions-section">
      <div className="section-title-row"><div><div className="eyebrow">YOUR WORK</div><h2>Testing sessions</h2></div><span>{sessions.length} saved</span></div>
      {loading ? <div className="empty-state"><LoaderCircle size={17} className="spin" /> Loading sessions…</div> : sessions.length ? <div className="session-list">{sessions.map((session) => <article className="session-row" key={session.id}><div className="session-row-icon"><Activity size={17} /></div><div className="session-row-copy"><b>Northstar Goods</b><span>{session.status.replaceAll("_", " ")} · Updated {new Date(session.updatedAt).toLocaleString()}</span></div><span className="session-step-label">{stepLabel(session.currentStep)}</span><div style={{ display: "flex", gap: "6px" }}><button className="button button-secondary button-small" onClick={() => onOpenSession(session.id, session.currentStep)}>Resume <ArrowRight size={13} /></button><button className="button button-secondary button-small" title="Delete session" onClick={(e) => void deleteSession(session.id, e)}><Trash2 size={13} color="var(--status-error, #dc2626)" /></button></div></article>)}</div> : <div className="empty-state">No testing sessions yet. Check the connection to start one.</div>}
    </section>
  </div>
}

function ConnectionCheck({ label, ok, loading, optional = false }: { readonly label: string; readonly ok: boolean; readonly loading: boolean; readonly optional?: boolean }) {
  return <div className={`connection-check ${ok ? "is-ok" : ""}`}><span>{loading ? <LoaderCircle size={14} className="spin" /> : ok ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}</span><b>{label}</b><small>{loading ? "Checking" : ok ? "Ready" : optional ? "Optional, not configured" : "Not connected"}</small></div>
}

function stepLabel(step: string) {
  const labels: Record<string, string> = { connect_system: "Connect system", create_order: "Create order", verify_payment: "Verify payment", run_scenarios: "Run scenarios", results: "Results & evidence", final_report: "Final report" }
  return labels[step] ?? "Connect system"
}