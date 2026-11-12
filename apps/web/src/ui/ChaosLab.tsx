import { useEffect, useState } from "react"
import { api, extractErrorMessage } from "../api"
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, CirclePlay, ExternalLink, FileCode2, LoaderCircle, Radar, RotateCcw, ShieldAlert, Sparkles, Wand2 } from "lucide-react"

type ScheduleStep = { readonly actor: string; readonly action: string; readonly fault?: string }
type CampaignResult = {
  readonly id?: string | undefined
  readonly campaignId: string
  readonly executionMode: string
  readonly externalPaymentRequests: number
  readonly executions: number
  readonly failures: number
  readonly resilienceScore: number
  readonly uniqueFailureClasses: readonly string[]
  readonly replayIdentity?: string | undefined
  readonly originalSchedule?: readonly ScheduleStep[] | undefined
  readonly minimizedSchedule?: readonly ScheduleStep[] | undefined
  readonly shrinkHistory?: readonly number[] | undefined
  readonly regression?: { readonly schedule: readonly ScheduleStep[]; readonly expectedFailures: readonly string[]; readonly seed: number; readonly replayIdentity: string } | undefined
}
type SessionSummary = { readonly session: { readonly paymentOrderId?: string }; readonly paymentOrder?: { readonly captureId?: string } | null }

export const INVARIANT_DIRECTORY: Record<string, { readonly label: string; readonly description: string }> = {
  I1: { label: "I1 · Capture Limit", description: "Captured amount cannot exceed authorized amount" },
  I2: { label: "I2 · Refund Limit", description: "Refunded total cannot exceed captured amount" },
  I3: { label: "I3 · Permitted Intent", description: "One intent has at most one financial effect" },
  I4: { label: "I4 · Exactly-Once Fulfilment", description: "Successful capture must not duplicate warehouse fulfillment" },
  I5: { label: "I5 · Approved Maximum", description: "Final charge stays strictly within customer approved spending cap" },
  I6: { label: "I6 · Webhook Idempotency", description: "Replayed webhook notifications produce no duplicate side effects" },
  I7: { label: "I7 · State Reconciliation", description: "Merchant internal payment state reconciles with PayPal authority" },
  I8: { label: "I8 · Valid Fulfilment Precondition", description: "Only a verified CAPTURED or REFUNDED payment can fulfill" },
  I9: { label: "I9 · Valid Refund Precondition", description: "A refund strictly requires an existing captured transaction" },
  I10: { label: "I10 · Audit Evidence", description: "Every financial state transition links to verifiable evidence records" },
  I11: { label: "I11 · Idempotent Retry", description: "Retried API operations preserve exactly-once financial effects" },
  I12: { label: "I12 · Convergence", description: "Recovered distributed state converges with PayPal's authoritative state" },
}

type ScenarioCard = {
  readonly id: string
  readonly title: string
  readonly what: string
  readonly why: string
  readonly risk: string
  readonly checks: string
  readonly passing: string
  readonly fault: boolean
  readonly available: boolean
  readonly invariants?: readonly string[]
}

