import { useCallback, useEffect, useMemo, useState } from "react"
import { api, extractErrorMessage } from "../api"
import { AllCommunityModule } from "ag-grid-community"
import { AgGridReact, AgGridProvider } from "ag-grid-react"
import type { ColDef } from "ag-grid-community"
import { Activity, ArrowRight, ArrowUpRight, ArrowDownRight, CircleAlert, CircleCheck, ExternalLink, Radar, ShieldAlert, TriangleAlert, ArrowUpRightFromSquare, LoaderCircle, Trash2 } from "lucide-react"
import type { Readiness } from "@agentproof/contracts"

type Health = { readonly services: { readonly database: { readonly connected: boolean }; readonly paypal: { readonly configured: boolean; readonly connected: boolean }; readonly ai: { readonly configured: boolean }; readonly webhook: { readonly configured: boolean }; readonly agGrid: { readonly configured: boolean }; readonly agStudio?: { readonly configured: boolean; readonly mode: string } } }
type DashboardData = { readonly readiness: Readiness; readonly traces: readonly TraceRow[] }
type TraceRow = { readonly id: string; readonly source: string; readonly eventType: string; readonly createdAt: string }
type SessionRow = { readonly id: string; readonly connectedSystem: string; readonly status: string; readonly currentStep: string; readonly updatedAt: string }

