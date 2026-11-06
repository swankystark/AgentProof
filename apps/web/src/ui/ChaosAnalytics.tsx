import { useCallback, useEffect, useMemo, useState } from "react"
import { api } from "../api"
import { AgStudio, AgStudioProvider } from "ag-studio-react"
import { AgStudioAiModule, type AgAiEvent, type AgAiInputMessage, type AgAiOutputMessage, type AgAiHarnessSetupParams, type AgLlmAdapter, type AgLlmResponse, type AgLlmResponseHandler, createAiHarness } from "ag-studio"
import { ArrowLeft, RefreshCw } from "lucide-react"

type Trace = { readonly id: string; readonly source: string; readonly eventType: string; readonly createdAt: string }
type RunSummary = { readonly executions?: number; readonly failures?: number; readonly resilienceScore?: number; readonly uniqueFailureClasses?: readonly string[]; readonly replayIdentity?: string; readonly shrinkHistory?: readonly number[] }
type Execution = { readonly ordinal: number; readonly failedInvariants: readonly string[]; readonly schedule: readonly { readonly actor: string; readonly action: string; readonly fault?: string }[] }
type Campaign = { readonly id: string; readonly name: string; readonly seed: number; readonly result: RunSummary; readonly executions: readonly Execution[] }
type Dashboard = { readonly traces: readonly Trace[] }
type StudioData = { readonly sources: { readonly id: string; readonly name: string; readonly description: string; readonly data: Record<string, string | number | boolean | null>[] }[]; readonly description: string }

export function ChaosAnalytics({ onBack }: { readonly onBack: () => void }) {
  const [data, setData] = useState<StudioData | null>(null)
  const [licenseKey, setLicenseKey] = useState<string | undefined>()
  const [error, setError] = useState("")
  const refresh = useCallback(async () => {
    try {
      const [dashboard, latest] = await Promise.all([api.get("api/dashboard").json<Dashboard>(), api.get("api/chaos/latest").json<{ readonly campaign: Campaign | null }>()])
      setData(createStudioData(dashboard.traces, latest.campaign))
      setError("")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Analytics could not load") }
  }, [])
  useEffect(() => {
    void refresh()
    void api.get("api/public-config").json<{ readonly agStudioLicenseKey?: string | null }>().then((config) => setLicenseKey(config.agStudioLicenseKey ?? undefined)).catch(() => undefined)
  }, [refresh])

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

  return <div className="page-wrap analytics-page">
    <div className="page-heading"><div><div className="eyebrow"><span className="live-pip" /> AG STUDIO <span className="heading-divider">/</span> CHAOS COMMAND CENTER</div><h1>Payment resilience, in context.</h1><p>Build interactive reports from recorded campaign schedules, invariant results and payment traces.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={onBack}><ArrowLeft size={14} /> Back to Chaos Lab</button><button className="button button-secondary" onClick={() => void refresh()}><RefreshCw size={14} /> Refresh evidence</button></div></div>
    {error && <div className="inline-alert error">{error}</div>}
    <section className="studio-frame" aria-label="Interactive chaos campaign analytics">{data && <AgStudioProvider modules={[AgStudioAiModule]} {...(licenseKey ? { licenseKey } : {})}><AgStudio data={data} mode="edit" ai={studioAi} style={{ height: "720px", width: "100%" }} /></AgStudioProvider>}</section>
    {!licenseKey && <p className="studio-license-note">AG Studio development mode is active. Add AG_STUDIO_LICENSE_KEY to remove the trial watermark for deployment.</p>}
    <div className="campaign-disclaimer">The AI assistant summarizes recorded evidence. It cannot mark a financial invariant as passed or failed.</div>
  </div>
}

function createStudioData(traces: readonly Trace[], campaign: Campaign | null): StudioData {
  const summary = campaign?.result
  const executions = campaign?.executions ?? []
  const invariantRows = executions.flatMap((execution) => execution.failedInvariants.map((id) => ({ execution: execution.ordinal, invariant: id, passed: false, seed: campaign?.seed ?? 0 })))
  const scheduleRows = executions.flatMap((execution) => execution.schedule.map((step, position) => ({ execution: execution.ordinal, position: position + 1, actor: step.actor, action: step.action, fault: step.fault ?? "none", failed: execution.failedInvariants.length > 0 })))
  const traceRows = traces.map((trace) => ({ source: trace.source, event: trace.eventType, timestamp: trace.createdAt }))
  const campaignRows = campaign ? [{ campaign: campaign.name, seed: campaign.seed, schedules: summary?.executions ?? executions.length, failures: summary?.failures ?? 0, resilience: summary?.resilienceScore ?? 100, replayId: summary?.replayIdentity ?? "none" }] : [{ campaign: "No campaign yet", seed: 0, schedules: 0, failures: 0, resilience: 100, replayId: "none" }]
  return { description: "AgentProof bounded model exploration. Campaign schedules are local model executions, not PayPal transaction evidence. Traces may contain verified PayPal Sandbox evidence where marked by source.", sources: [
    { id: "campaign", name: "Campaign summary", description: "Bounded campaign statistics and deterministic Payment Resilience score.", data: campaignRows },
    { id: "executions", name: "Explored schedules", description: "Individual recorded local schedules and model outcomes.", data: scheduleRows.length ? scheduleRows : [{ execution: 0, position: 0, actor: "none", action: "No schedules yet", fault: "none", failed: false }] },
    { id: "invariants", name: "Invariant violations", description: "Invariant identifiers that failed during a recorded schedule.", data: invariantRows.length ? invariantRows : [{ execution: 0, invariant: "No violations recorded", passed: true, seed: campaign?.seed ?? 0 }] },
    { id: "traces", name: "Payment and campaign trace", description: "Structured trace events recorded by AgentProof.", data: traceRows.length ? traceRows : [{ source: "agentproof", event: "No trace events recorded", timestamp: "" }] },
  ] }
}