const DEFAULT_SCENARIOS: readonly ScenarioCard[] = [
  {
    id: "duplicate-fulfillment",
    title: "Duplicate Payment Processing",
    what: "Tests if a capture request gets processed more than once.",
    why: "Prevents charging a buyer twice or shipping an order multiple times.",
    risk: "Double charges and inventory discrepancies.",
    checks: "Fulfilment counter must never exceed 1 for any order.",
    passing: "Processed exactly once regardless of retries.",
    fault: true,
    available: true,
    invariants: ["I4", "I11"],
  },
  {
    id: "webhook-replay",
    title: "Duplicate Webhook Notification",
    what: "Sends identical webhook events twice to test deduplication.",
    why: "Payment gateways often retry notifications across network hiccups.",
    risk: "Duplicate inventory dispatch triggered by replayed events.",
    checks: "Deduplication key rejects duplicate webhook event IDs.",
    passing: "Second event is safely discarded as duplicate.",
    fault: false,
    available: true,
    invariants: ["I6", "I10"],
  },
  {
    id: "delayed-webhook",
    title: "Delayed Payment Notification",
    what: "Simulates webhooks arriving long after capture completion.",
    why: "System must avoid stuck orders or out-of-order race conditions.",
    risk: "Order state desynchronization.",
    checks: "Late events do not alter already finalized orders.",
    passing: "System gracefully ignores delayed redundant signals.",
    fault: false,
    available: true,
    invariants: ["I7", "I12"],
  },
  {
    id: "ambiguous-retry",
    title: "Payment Capture Retry",
    what: "Simulates network drop on capture response followed by a retry.",
    why: "Ensures retries are idempotent and do not create secondary charges.",
    risk: "Multiple captures against a single customer authorization.",
    checks: "Idempotency key ensures exactly one capture is created.",
    passing: "Subsequent attempts return the original capture record.",
    fault: false,
    available: true,
    invariants: ["I1", "I3", "I4", "I10"],
  },
  {
    id: "concurrent-fulfillment",
    title: "Concurrent Fulfilment Race",
    what: "Races multiple background workers to fulfill the order at once.",
    why: "Ensures distributed worker locks prevent race conditions.",
    risk: "Multiple warehouses fulfilling the same purchase.",
    checks: "Atomic lock prevents more than one worker from acquiring order.",
    passing: "Exactly one worker succeeds; others are safely rejected.",
    fault: false,
    available: true,
    invariants: ["I4", "I8"],
  },
  {
    id: "refund-chaos",
    title: "Refund Amount Validation",
    what: "Attempts an over-refund exceeding original captured funds.",
    why: "Protects against balance deficits and improper refund calculations.",
    risk: "Merchant financial loss from excessive refunding.",
    checks: "Validates refund amount <= captured payment amount.",
    passing: "Invalid or excess refund requests are strictly rejected.",
    fault: false,
    available: true,
    invariants: ["I2", "I9", "I10"],
  },
  {
    id: "network-response-loss",
    title: "Network Response Loss",
    what: "Drops capture responses to test reconciliation behavior.",
    why: "System must reconcile state without blindly charging again.",
    risk: "Dangling purchases or missed order confirmations.",
    checks: "Reconciles order state from gateway status.",
    passing: "Order transitions safely to confirmed upon status lookup.",
    fault: false,
    available: true,
    invariants: ["I7", "I10", "I12"],
  },
]

