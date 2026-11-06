import { useCallback, useEffect, useMemo, useState } from "react"
import { api } from "../api"
import { AllCommunityModule } from "ag-grid-community"
import { AgGridReact, AgGridProvider } from "ag-grid-react"
import type { ColDef } from "ag-grid-community"
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bot, Check, ChevronDown, CircleAlert, CircleCheck, Clock3, ExternalLink, Play, Plus, Radar, RotateCcw, ShieldAlert, Sparkles, TriangleAlert } from "lucide-react"
import type { RedTeamScenario, Readiness } from "@agentproof/contracts"

type Health = { readonly services: { readonly database: { readonly connected: boolean }; readonly paypal: { readonly configured: boolean; readonly connected: boolean }; readonly ai: { readonly configured: boolean }; readonly webhook: { readonly configured: boolean }; readonly agGrid: { readonly configured: boolean }; readonly agStudio?: { readonly configured: boolean; readonly mode: string } } }
type DashboardData = { readonly scenarios: readonly RedTeamScenario[]; readonly readiness: Readiness; readonly traces: readonly TraceRow[] }
type TraceRow = { readonly id: string; readonly source: string; readonly eventType: string; readonly createdAt: string }
type RunInfo = { readonly runId: string; readonly status: string; readonly detail: string; readonly approveUrl?: string; readonly orderId?: string; readonly scenarioId?: string; readonly captureId?: string }
type BuyerResult = { readonly summary: string; readonly toolCalls: readonly string[]; readonly checkoutUrl?: string }

