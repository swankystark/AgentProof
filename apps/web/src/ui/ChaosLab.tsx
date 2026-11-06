import { useState, type ReactNode } from "react"
import { api } from "../api"
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, CirclePlay, ExternalLink, FileCode2, LoaderCircle, Radar, RotateCcw, ShieldAlert } from "lucide-react"

type ScheduleStep = { readonly actor: string; readonly action: string; readonly fault?: string }
type CampaignResult = { readonly campaignId: string; readonly executionMode: string; readonly externalPaymentRequests: number; readonly executions: number; readonly failures: number; readonly resilienceScore: number; readonly uniqueFailureClasses: readonly string[]; readonly replayIdentity?: string; readonly originalSchedule?: readonly ScheduleStep[]; readonly minimizedSchedule?: readonly ScheduleStep[]; readonly shrinkHistory?: readonly number[]; readonly regression?: { readonly schedule: readonly ScheduleStep[]; readonly expectedFailures: readonly string[]; readonly seed: number; readonly replayIdentity: string } }

export function ChaosLab({ onOpenMerchant, onOpenAnalytics }: { readonly onOpenMerchant: () => void; readonly onOpenAnalytics: () => void }) {
  const [seed, setSeed] = useState(42)
  const [runs, setRuns] = useState(25)
  const [actors, setActors] = useState(3)
  const [unsafe, setUnsafe] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<CampaignResult | null>(null)
  const [replayOutcome, setReplayOutcome] = useState("")

  const runCampaign = async () => {
    setBusy(true)
    setError("")
    try {
      setResult(await api.post("api/chaos/campaigns", { json: { name: "Capture, retry and webhook interleavings", seed, maxExecutions: runs, maxConcurrentActors: actors, maximumAmount: 100, duplicateFulfillmentUnsafe: unsafe } }).json<CampaignResult>())
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Campaign could not run") }
    finally { setBusy(false) }
  }

  const replayFailure = async () => {
    if (!result?.regression) return
    setBusy(true)
    setError("")
    try {
      const replay = await api.post("api/chaos/replay", { json: { schedule: result.regression.schedule, expectedFailures: result.regression.expectedFailures, maximum: 100, duplicateFulfillmentUnsafe: unsafe } }).json<{ readonly outcome: string }>()
      setReplayOutcome(replay.outcome)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Replay failed") }
    finally { setBusy(false) }
  }

  const schedule = result?.minimizedSchedule ?? result?.originalSchedule ?? []
  return <div className="page-wrap chaos-lab">
    <div className="page-heading"><div><div className="eyebrow"><span className="live-pip" /> MODEL-BASED PAYMENT CHAOS <span className="heading-divider">/</span> CAMPAIGN</div><h1>Find the schedule you missed.</h1><p>Explore retries, webhook timing and competing workers against a deterministic payment model.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={onOpenMerchant}><ExternalLink size={14} /> Reference merchant</button><button className="button button-secondary" onClick={onOpenAnalytics}><Radar size={14} /> Chaos command center</button></div></div>
    {error && <div className="inline-alert error"><AlertTriangle size={15} /><span>{error}</span><button onClick={() => setError("")}>Dismiss</button></div>}
    <section className="panel campaign-config"><div className="panel-heading"><div><h2>Campaign configuration</h2><p>Bounded local schedule exploration. This run sends no PayPal requests.</p></div><span className="local-model-badge">LOCAL MODEL</span></div>
      <div className="campaign-controls">
        <label>RANDOM SEED<input type="number" min={0} max={2147483647} value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></label>
        <label>SCHEDULE LIMIT<select value={runs} onChange={(event) => setRuns(Number(event.target.value))}>{[10, 25, 50, 100].map((count) => <option key={count} value={count}>{count} schedules</option>)}</select></label>
        <label>CONCURRENT ACTORS<select value={actors} onChange={(event) => setActors(Number(event.target.value))}>{[2, 3].map((count) => <option key={count} value={count}>{count} workers</option>)}</select></label>
        <label className="fault-toggle"><input type="checkbox" checked={unsafe} onChange={(event) => setUnsafe(event.target.checked)} /><span><b>Inject duplicate fulfillment</b><small>Controlled merchant fault · local model only</small></span></label>
        <button className="button button-primary campaign-run" onClick={() => void runCampaign()} disabled={busy}>{busy ? <><LoaderCircle size={15} className="spin" /> Exploring…</> : <><CirclePlay size={16} /> Start chaos campaign</>}</button>
      </div>
    </section>
    {result && <>
      <section className="campaign-metrics" aria-label="Campaign results">
        <CampaignMetric label="SCHEDULES EXPLORED" value={result.executions} icon={<Activity size={17} />} />
        <CampaignMetric label="INVARIANT VIOLATIONS" value={result.failures} icon={<ShieldAlert size={17} />} tone={result.failures ? "danger" : "safe"} />
        <CampaignMetric label="PAYMENT RESILIENCE" value={`${result.resilienceScore}%`} icon={<Radar size={17} />} tone={result.resilienceScore === 100 ? "safe" : ""} />
        <CampaignMetric label="PAYPAL REQUESTS" value={result.externalPaymentRequests} icon={<CheckCircle2 size={17} />} tone="safe" />
      </section>
      <section className="panel counterexample-panel"><div className="panel-heading"><div><div className="eyebrow">{result.replayIdentity ? "MINIMAL COUNTEREXAMPLE" : "CAMPAIGN COMPLETE"}</div><h2>{result.replayIdentity ?? "No failing schedule found"}</h2><p>{result.replayIdentity ? `${result.originalSchedule?.length ?? 0} events reduced to ${result.minimizedSchedule?.length ?? 0}` : "The explored schedules satisfied all current model invariants."}</p></div>{result.replayIdentity && <span className="failure-badge"><AlertTriangle size={12} /> {result.uniqueFailureClasses.join(", ")}</span>}</div>
        {result.shrinkHistory && <div className="shrink-history" aria-label="Failure shrink progress">{result.shrinkHistory.map((count, index) => <span key={`${count}-${index}`}>{count}{index < (result.shrinkHistory?.length ?? 0) - 1 && <i>→</i>}</span>)}</div>}
        {schedule.length > 0 && <ol className="schedule-list">{schedule.map((step, index) => <li key={`${step.actor}-${step.action}-${index}`}><span className="schedule-index">{String(index + 1).padStart(2, "0")}</span><span className="schedule-actor">{step.actor}</span><b>{step.action.replaceAll("_", " ")}</b>{step.fault && <span className="fault-chip">{step.fault.replaceAll("_", " ")}</span>}</li>)}</ol>}
        {result.regression && <><div className="counterexample-actions"><button className="button button-primary button-small" disabled={busy} onClick={() => void replayFailure()}>{busy ? <LoaderCircle size={13} className="spin" /> : <RotateCcw size={13} />} Replay failure</button>{replayOutcome && <strong className={replayOutcome === "REPRODUCED" ? "replay-reproduced" : "replay-cleared"}>{replayOutcome.replaceAll("_", " ")}</strong>}</div><details className="regression-artifact"><summary><FileCode2 size={14} /> Regression artifact JSON</summary><pre>{JSON.stringify(result.regression, null, 2)}</pre></details></>}
        <div className="campaign-disclaimer"><CheckCircle2 size={14} /> This result is model exploration. Confirm representative failures with a real PayPal Sandbox campaign before treating them as external transaction evidence.</div>
      </section>
    </>}
    <section className="principle-note"><div className="principle-icon"><RotateCcw size={16} /></div><p><b>Same seed, same schedule set.</b> Logical replay reuses the recorded schedule; it does not reuse PayPal order or capture identifiers.</p><span>REPLAYABLE BY DESIGN</span></section>
    <button className="panel-link chaos-back" onClick={onOpenAnalytics}>Open campaign analytics <ArrowRight size={14} /></button>
  </div>
}

function CampaignMetric({ label, value, icon, tone = "" }: { readonly label: string; readonly value: string | number; readonly icon: ReactNode; readonly tone?: string }) {
  return <article className={`metric-card campaign-metric ${tone}`}><div className="metric-head"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="campaign-metric-value">{value}</div></article>
}