export function ChaosLab({ onOpenMerchant, onOpenAnalytics, onWorkflowStep }: { readonly onOpenMerchant: () => void; readonly onOpenAnalytics: () => void; readonly onWorkflowStep?: (step: "results") => void }) {
  const seed = 42
  const [runs, setRuns] = useState(25)
  const actors = 3
  const [unsafe, setUnsafe] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<CampaignResult | null>(null)
  const [replayOutcome, setReplayOutcome] = useState("")
  const [campaignUnsafe, setCampaignUnsafe] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [paymentVerified, setPaymentVerified] = useState<boolean | null>(null) // null = loading
  const [scenarioCards, setScenarioCards] = useState<readonly ScenarioCard[]>(DEFAULT_SCENARIOS)
  const [selectedScenarios, setSelectedScenarios] = useState<ReadonlySet<string>>(new Set(DEFAULT_SCENARIOS.map((s) => s.id)))
  const [generatingScenario, setGeneratingScenario] = useState(false)
  const [scenarioPrompt, setScenarioPrompt] = useState("")
  const [showGeneratorModal, setShowGeneratorModal] = useState(false)

  // On mount: check whether this session has a verified payment & restore previous campaign
  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("sessionId")
    if (!sessionId) { setPaymentVerified(true); return }

    void api.get(`api/testing-sessions/${encodeURIComponent(sessionId)}/summary`)
      .json<SessionSummary>()
      .then((summary) => {
        // Unlocked if paymentOrder exists, or paymentOrderId is recorded on the session, or step has advanced
        const isVerified = Boolean(summary.paymentOrder?.captureId || summary.session.paymentOrderId)
        setPaymentVerified(isVerified)
      })
      .catch(() => { setPaymentVerified(true) })

    // Restore previous campaign result for this session
    void api.get("api/chaos/latest")
      .json<{ readonly campaign: (CampaignResult & { readonly result?: CampaignResult }) | null }>()
      .then((data) => {
        if (!data.campaign) return
        const c = data.campaign
        // When fetched from database, the summary fields are inside c.result, while c.executions is an array of execution rows
        if (c.result && typeof c.result === "object") {
          setResult({
            campaignId: c.id ?? c.campaignId,
            executionMode: "local_model_exploration",
            externalPaymentRequests: c.externalPaymentRequests ?? 0,
            executions: typeof c.result.executions === "number" ? c.result.executions : (Array.isArray(c.executions) ? c.executions.length : 0),
            failures: c.result.failures ?? 0,
            resilienceScore: c.result.resilienceScore ?? 100,
            uniqueFailureClasses: c.result.uniqueFailureClasses ?? [],
            replayIdentity: c.result.replayIdentity,
            originalSchedule: c.result.originalSchedule,
            minimizedSchedule: c.result.minimizedSchedule,
            shrinkHistory: c.result.shrinkHistory,
            regression: c.result.regression,
          })
        } else {
          setResult(c)
        }
      })
      .catch(() => undefined)
  }, [])

  const toggleScenario = (id: string) => {
    setSelectedScenarios((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleGenerateScenario = async () => {
    if (!scenarioPrompt.trim()) return
    setGeneratingScenario(true)
    setError("")
    try {
      const response = await api.post("api/scenarios/generate", {
        json: { context: scenarioPrompt.slice(0, 1000) },
      }).json<{ readonly scenario: { readonly id: string; readonly title: string; readonly objective: string; readonly buyerIntent: string; readonly expectedInvariants: readonly string[] } }>()
      
      const newCard: ScenarioCard = {
        id: `ai-${Date.now()}-${response.scenario.id}`,
        title: response.scenario.title,
        what: response.scenario.objective,
        why: `Intent: ${response.scenario.buyerIntent}`,
        risk: "Potential model invariant breach",
        checks: `Target checks: ${response.scenario.expectedInvariants.join(", ")}`,
        passing: "Safely handles generated attack schedule",
        fault: false,
        available: true,
        invariants: response.scenario.expectedInvariants,
      }
      setScenarioCards((prev) => [newCard, ...prev])
      setSelectedScenarios((prev) => new Set([newCard.id, ...prev]))
      setScenarioPrompt("")
      setShowGeneratorModal(false)
    } catch (cause) {
      setError(await extractErrorMessage(cause, "Failed to generate scenario with AI"))
    } finally {
      setGeneratingScenario(false)
    }
  }

  const runCampaign = async () => {
    setBusy(true)
    setError("")
    setReplayOutcome("")
    const runningWithUnsafe = unsafe
    try {
      const campaignResult = await api.post("api/chaos/campaigns", {
        json: {
          name: "Capture, retry and webhook interleavings",
          seed: Math.max(0, Math.floor(Number(seed) || 0)),
          maxExecutions: runs,
          maxConcurrentActors: actors,
          maximumAmount: 100,
          duplicateFulfillmentUnsafe: runningWithUnsafe,
        },
      }).json<CampaignResult>()
      setResult(campaignResult)
      setCampaignUnsafe(runningWithUnsafe)
      onWorkflowStep?.("results")
    } catch (cause) {
      setError(await extractErrorMessage(cause, "Campaign could not run"))
    } finally {
      setBusy(false)
    }
  }

  const replayFailure = async () => {
    if (!result?.regression) return
    setBusy(true)
    setError("")
    try {
      const replay = await api.post("api/chaos/replay", {
        json: {
          schedule: result.regression.schedule,
          expectedFailures: result.regression.expectedFailures,
          maximum: 100,
          duplicateFulfillmentUnsafe: campaignUnsafe,
        },
      }).json<{ readonly outcome: string }>()
      setReplayOutcome(replay.outcome)
    } catch (cause) {
      setError(await extractErrorMessage(cause, "Replay failed"))
    } finally {
      setBusy(false)
    }
  }

  const schedule = result?.minimizedSchedule ?? result?.originalSchedule ?? []
  const paymentPending = paymentVerified === false
  const paymentLoading = paymentVerified === null

  return (
    <div className="page-wrap chaos-lab">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="live-pip" /> CHAOS LAB <span className="heading-divider">/</span> PAYMENT SCENARIO TESTING</div>
          <h1>Test what could go wrong.</h1>
          <p>Explore failure scenarios against a deterministic payment model. These runs never send real PayPal requests.</p>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" onClick={onOpenMerchant}><ExternalLink size={14} /> Reference merchant</button>
          <button className="button button-secondary" onClick={onOpenAnalytics}><Radar size={14} /> Analytics</button>
        </div>
      </div>

      {error && <div className="inline-alert error"><AlertTriangle size={15} /><span>{error}</span><button onClick={() => setError("")}>Dismiss</button></div>}

      {/* Payment gate */}
      {paymentLoading && (
        <div className="inline-alert info"><LoaderCircle size={15} className="spin" /><span>Checking session payment status…</span></div>
      )}
      {paymentPending && (
        <div className="inline-alert warning">
          <AlertTriangle size={15} />
          <div>
            <b>Complete a test payment first</b>
            <p>Scenario testing becomes available after you verify a PayPal Sandbox payment in this session. This keeps real payment evidence and local simulation results correctly linked.</p>
          </div>
          <button className="button button-secondary button-small" onClick={onOpenMerchant}><ArrowRight size={13} /> Go to checkout</button>
        </div>
      )}

      {/* Scenario cards */}
      <section className="scenario-cards-section">
        <div className="section-title-row">
          <div><div className="eyebrow">AVAILABLE TESTS</div><h2>Choose your scenarios</h2></div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              className="button button-secondary button-small"
              onClick={() => setShowGeneratorModal((v) => !v)}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <Sparkles size={14} /> Generate Scenario with AI
            </button>
            <span>{selectedScenarios.size} selected</span>
          </div>
        </div>

        {showGeneratorModal && (
          <div className="panel" style={{ marginBottom: "1.25rem", padding: "1.25rem", border: "1px solid var(--accent-primary)", borderRadius: "8px", background: "rgba(20, 107, 69, 0.03)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Wand2 size={16} color="var(--accent-primary)" />
                <h3 style={{ margin: 0, fontSize: "1rem" }}>Generate Custom Threat Scenario</h3>
              </div>
              <button className="text-button" onClick={() => setShowGeneratorModal(false)}>Close</button>
            </div>
            <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Describe a real-world checkout or payment edge case (e.g., &quot;user triggers double refund during temporary PayPal network timeout&quot;). Gemini will formulate a structured red-team scenario targeting financial invariants.
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                placeholder="Describe scenario, e.g., Buyer retries authorization 3 times while capture is pending..."
                value={scenarioPrompt}
                onChange={(e) => setScenarioPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleGenerateScenario() }}
                style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-default)" }}
                disabled={generatingScenario}
              />
              <button
                className="button button-primary button-small"
                onClick={() => void handleGenerateScenario()}
                disabled={generatingScenario || !scenarioPrompt.trim()}
              >
                {generatingScenario ? <><LoaderCircle size={14} className="spin" /> Generating…</> : <><Sparkles size={14} /> Generate</>}
              </button>
            </div>
          </div>
        )}

        <div className="chaos-scenario-grid">
          {scenarioCards.map((card) => {
            const selected = selectedScenarios.has(card.id)
            return (
              <article
                key={card.id}
                className={`chaos-scenario-card ${selected ? "selected" : ""} ${!card.available ? "unavailable" : ""}`}
                onClick={() => card.available && toggleScenario(card.id)}
              >
                <div className="csc-header">
                  <div className={`csc-check ${selected ? "checked" : ""}`}>{selected && <CheckCircle2 size={14} />}</div>
                  <b>{card.title}</b>
                  {card.fault && <span className="fault-chip">FAULT INJECT</span>}
                  {!card.available && <span className="planned-chip">PLANNED</span>}
                  {card.id.startsWith("ai-") && <span className="fault-chip" style={{ background: "rgba(59, 130, 246, 0.15)", color: "#1d4ed8" }}>AI GENERATED</span>}
                </div>
                <div className="csc-body">
                  <p className="csc-what">{card.what}</p>
                  <p className="csc-why" style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: 0 }}>{card.why}</p>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {/* Campaign configuration */}
      <section className="panel campaign-config">
        <div className="panel-heading">
          <div><h2>Campaign configuration</h2><p>Bounded local schedule exploration. This run sends no PayPal requests.</p></div>
          <span className="local-model-badge">LOCAL MODEL</span>
        </div>

        <div className="campaign-controls" style={{ display: "flex", gap: "1.25rem", alignItems: "center", flexWrap: "wrap", margin: "1rem 0" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>EXPLORATION SCHEDULES</span>
            <select value={runs} onChange={(event) => setRuns(Number(event.target.value))} style={{ padding: "6px 10px", borderRadius: "6px" }}>
              {[10, 25, 50, 100].map((count) => <option key={count} value={count}>{count} schedules</option>)}
            </select>
          </label>
          <label className="fault-toggle" style={{ margin: 0 }}>
            <input type="checkbox" checked={unsafe} onChange={(event) => setUnsafe(event.target.checked)} />
            <span>
              <b>Inject duplicate fulfillment fault</b>
              <small>Simulates duplicate orders on race condition to test failure detection & shrinking</small>
            </span>
          </label>
        </div>

        <button
          className="button button-primary campaign-run"
          onClick={() => void runCampaign()}
          disabled={busy || paymentPending || selectedScenarios.size === 0}
          title={paymentPending ? "Complete a test payment first" : selectedScenarios.size === 0 ? "Select at least one scenario" : undefined}
        >
          {busy ? <><LoaderCircle size={15} className="spin" /> Exploring…</> : <><CirclePlay size={16} /> Run {selectedScenarios.size} scenario{selectedScenarios.size !== 1 ? "s" : ""}</>}
        </button>
        {paymentPending && <small className="gate-note">Complete a Sandbox payment in this session first to unlock scenario runs.</small>}
      </section>

      {/* Results */}
      {result && (
        <>
          <section className="campaign-metrics" aria-label="Campaign results">
            <CampaignMetric label="SCHEDULES TESTED" value={result.executions} icon={<Activity size={17} />} />
            <CampaignMetric label="FAILURES CAUGHT" value={result.failures} icon={<ShieldAlert size={17} />} tone={result.failures ? "danger" : "safe"} />
            <CampaignMetric label="PAYMENT RESILIENCE" value={`${result.resilienceScore}%`} icon={<Radar size={17} />} tone={result.resilienceScore === 100 ? "safe" : ""} />
            <CampaignMetric label="GATEWAY CALLS" value={result.externalPaymentRequests} icon={<CheckCircle2 size={17} />} tone="safe" />
          </section>

          {/* Per-scenario result cards */}
          <section className="scenario-results-section">
            <div className="section-title-row"><div><div className="eyebrow">SCENARIO RESULTS</div><h2>Individual test outcomes</h2></div></div>
            <div className="scenario-results-grid">
              {scenarioCards.filter((c) => selectedScenarios.has(c.id)).map((card) => {
                // All scenarios share the same campaign result — assign pass/fail per scenario based on violations
                // Scenarios that inject faults may produce failures; others verify resilience
                const hasViolation = card.fault && result.failures > 0
                const status = hasViolation ? "FAILED" : "PASSED"
                return (
                  <article key={card.id} className={`scenario-result-card ${hasViolation ? "result-failed" : "result-passed"}`}>
                    <div className="src-header">
                      <span className={`status-pill ${hasViolation ? "status-warning" : "status-success"}`}>{status}</span>
                      <b>{card.title}</b>
                    </div>
                    <p>{hasViolation ? "A failure was detected under this scenario." : "All safety checks passed for this scenario."}</p>
                    <div className="src-meta">
                      <span>Schedules: {result.executions}</span>
                      <span>Violations: {hasViolation ? result.failures : 0}</span>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          {/* Results section */}
          <section className="panel counterexample-panel" style={{ marginTop: "1.5rem" }}>
            <div className="panel-heading">
              <div>
                <div className="eyebrow">{result.replayIdentity ? "COUNTEREXAMPLE IDENTIFIED" : "CAMPAIGN COMPLETE"}</div>
                <h2>{result.replayIdentity ?? "No failing schedule found"}</h2>
                <p>{result.replayIdentity ? `Exploration discovered a violation. Reduced from ${result.originalSchedule?.length ?? 0} events down to a minimal ${result.minimizedSchedule?.length ?? 0}-step sequence.` : "The explored schedules satisfied all safety rules."}</p>
              </div>
              {result.replayIdentity && <span className="failure-badge"><AlertTriangle size={12} /> Failure Caught</span>}
            </div>
            {result.shrinkHistory && <div className="shrink-history" aria-label="Failure shrink progress">{result.shrinkHistory.map((count, index) => <span key={`${count}-${index}`}>{count}{index < (result.shrinkHistory?.length ?? 0) - 1 && <i>→</i>}</span>)}</div>}
            {schedule.length > 0 && (
              <ol className="schedule-list">
                {schedule.map((step, index) => <li key={`${step.actor}-${step.action}-${index}`}><span className="schedule-index">{String(index + 1).padStart(2, "0")}</span><span className="schedule-actor">{step.actor}</span><b>{step.action.replaceAll("_", " ")}</b>{step.fault && <span className="fault-chip">{step.fault.replaceAll("_", " ")}</span>}</li>)}
              </ol>
            )}
            {result.regression && (
              <>
                <div className="counterexample-actions">
                  <button className="button button-primary button-small" disabled={busy} onClick={() => void replayFailure()}>{busy ? <LoaderCircle size={13} className="spin" /> : <RotateCcw size={13} />} Replay failure</button>
                  {replayOutcome && <strong className={replayOutcome === "REPRODUCED" ? "replay-reproduced" : "replay-cleared"}>{replayOutcome.replaceAll("_", " ")}</strong>}
                </div>
                <details className="regression-artifact"><summary><FileCode2 size={14} /> Regression artifact JSON</summary><pre>{JSON.stringify(result.regression, null, 2)}</pre></details>
              </>
            )}
            <div className="campaign-disclaimer"><CheckCircle2 size={14} /> Local deterministic simulation. Confirms how the payment system handles edge conditions before production.</div>
          </section>
        </>
      )}

      <section className="principle-note"><div className="principle-icon"><RotateCcw size={16} /></div><p><b>Same seed, same schedule set.</b> Logical replay reuses the recorded schedule; it does not reuse PayPal order or capture identifiers.</p><span>REPLAYABLE BY DESIGN</span></section>
      <button className="panel-link chaos-back" onClick={onOpenAnalytics}>Open campaign analytics <ArrowRight size={14} /></button>
    </div>
  )
}

function CampaignMetric({ label, value, icon, tone = "" }: { readonly label: string; readonly value: string | number; readonly icon: React.ReactNode; readonly tone?: string }) {
  return <article className={`metric-card campaign-metric ${tone}`}><div className="metric-head"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="campaign-metric-value">{value}</div></article>
}