const statusLabels: Record<string, string> = { "ambiguous-retry": "CRITICAL", "price-drift": "CRITICAL", "webhook-replay": "HIGH", "prompt-injection": "CRITICAL", "refund-chaos": "HIGH" }
export function Dashboard({ onOpenMerchant, onOpenChaos }: { readonly onOpenMerchant: () => void; readonly onOpenChaos: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("")
  const [run, setRun] = useState<RunInfo | null>(null)
  const [buyer, setBuyer] = useState<BuyerResult | null>(null)
  const [filter, setFilter] = useState("all")
  const refresh = useCallback(async () => {
    try {
      const [dashboard, status] = await Promise.all([api.get("api/dashboard").json<DashboardData>(), api.get("health").json<Health>()])
      setData(dashboard)
      setHealth(status)
      setError("")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The API could not be reached") }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  const columns = useMemo<ColDef<TraceRow>[]>(() => [
    { field: "createdAt", headerName: "TIME", width: 170, valueFormatter: (params) => params.value ? new Date(params.value).toLocaleString() : "—" },
    { field: "source", headerName: "SOURCE", width: 145 },
    { field: "eventType", headerName: "EVENT", flex: 1, minWidth: 220 },
    { field: "id", headerName: "EVIDENCE ID", width: 240 },
  ], [])
  const startRun = async (scenario: RedTeamScenario, mode: "analysis" | "sandbox") => {
    setBusy(scenario.id)
    try {
      const result = await api.post(`api/scenarios/${scenario.id}/run`, { json: { scenarioId: scenario.id, mode } }).json<RunInfo>()
      setRun({ ...result, scenarioId: scenario.id })
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start scenario") }
    finally { setBusy("") }
  }
  const captureSandboxOrder = async () => {
    const orderId = run?.orderId
    if (!orderId || !run) return
    setBusy("capture")
    try {
      const result = await api.post(`api/merchant/orders/${encodeURIComponent(orderId)}/capture`).json<{ readonly captureId?: string; readonly status: string }>()
      setRun({ ...run, status: result.status === "COMPLETED" ? "captured" : result.status.toLowerCase(), ...(result.captureId ? { captureId: result.captureId } : {}), detail: result.captureId ? `PayPal Sandbox confirmed capture ${result.captureId}. Deterministic invariant results are being refreshed.` : `PayPal order status: ${result.status}.` })
      await refresh()
    } catch (cause) {
      setRun({ ...run, status: "retry_required", detail: cause instanceof Error ? cause.message : "Capture response was interrupted; retry with the same idempotency key." })
    } finally { setBusy("") }
  }
  const runBuyer = async () => {
    setBusy("buyer")
    try {
      setBuyer(await api.post("api/agent/buy", { json: { objective: "Find one pair of comfortable studio headphones for less than $100 and start checkout", spendingCeiling: 100, preferences: ["comfortable", "audio"], restrictions: ["one item only", "do not exceed $100"], persona: "Maya Chen, budget optimizer" } }).json<BuyerResult>())
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Buyer agent is unavailable") }
    finally { setBusy("") }
  }
  const scenarios = data?.scenarios ?? []
  const filteredScenarios = scenarios.filter((scenario) => filter === "all" || statusLabels[scenario.id]?.toLowerCase() === filter)
  const score = data?.readiness.score ?? 0
  const services = health?.services

  return <div className="dashboard page-wrap">
    <div className="page-heading"><div><div className="eyebrow"><span className="live-pip" /> PAYMENT RESILIENCE <span className="heading-divider">/</span> OVERVIEW</div><h1>Find the schedule you missed.</h1><p>Systematically explore how agentic payments fail across retries, webhooks and workers.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={onOpenMerchant}><ExternalLink size={15} /> Reference merchant</button><button className="button button-primary" disabled={!services?.database.connected} onClick={onOpenChaos}><Play size={15} fill="currentColor" /> Start chaos campaign <ChevronDown size={14} /></button></div></div>
    {error && <div className="inline-alert error"><CircleAlert size={16} /><span>{error}. Start PostgreSQL and the API to enable persisted runs.</span><button onClick={() => void refresh()}>Retry</button></div>}
    <div className="status-strip"><div className="status-strip-label"><span className="status-dot status-dot--amber" /> INTEGRATION STATUS</div><ServicePill name="PayPal Sandbox" ok={services?.paypal.connected ?? false} pending={services?.paypal.configured === false} /><ServicePill name="PostgreSQL" ok={services?.database.connected ?? false} pending={services?.database.connected === false} /><ServicePill name="Gemini AI" ok={services?.ai.configured ?? false} pending={services?.ai.configured === false} /><ServicePill name="Webhooks" ok={services?.webhook.configured ?? false} pending={services?.webhook.configured === false} /><ServicePill name="AG Studio" ok={services?.agStudio?.configured ?? false} pending /></div>
    <section className="metrics-grid" aria-label="Readiness metrics">
      <article className="metric-card score-card"><div className="metric-head"><span>PAYMENT RESILIENCE</span><span className="metric-icon"><Radar size={17} /></span></div><div className="score-row"><div className="score-value">{score}<small>/100</small></div><div className="score-change"><ArrowUpRight size={13} /> invariant score</div></div><div className="score-track"><span style={{ width: `${score}%` }} /></div><div className="metric-foot"><span>{score ? "Based on deterministic invariant evidence" : "Run a campaign to explore payment schedules"}</span><ArrowRight size={14} /></div></article>
      <MetricCard title="CRITICAL FAILURES" value={data?.readiness.critical ?? 0} tone="red" icon={<ShieldAlert size={17} />} detail="Require immediate attention" trend={<ArrowDownRight size={13} />} />
      <MetricCard title="WARNINGS" value={data?.readiness.warnings ?? 0} tone="amber" icon={<TriangleAlert size={17} />} detail="Potential risk detected" />
      <MetricCard title="INVARIANTS PASSED" value={data?.readiness.passes ?? 0} tone="green" icon={<CircleCheck size={17} />} detail="Deterministic checks verified" trend={<ArrowUpRight size={13} />} />
    </section>
    {run && <div className="run-banner"><div className="run-banner-icon"><CircleCheck size={17} /></div><div><b>{run.orderId ? "Sandbox order" : "Preflight"} · {run.status.replaceAll("_", " ")}</b><p>{run.detail}</p></div>{run.approveUrl && <a className="button button-secondary button-small" href={run.approveUrl} target="_blank" rel="noreferrer">Approve at PayPal <ExternalLink size={12} /></a>}{run.orderId && !run.captureId && <button className="button button-primary button-small" disabled={busy === "capture"} onClick={() => void captureSandboxOrder()}>{busy === "capture" ? "Capturing…" : run.status === "retry_required" ? "Retry capture" : "Capture approved order"}</button>}<button className="icon-button" aria-label="Dismiss" onClick={() => setRun(null)}>×</button></div>}
    <div className="content-grid">
      <section className="panel scenarios-panel"><div className="panel-heading"><div><h2>Red team scenarios</h2><p>Attack paths built around real agentic-commerce failure modes.</p></div><button className="button button-secondary button-small" onClick={() => { const injection = scenarios.find((scenario) => scenario.kind === "prompt-injection"); if (injection) void startRun(injection, "analysis") }}><Plus size={14} /> New scenario</button></div>
        <div className="scenario-toolbar"><div className="segmented-control"><button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>All <span>{scenarios.length}</span></button><button className={filter === "critical" ? "selected" : ""} onClick={() => setFilter("critical")}>Critical</button><button className={filter === "high" ? "selected" : ""} onClick={() => setFilter("high")}>High</button></div><button className="text-button" onClick={() => void refresh()}><RotateCcw size={13} /> Refresh</button></div>
        <div className="scenario-list">{filteredScenarios.map((scenario) => <ScenarioCard key={scenario.id} scenario={scenario} running={busy === scenario.id} onRun={() => void startRun(scenario, "sandbox")} />)}{!filteredScenarios.length && <div className="empty-state">No scenarios match this filter.</div>}</div>
        <div className="scenario-footer"><span><span className="footer-indicator" /> PREDEFINED · REPRODUCIBLE</span><button className="text-button" onClick={() => void api.post("api/scenarios/generate", { json: { context: "A new sandbox purchase with bounded human approval" } }).then(() => refresh()).catch(() => setError("Gemini scenario generation is unavailable; check the service status."))}><Sparkles size={13} /> Generate with AI <ArrowRight size={13} /></button></div>
      </section>
      <section className="side-stack"><div className="panel agent-panel"><div className="panel-heading"><div><h2>Buyer agents</h2><p>Personas ready to test</p></div><button className="icon-button" aria-label="More buyer agents"><ChevronDown size={16} /></button></div><div className="agent-list"><AgentRow initials="MC" name="Maya Chen" role="Budget optimizer" tint="lilac" tags={["Price sensitive", "Compares options"]} /><AgentRow initials="ER" name="Eli Reyes" role="Impatient retryer" tint="peach" tags={["Fast checkout", "Retries quickly"]} /><AgentRow initials="SK" name="Sam Kim" role="Security skeptic" tint="mint" tags={["Strict intent", "Injection aware"]} /></div><div className="agent-foot"><span><span className="online-dot" /> 3 agents available</span><button className="text-button" onClick={() => void runBuyer()} disabled={busy === "buyer"}>{busy === "buyer" ? "Running…" : "Run buyer agent"} <ArrowRight size={13} /></button></div>{buyer && <div className="buyer-result"><b>Agent decision</b><p>{buyer.summary}</p><span>TOOLS · {buyer.toolCalls.join(" → ") || "none"}</span>{buyer.checkoutUrl && <a href={buyer.checkoutUrl} target="_blank" rel="noreferrer">Review PayPal Sandbox checkout <ExternalLink size={12} /></a>}</div>}</div>
        <div className="panel trace-summary"><div className="panel-heading"><div><h2>Payment trace</h2><p>Latest Sandbox activity</p></div><span className="trace-live"><span /> LIVE</span></div><div className="trace-empty">{data?.traces.length ? <><div className="trace-event"><span className="trace-line" /><div><b>{data.traces[0]?.eventType}</b><small>{data.traces[0]?.source} · {new Date(data.traces[0]?.createdAt ?? "").toLocaleTimeString()}</small></div><CircleCheck size={15} /></div></> : <div className="no-trace"><div className="trace-icon"><Activity size={17} /></div><b>No payment events yet</b><span>Sandbox orders appear here after buyer approval.</span></div>}</div><button className="panel-link" onClick={onOpenMerchant}>Open merchant checkout <ArrowRight size={14} /></button></div>
      </section>
    </div>
    <section className="panel evidence-panel"><div className="panel-heading"><div><h2>Evidence log</h2><p>Verifiable events from scenario and payment processing.</p></div><div className="evidence-actions"><span className="evidence-count">{data?.traces.length ?? 0} EVENTS</span><button className="text-button">Export <ArrowUpRight size={13} /></button></div></div><div className="grid-host"><AgGridProvider modules={[AllCommunityModule]}><AgGridReact rowData={[...(data?.traces ?? [])]} columnDefs={columns} domLayout="autoHeight" suppressCellFocus pagination paginationPageSize={5} overlayNoRowsTemplate="No evidence has been recorded yet." /></AgGridProvider></div></section>
    <section className="principle-note"><div className="principle-icon"><Bot size={16} /></div><p><b>AI generates the chaos. Deterministic code decides what is true.</b> Every financial finding is backed by invariant checks and traceable evidence.</p><span>DESIGN PRINCIPLE</span></section>
  </div>
}

function ServicePill({ name, ok, pending }: { readonly name: string; readonly ok: boolean; readonly pending?: boolean }) {
  return <div className={`service-pill ${ok ? "is-ok" : "is-pending"}`}><span className="service-dot" />{name}<span className="service-state">{ok ? "Connected" : pending ? "Not configured" : "Offline"}</span></div>
}

function MetricCard({ title, value, tone, icon, detail, trend }: { readonly title: string; readonly value: number; readonly tone: string; readonly icon: React.ReactNode; readonly detail: string; readonly trend?: React.ReactNode }) {
  return <article className="metric-card"><div className="metric-head"><span>{title}</span><span className={`metric-icon ${tone}`}>{icon}</span></div><div className={`metric-number ${tone}`}>{value}</div><div className="metric-foot"><span>{detail}</span>{trend}</div></article>
}

function ScenarioCard({ scenario, running, onRun }: { readonly scenario: RedTeamScenario; readonly running: boolean; readonly onRun: () => void }) {
  const severe = scenario.severity === "critical"
  return <article className="scenario-card"><div className={`scenario-symbol ${severe ? "critical" : "high"}`}>{severe ? <ShieldAlert size={17} /> : <Clock3 size={17} />}</div><div className="scenario-main"><div className="scenario-title-line"><h3>{scenario.title}</h3><span className={`severity-badge ${severe ? "critical" : "high"}`}><span />{statusLabels[scenario.id]}</span></div><p>{scenario.objective}</p><div className="scenario-meta"><span className="persona-chip"><Bot size={12} />{scenario.buyerPersona}</span><span className="meta-separator">·</span><span>{scenario.expectedInvariants.join(" · ")}</span></div></div><button className="run-icon-button" aria-label={`Run ${scenario.title}`} disabled={running} onClick={onRun}>{running ? <span className="spinner" /> : <Play size={14} fill="currentColor" />}</button></article>
}

function AgentRow({ initials, name, role, tint, tags }: { readonly initials: string; readonly name: string; readonly role: string; readonly tint: string; readonly tags: readonly string[] }) {
  return <div className="agent-row"><div className={`agent-avatar ${tint}`}>{initials}</div><div className="agent-info"><div className="agent-name"><b>{name}</b><span className="agent-status"><Check size={10} /></span></div><span className="agent-role">{role}</span><div className="agent-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div><ArrowRight size={14} className="agent-arrow" /></div>
}
