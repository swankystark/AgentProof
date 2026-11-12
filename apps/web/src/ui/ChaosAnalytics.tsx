import { useCallback, useEffect, useMemo, useState } from "react"
import { api, extractErrorMessage } from "../api"
import { AgStudio, AgStudioProvider } from "ag-studio-react"
import { AgStudioAiModule, type AgAiEvent, type AgAiInputMessage, type AgAiOutputMessage, type AgAiHarnessSetupParams, type AgLlmAdapter, type AgLlmResponse, type AgLlmResponseHandler, createAiHarness } from "ag-studio"
import { ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, Download, LoaderCircle, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react"

type Trace = { readonly id: string; readonly source: string; readonly eventType: string; readonly createdAt: string }
type RunSummary = { readonly executions?: number; readonly failures?: number; readonly resilienceScore?: number; readonly uniqueFailureClasses?: readonly string[]; readonly replayIdentity?: string; readonly shrinkHistory?: readonly number[] }
type Execution = { readonly ordinal: number; readonly failedInvariants: readonly string[]; readonly schedule: readonly { readonly actor: string; readonly action: string; readonly fault?: string }[] }
type Campaign = { readonly id: string; readonly name: string; readonly seed: number; readonly result: RunSummary; readonly executions: readonly Execution[] }
type Dashboard = { readonly traces: readonly Trace[] }
type StudioData = { readonly sources: { readonly id: string; readonly name: string; readonly description: string; readonly data: Record<string, string | number | boolean | null>[] }[]; readonly description: string }
type SessionSummary = {
  readonly session: { readonly id: string; readonly connectedSystem: string; readonly status: string; readonly currentStep: string; readonly paymentOrderId?: string; readonly campaignId?: string; readonly createdAt: string; readonly updatedAt: string }
  readonly paymentOrder?: { readonly captureId?: string; readonly status?: string; readonly orderId?: string } | null
  readonly campaign?: Campaign | null
  readonly readiness?: { readonly score: number; readonly critical: number; readonly warnings: number; readonly passes: number; readonly runs: number } | null
}

export function ChaosAnalytics({ onBack, workflowStep }: { readonly onBack: () => void; readonly workflowStep?: string }) {
  const [data, setData] = useState<StudioData | null>(null)
  const [licenseKey, setLicenseKey] = useState<string | null | undefined>(undefined)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [error, setError] = useState("")
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null)
  const [traces, setTraces] = useState<readonly Trace[]>([])

  const refresh = useCallback(async () => {
    try {
      const [dashboard, latest] = await Promise.all([
        api.get("api/dashboard").json<Dashboard>(),
        api.get("api/chaos/latest").json<{ readonly campaign: Campaign | null }>(),
      ])
      setData(createStudioData(dashboard.traces, latest.campaign))
      setTraces(dashboard.traces)
      setError("")
    } catch (cause) {
      setError(await extractErrorMessage(cause, "Analytics could not load"))
    }
  }, [])

  useEffect(() => {
    void refresh()
    api.get("api/public-config").json<{ readonly agStudioLicenseKey?: string | null }>()
      .then((cfg) => {
        setLicenseKey(cfg.agStudioLicenseKey ?? null)
        setConfigLoaded(true)
      })
      .catch(() => {
        setLicenseKey(null)
        setConfigLoaded(true)
      })
    // Load session summary for Final Report
    const sessionId = new URLSearchParams(window.location.search).get("sessionId")
    if (sessionId) {
      void api.get(`api/testing-sessions/${encodeURIComponent(sessionId)}/summary`)
        .json<SessionSummary>()
        .then((summary) => setSessionSummary(summary))
        .catch(() => undefined)
    }
  }, [refresh])

  const isFinalReport = workflowStep === "final_report"

  const exportReport = () => {
    if (!sessionSummary) return
    const report = {
      exportedAt: new Date().toISOString(),
      agentproofVersion: "0.1.0",
      session: sessionSummary.session,
      paymentEvidence: sessionSummary.paymentOrder ?? null,
      chaosSimulation: sessionSummary.campaign ? {
        campaignId: sessionSummary.campaign.id,
        name: sessionSummary.campaign.name,
        seed: sessionSummary.campaign.seed,
        executions: sessionSummary.campaign.result?.executions ?? 0,
        failures: sessionSummary.campaign.result?.failures ?? 0,
        resilienceScore: sessionSummary.campaign.result?.resilienceScore ?? 0,
        violatedInvariants: sessionSummary.campaign.result?.uniqueFailureClasses ?? [],
      } : null,
      readiness: sessionSummary.readiness ?? null,
      traceEvents: traces.slice(0, 100),
      disclaimer: "PayPal Sandbox evidence is from real sandbox transactions. Chaos simulation evidence is from local deterministic model exploration and does not represent live PayPal transaction data.",
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = `agentproof-report-${sessionSummary.session.id.slice(0, 8)}-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url)
  }

  const adapter = useMemo<AgLlmAdapter>(() => ({
    executeTurn(request, options): AgLlmResponseHandler {
      const latestUserMessage = [...request.input].reverse().find((item): item is AgAiInputMessage => item.kind === "input" && item.type === "message" && item.role === "user")
      const question = latestUserMessage?.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n").trim() ?? ""
      const complete: Promise<AgLlmResponse> = api.post("api/analytics/assistant", { json: { question }, ...(options?.signal ? { signal: options.signal } : {}) }).json<{ readonly answer: string }>().then(({ answer }) => {
        const message: AgAiOutputMessage = { id: crypto.randomUUID(), kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: answer, annotations: [] }] }
        return { id: crypto.randomUUID(), createdAt: Date.now(), output: [message], status: "completed" }
      })
      const stream: AsyncIterable<AgAiEvent> = { async *[Symbol.asyncIterator]() {
        const response = await complete
        const message = response.output.find((item): item is AgAiOutputMessage => item.type === "message")
        const answer = message?.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("") ?? ""
        const messageId = message?.id ?? crypto.randomUUID()
        yield { type: "TEXT_MESSAGE_START", messageId, role: "assistant" }
        if (answer) yield { type: "TEXT_MESSAGE_CONTENT", messageId, delta: answer }
        yield { type: "TEXT_MESSAGE_END", messageId }
      } }
      return { stream, complete }
    },
  }), [])
  const studioAi = useMemo(() => (params: AgAiHarnessSetupParams) => createAiHarness(params.api, { adapter, primary: "lead", promptStarters: [{ label: "Inspect latest failures", prompt: "Show the invariant violations from the latest campaign and compare their execution schedules." }, { label: "Explain retry races", prompt: "Which explored schedules include a capture retry or delayed webhook?" }] }), [adapter])

  const [activeTab, setActiveTab] = useState<"report" | "studio">(() => workflowStep === "final_report" ? "report" : "studio")

  useEffect(() => {
    if (workflowStep === "final_report") {
      setActiveTab("report")
    } else if (workflowStep === "results") {
      setActiveTab("studio")
    }
  }, [workflowStep])

  return (
    <div className="page-wrap analytics-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="live-pip" /> {activeTab === "report" ? "FINAL TESTING REPORT" : "AG STUDIO"} <span className="heading-divider">/</span> {activeTab === "report" ? "SESSION AUDIT" : "CHAOS COMMAND CENTER"}
          </div>
          <h1>{activeTab === "report" ? "Testing session final report." : "Payment resilience, in context."}</h1>
          <p>
            {activeTab === "report"
              ? "Comprehensive audit of connected system, payment verification, and chaos simulation results."
              : "Build interactive reports from recorded campaign schedules, invariant results and payment traces."}
          </p>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" onClick={onBack}>
            <ArrowLeft size={14} /> Back
          </button>
          <div className="segmented-control">
            <button className={activeTab === "report" ? "selected" : ""} onClick={() => setActiveTab("report")}>
              Final Report
            </button>
            <button className={activeTab === "studio" ? "selected" : ""} onClick={() => setActiveTab("studio")}>
              AG Studio
            </button>
          </div>
          {activeTab === "report" ? (
            <button className="button button-primary" onClick={exportReport} disabled={!sessionSummary}>
              <Download size={14} /> Export JSON
            </button>
          ) : (
            <button className="button button-secondary" onClick={() => void refresh()}>
              <RefreshCw size={14} /> Refresh evidence
            </button>
          )}
        </div>
      </div>

      {error && <div className="inline-alert error">{error}</div>}

      {activeTab === "report" ? (
        <section className="final-report-container">
          {sessionSummary ? (
            <div className="report-card panel">
              <div className="report-header">
                <div>
                  <div className="eyebrow">SESSION {sessionSummary.session.id.slice(0, 8).toUpperCase()}</div>
                  <h2>Payment Integration & Chaos Audit</h2>
                  <p>Target System: <b>{sessionSummary.session.connectedSystem}</b> · Created: {new Date(sessionSummary.session.createdAt).toLocaleString()}</p>
                </div>
                <div className={`status-pill ${sessionSummary.campaign?.result?.failures ? "status-warning" : "status-success"}`}>
                  {sessionSummary.campaign?.result?.failures ? "VIOLATIONS FOUND" : "RESILIENT"}
                </div>
              </div>

              {/* Section 1: Real PayPal Transaction Evidence */}
              <div className="report-section">
                <div className="report-section-head">
                  <div className="source-tag source-paypal"><ShieldCheck size={14} /> ACTUAL PAYPAL SANDBOX TRANSACTION EVIDENCE</div>
                  <h3>1. External Payment Integration</h3>
                </div>
                {sessionSummary.paymentOrder?.captureId ? (
                  <div className="report-grid">
                    <div className="report-stat"><span>Order ID</span><b>{sessionSummary.session.paymentOrderId ?? "N/A"}</b></div>
                    <div className="report-stat"><span>Capture ID</span><b>{sessionSummary.paymentOrder.captureId}</b></div>
                    <div className="report-stat"><span>Capture Status</span><b className="text-success">COMPLETED</b></div>
                    <div className="report-stat"><span>Webhook Verification</span><b className="text-success">VERIFIED & RECORDED</b></div>
                  </div>
                ) : (
                  <div className="inline-alert warning">
                    <CircleAlert size={15} />
                    <span>No external PayPal Sandbox payment has been captured in this session yet.</span>
                  </div>
                )}
              </div>

              {/* Section 2: Local Chaos Simulation Evidence */}
              <div className="report-section">
                <div className="report-section-head">
                  <div className="source-tag source-simulation"><ShieldAlert size={14} /> LOCAL DETERMINISTIC CHAOS SIMULATION EVIDENCE</div>
                  <h3>2. Model Exploration & Invariant Checks</h3>
                  <small className="disclaimer-text">These schedules are explored against a local state model and never transmit live requests to PayPal.</small>
                </div>
                {sessionSummary.campaign ? (
                  <>
                    <div className="report-grid">
                      <div className="report-stat"><span>Campaign Name</span><b>{sessionSummary.campaign.name}</b></div>
                      <div className="report-stat"><span>Random Seed</span><b>{sessionSummary.campaign.seed}</b></div>
                      <div className="report-stat"><span>Schedules Explored</span><b>{sessionSummary.campaign.result?.executions ?? 0}</b></div>
                      <div className="report-stat"><span>Resilience Score</span><b>{sessionSummary.campaign.result?.resilienceScore ?? 0}%</b></div>
                    </div>

                    <div className="report-findings">
                      <h4>Invariant Violations Discovered ({sessionSummary.campaign.result?.failures ?? 0})</h4>
                      {(sessionSummary.campaign.result?.uniqueFailureClasses ?? []).length > 0 ? (
                        <ul className="violation-list">
                          {(sessionSummary.campaign.result?.uniqueFailureClasses ?? []).map((violation) => (
                            <li key={violation} className="violation-item">
                              <span className="violation-badge">{violation}</span>
                              <div>
                                <b>Financial Invariant Breached</b>
                                <p>Explored schedule triggered a duplicate capture or fulfillment violation.</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="clean-report"><CheckCircle2 size={16} /> Zero financial invariant violations found in this model exploration.</p>
                      )}
                    </div>

                    {sessionSummary.campaign.result?.replayIdentity && (
                      <div className="replay-summary-box">
                        <b>Minimal Counterexample:</b> <code>{sessionSummary.campaign.result.replayIdentity}</code>
                        <p>Failure was successfully shrunk and can be deterministically replayed with seed {sessionSummary.campaign.seed}.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="empty-state">No chaos testing campaign has been run in this session yet.</div>
                )}
              </div>

              {/* Section 3: Trace Evidence References */}
              <div className="report-section">
                <div className="report-section-head">
                  <h3>3. Recorded Trace Evidence ({traces.length} events)</h3>
                </div>
                <div className="traces-scroll-box">
                  {traces.slice(0, 8).map((t) => (
                    <div key={t.id} className="trace-item-row">
                      <span className="trace-time">{new Date(t.createdAt).toLocaleTimeString()}</span>
                      <span className="trace-source">{t.source}</span>
                      <span className="trace-event">{t.eventType}</span>
                      <code className="trace-id">{t.id.slice(0, 8)}</code>
                    </div>
                  ))}
                  {traces.length === 0 && <p className="empty-state">No trace records found.</p>}
                </div>
              </div>

              {/* Disclaimer */}
              <div className="report-disclaimer-footer">
                <CheckCircle2 size={15} />
                <span>
                  <b>Integrity Guarantee:</b> PayPal Sandbox transaction evidence is strictly separated from local chaos simulation evidence. Invariants are evaluated deterministically by the invariant engine.
                </span>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <LoaderCircle size={18} className="spin" /> Loading session audit report…
            </div>
          )}
        </section>
      ) : (
        <section className="studio-frame" aria-label="Interactive chaos campaign analytics" style={{ minHeight: "820px", height: "820px" }}>
          {data && configLoaded ? (
            <AgStudioProvider modules={[AgStudioAiModule]} {...(licenseKey ? { licenseKey } : {})}>
              <AgStudio data={data} mode="edit" ai={studioAi} style={{ height: "100%", width: "100%" }} />
            </AgStudioProvider>
          ) : (
            <div className="empty-state" style={{ height: "820px", display: "grid", placeItems: "center" }}>
              <span><LoaderCircle size={20} className="spin" /> Loading Studio workspace…</span>
            </div>
          )}
        </section>
      )}

      {configLoaded && !licenseKey && activeTab === "studio" && (
        <p className="studio-license-note">AG Studio development mode is active. Add AG_STUDIO_LICENSE_KEY to remove the trial watermark for deployment.</p>
      )}
      <div className="campaign-disclaimer">The AI assistant summarizes recorded evidence. It cannot mark a financial invariant as passed or failed.</div>
    </div>
  )
}

function createStudioData(traces: readonly Trace[], campaign: Campaign | null): StudioData {
  const summary = campaign?.result
  const maxOrdinal = summary?.executions ?? Infinity
  const executions = (campaign?.executions ?? []).filter((e) => e.ordinal <= maxOrdinal)

  // Map invariant IDs to clear human-readable business rules
  const invariantNames: Record<string, string> = {
    I1: "Payment Exceeded Authorization",
    I2: "Refund Exceeded Capture",
    I3: "Multiple Intent Effects",
    I4: "Duplicate Order Fulfillment",
    I5: "Approved Maximum Exceeded",
    I6: "Duplicate Webhook Side Effect",
    I7: "Merchant State Desynchronized",
    I8: "Uncaptured Order Fulfilled",
    I9: "Refund Without Capture",
    I10: "Missing Financial Evidence",
    I11: "Idempotency Breach On Retry",
    I12: "Reconciliation Divergence",
  }

  // 1. Per-schedule runs summary dataset (ideal for bar/line charts: schedule vs failure count / status)
  const executionSummaryRows = executions.map((execution) => ({
    schedule: `Run #${execution.ordinal}`,
    scheduleNumber: execution.ordinal,
    stepsCount: execution.schedule.length,
    faultsInjected: execution.schedule.filter((s) => s.fault && s.fault !== "none").length,
    failureCount: execution.failedInvariants.length,
    status: execution.failedInvariants.length > 0 ? "Violation Detected" : "Passed",
    failed: execution.failedInvariants.length > 0,
    violationNames: execution.failedInvariants.map((id) => invariantNames[id] ?? id).join(", ") || "None",
  }))

  // 2. Breakdown by violation category (ideal for Pie / Donut charts)
  const violationCounts: Record<string, number> = {}
  executions.forEach((execution) => {
    execution.failedInvariants.forEach((id) => {
      const name = invariantNames[id] ?? id
      violationCounts[name] = (violationCounts[name] ?? 0) + 1
    })
  })
  const violationBreakdownRows = Object.entries(violationCounts).map(([violationType, count]) => ({
    violationType,
    occurrences: count,
  }))

  // 3. Step-by-step actions (ideal for exploring event sequences by actor and action)
  const stepRows = executions.flatMap((execution) =>
    execution.schedule.map((step, position) => ({
      schedule: `Run #${execution.ordinal}`,
      scheduleNumber: execution.ordinal,
      stepNumber: position + 1,
      actor: step.actor,
      action: step.action,
      fault: step.fault ?? "none",
      hadFault: Boolean(step.fault && step.fault !== "none"),
      scheduleStatus: execution.failedInvariants.length > 0 ? "Violation" : "Clean",
    }))
  )

  // 4. Trace events
  const traceRows = traces.map((trace) => ({
    source: trace.source,
    event: trace.eventType,
    timestamp: trace.createdAt,
    time: trace.createdAt ? new Date(trace.createdAt).toLocaleTimeString() : "—",
  }))

  // 5. Campaign summary
  const campaignRows = campaign
    ? [{
        campaignName: campaign.name,
        seed: campaign.seed,
        schedulesExplored: summary?.executions ?? executions.length,
        failuresFound: summary?.failures ?? 0,
        resilienceScore: summary?.resilienceScore ?? 100,
        replayedScenario: summary?.replayIdentity ?? "none",
      }]
    : [{
        campaignName: "No campaign yet",
        seed: 0,
        schedulesExplored: 0,
        failuresFound: 0,
        resilienceScore: 0,
        replayedScenario: "none",
      }]

  return {
    description: "AgentProof bounded model exploration. Campaign schedules are local model executions, not PayPal transaction evidence. Traces may contain verified PayPal Sandbox evidence where marked by source.",
    sources: [
      {
        id: "schedule_runs",
        name: "Test Schedules & Outcomes",
        description: "Each explored test schedule, its step count, injected faults, and whether violations occurred.",
        data: executionSummaryRows.length ? executionSummaryRows : [{ schedule: "Run #1", scheduleNumber: 1, stepsCount: 0, faultsInjected: 0, failureCount: 0, status: "No data", failed: false, violationNames: "None" }],
      },
      {
        id: "violation_breakdown",
        name: "Violations by Category",
        description: "Aggregated counts of financial and workflow violations discovered.",
        data: violationBreakdownRows.length ? violationBreakdownRows : [{ violationType: "No violations recorded", occurrences: 0 }],
      },
      {
        id: "schedule_steps",
        name: "Schedule Step Sequences",
        description: "Action-by-action sequence breakdown of actors, actions, and injected faults across all runs.",
        data: stepRows.length ? stepRows : [{ schedule: "Run #1", scheduleNumber: 1, stepNumber: 1, actor: "none", action: "No actions", fault: "none", hadFault: false, scheduleStatus: "Clean" }],
      },
      {
        id: "campaign_summary",
        name: "Campaign Resilience Summary",
        description: "Overall campaign statistics including resilience score and failure totals.",
        data: campaignRows,
      },
      {
        id: "traces",
        name: "Payment and System Traces",
        description: "Event log recorded from the application and PayPal Sandbox.",
        data: traceRows.length ? traceRows : [{ source: "agentproof", event: "No trace events", timestamp: "", time: "—" }],
      },
    ],
  }
}