export function Dashboard({ onOpenMerchant, onOpenChaos, onStartSession, onOpenSession }: { readonly onOpenMerchant: () => void; readonly onOpenChaos: () => void; readonly onStartSession: () => void; readonly onOpenSession?: (sessionId: string, step: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [sessions, setSessions] = useState<readonly SessionRow[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [dashboard, sessionList] = await Promise.all([
        api.get("api/dashboard").json<DashboardData>(),
        api.get("api/testing-sessions").json<{ readonly sessions: readonly SessionRow[] }>(),
      ])
      setData(dashboard)
      setSessions(sessionList.sessions)
      setError("")
    } catch (cause) {
      setError(await extractErrorMessage(cause, "The API could not be reached"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const interval = setInterval(() => { void refresh() }, 10000)
    return () => clearInterval(interval)
  }, [refresh])

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await api.delete(`api/testing-sessions/${sessionId}`)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    } catch {
      // ignore
    }
  }

  const columns = useMemo<ColDef<TraceRow>[]>(() => [
    { field: "createdAt", headerName: "TIME", width: 170, valueFormatter: (params) => params.value ? new Date(params.value).toLocaleString() : "—" },
    { field: "source", headerName: "SOURCE", width: 145 },
    { field: "eventType", headerName: "EVENT", flex: 1, minWidth: 220 },
    { field: "id", headerName: "EVIDENCE ID", width: 240 },
  ], [])

  const score = data?.readiness.score ?? 0

  return (
    <div className="dashboard page-wrap">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="live-pip" /> PAYMENT TESTING <span className="heading-divider">/</span> OVERVIEW</div>
          <h1>Test your payment system.</h1>
          <p>Run real PayPal Sandbox payments, test edge cases, and inspect audit evidence.</p>
        </div>
        <div className="heading-actions">
          <button className="button button-primary" onClick={onStartSession}><ArrowRight size={15} /> Start testing session</button>
        </div>
      </div>

      {error && <div className="inline-alert error"><CircleAlert size={16} /><span>{error}</span><button onClick={() => void refresh()}>Retry</button></div>}

      {/* Readiness metrics */}
      <section className="metrics-grid" aria-label="Readiness metrics">
        <article className="metric-card score-card">
          <div className="metric-head"><span>PAYMENT RESILIENCE</span><span className="metric-icon"><Radar size={17} /></span></div>
          <div className="score-row"><div className="score-value">{score}<small>/100</small></div><div className="score-change"><ArrowUpRight size={13} /> test score</div></div>
          <div className="score-track"><span style={{ width: `${score}%` }} /></div>
          <div className="metric-foot"><span>{score ? "Based on completed scenario checks" : "Run scenarios to calculate resilience score"}</span><ArrowRight size={14} /></div>
        </article>
        <MetricCard title="CRITICAL FAILURES" value={data?.readiness.critical ?? 0} tone="red" icon={<ShieldAlert size={17} />} detail="Payment rule violations" trend={<ArrowDownRight size={13} />} />
        <MetricCard title="WARNINGS" value={data?.readiness.warnings ?? 0} tone="amber" icon={<TriangleAlert size={17} />} detail="Non-critical warnings" />
        <MetricCard title="TESTS PASSED" value={data?.readiness.passes ?? 0} tone="green" icon={<CircleCheck size={17} />} detail="Across all scenario runs" trend={<ArrowUpRight size={13} />} />
      </section>

      {/* Recent sessions */}
      {sessions.length > 0 && (
        <section className="sessions-section">
          <div className="section-title-row">
            <div><div className="eyebrow">YOUR WORK</div><h2>Recent testing sessions</h2></div>
            <span>{sessions.length} saved</span>
          </div>
          <div className="session-list">
            {sessions.slice(0, 5).map((session) => (
              <article className="session-row" key={session.id}>
                <div className="session-row-icon"><Activity size={17} /></div>
                <div className="session-row-copy">
                  <b>Northstar Goods</b>
                  <span>{session.status.replaceAll("_", " ")} · Updated {new Date(session.updatedAt).toLocaleString()}</span>
                </div>
                <span className="session-step-label">{stepLabel(session.currentStep)}</span>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button className="button button-secondary button-small" onClick={() => onOpenSession ? onOpenSession(session.id, session.currentStep) : onStartSession()}><ArrowUpRightFromSquare size={13} /> Resume</button>
                  <button className="button button-secondary button-small" title="Delete session" onClick={(e) => void deleteSession(session.id, e)}><Trash2 size={13} color="var(--status-error, #dc2626)" /></button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Evidence log */}
      <section className="panel evidence-panel">
        <div className="panel-heading">
          <div><h2>Evidence log</h2><p>Verifiable events from payment processing and scenario runs.</p></div>
          <div className="evidence-actions">
            <span className="evidence-count">{data?.traces.length ?? 0} EVENTS</span>
            {data?.traces.length ? (
              <button className="text-button" onClick={() => {
                const blob = new Blob([JSON.stringify(data.traces, null, 2)], { type: "application/json" })
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a"); a.href = url; a.download = `agentproof-evidence-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url)
              }}>Export <ArrowUpRight size={13} /></button>
            ) : null}
          </div>
        </div>
        {loading ? (
          <div className="empty-state"><LoaderCircle size={17} className="spin" /> Loading evidence…</div>
        ) : (
          <div className="grid-host" style={{ height: 300 }}>
            <AgGridProvider modules={[AllCommunityModule]}>
              <AgGridReact className="ag-theme-quartz" theme="legacy" rowData={[...(data?.traces ?? [])]} columnDefs={columns} suppressCellFocus pagination paginationPageSize={5} paginationPageSizeSelector={[5, 10, 20]} overlayNoRowsTemplate="No evidence recorded yet. Complete a testing session to populate this log." />
            </AgGridProvider>
          </div>
        )}
      </section>

      {/* Quick links */}
      <div className="quick-links">
        <button className="panel-link" onClick={onOpenMerchant}><ExternalLink size={14} /> Open reference merchant <ArrowRight size={14} /></button>
        <button className="panel-link" onClick={onOpenChaos}><ExternalLink size={14} /> Open Chaos Lab <ArrowRight size={14} /></button>
      </div>
    </div>
  )
}

function MetricCard({ title, value, tone, icon, detail, trend }: { readonly title: string; readonly value: number; readonly tone: string; readonly icon: React.ReactNode; readonly detail: string; readonly trend?: React.ReactNode }) {
  return <article className="metric-card"><div className="metric-head"><span>{title}</span><span className={`metric-icon ${tone}`}>{icon}</span></div><div className={`metric-number ${tone}`}>{value}</div><div className="metric-foot"><span>{detail}</span>{trend}</div></article>
}

function stepLabel(step: string) {
  const labels: Record<string, string> = { connect_system: "Connect system", create_order: "Create order", verify_payment: "Verify payment", run_scenarios: "Run scenarios", results: "Results & evidence", final_report: "Final report" }
  return labels[step] ?? "Connect system"
}
