import { lazy, Suspense, useEffect, useState } from "react"
import { Activity, ArrowRight, BookOpen, LayoutDashboard, LockKeyhole, ShieldCheck } from "lucide-react"
import { api } from "../api"
import { ConnectSystem } from "./ConnectSystem"
import { Dashboard } from "./Dashboard"
import { Merchant } from "./Merchant"
import { ChaosLab } from "./ChaosLab"
import { Guide } from "./Guide"
import { ErrorBoundary } from "./ErrorBoundary"
const ChaosAnalytics = lazy(() => import("./ChaosAnalytics").then((module) => ({ default: module.ChaosAnalytics })))

type Page = "dashboard" | "connect" | "merchant" | "chaos" | "analytics" | "guide"
type WorkflowStepId = "connect_system" | "create_order" | "verify_payment" | "run_scenarios" | "results" | "final_report"

const workflowSteps: readonly { readonly id: WorkflowStepId; readonly label: string; readonly page: Page }[] = [
  { id: "connect_system", label: "Connect system", page: "connect" },
  { id: "create_order", label: "Create order", page: "merchant" },
  { id: "verify_payment", label: "Verify payment", page: "merchant" },
  { id: "run_scenarios", label: "Run scenarios", page: "chaos" },
  { id: "results", label: "Results & evidence", page: "analytics" },
  { id: "final_report", label: "Final report", page: "analytics" },
]

export function App() {
  const pageFromPath = (): Page => {
    const p = window.location.pathname.replace(/\/+$/, "")
    if (p === "/connect" || p === "/testing-sessions") return "connect"
    if (p === "/merchant") return "merchant"
    if (p === "/chaos") return "chaos"
    if (p === "/analytics") return "analytics"
    if (p === "/guide" || p === "/docs") return "guide"
    return "dashboard"
  }

  const [page, setPage] = useState<Page>(pageFromPath)
  const [sessionId, setSessionId] = useState(() => new URLSearchParams(window.location.search).get("sessionId"))
  const [workflowStep, setWorkflowStep] = useState<WorkflowStepId>(() => {
    const next = new URLSearchParams(window.location.search).get("workflowStep")
    return isWorkflowStep(next) ? next : defaultStep(pageFromPath())
  })
  const [analyticsOrigin, setAnalyticsOrigin] = useState<Page>("chaos")

  useEffect(() => {
    const syncPath = () => {
      setPage(pageFromPath())
      setSessionId(new URLSearchParams(window.location.search).get("sessionId"))
      const next = new URLSearchParams(window.location.search).get("workflowStep")
      setWorkflowStep(isWorkflowStep(next) ? next : defaultStep(pageFromPath()))
    }
    window.addEventListener("popstate", syncPath)
    return () => window.removeEventListener("popstate", syncPath)
  }, [])

  const navigate = (next: Page, nextSessionId = sessionId, nextStep: WorkflowStepId = defaultStep(next)) => {
    if (page !== "analytics" && next === "analytics") {
      setAnalyticsOrigin(page)
    }
    setPage(next)
    setSessionId(nextSessionId)
    setWorkflowStep(nextStep)
    const targetPath = next === "connect" ? "/connect" : next === "merchant" ? "/merchant" : next === "chaos" ? "/chaos" : next === "analytics" ? "/analytics" : next === "guide" ? "/guide" : "/"
    const query = nextSessionId && next !== "connect" && next !== "dashboard" && next !== "guide" ? `?sessionId=${encodeURIComponent(nextSessionId)}&workflowStep=${nextStep}` : ""
    window.history.pushState({}, "", `${targetPath}${query}`)
    if (nextSessionId) void api.patch(`api/testing-sessions/${encodeURIComponent(nextSessionId)}`, { json: { currentStep: nextStep } }).catch(() => undefined)
  }

  const openSession = (id: string, step: string) => {
    const pageForStep = workflowSteps.find((item) => item.id === step)?.page ?? "merchant"
    navigate(pageForStep, id, step as WorkflowStepId)
  }

  const pageTitle = page === "dashboard" ? "Overview" : page === "connect" ? "Testing sessions" : page === "merchant" ? "Create test order" : page === "chaos" ? "Test your payment system" : page === "guide" ? "User Guide" : "Reports"

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><ShieldCheck size={20} strokeWidth={2.2} /></div><div><strong>agentproof</strong><span>PAYMENT TESTING</span></div></div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={page === "dashboard" ? "nav-item active" : "nav-item"} onClick={() => navigate("dashboard")}><LayoutDashboard size={17} /><span>Overview</span></button>
          <button className={page === "connect" || page === "merchant" || page === "chaos" ? "nav-item active" : "nav-item"} onClick={() => navigate("connect")}><Activity size={17} /><span>Testing sessions</span></button>
          <button className={page === "analytics" ? "nav-item active" : "nav-item"} onClick={() => navigate("analytics")}><ArrowRight size={17} /><span>Reports</span></button>
        </nav>
        <div className="nav-label nav-label--lower">RESOURCES</div>
        <nav className="main-nav" aria-label="Resources">
          <button className={page === "guide" ? "nav-item active" : "nav-item"} onClick={() => navigate("guide")}><BookOpen size={17} /><span>User Guide</span></button>
        </nav>
      </aside>
      <main className="main-content">
        <header className="topbar"><div className="breadcrumbs"><span>AgentProof</span><span className="crumb-separator">/</span><b>{pageTitle}</b></div><div className="topbar-right">{sessionId && <div className="env-label">SESSION {sessionId.slice(0, 8).toUpperCase()}</div>}<div className="env-label"><span className="env-indicator" />PAYPAL SANDBOX</div></div></header>
        {sessionId && page !== "dashboard" && page !== "connect" && page !== "guide" && <WorkflowProgress current={workflowStep} onNavigate={(target, step) => navigate(target, sessionId, step)} />}
        <ErrorBoundary key={page}>
          {page === "dashboard" ? (
            <Dashboard onOpenMerchant={() => navigate("merchant")} onOpenChaos={() => navigate("chaos")} onStartSession={() => navigate("connect")} onOpenSession={openSession} />
          ) : page === "connect" ? (
            <ConnectSystem onOpenSession={openSession} />
          ) : page === "merchant" ? (
            <Merchant
              onWorkflowStep={(step) => {
                if (step === "run_scenarios") {
                  navigate("chaos", sessionId, "run_scenarios")
                } else {
                  navigate("merchant", sessionId, step)
                }
              }}
            />
          ) : page === "chaos" ? (
            <ChaosLab onOpenMerchant={() => navigate("merchant")} onOpenAnalytics={() => navigate("analytics")} onWorkflowStep={(step) => navigate("chaos", sessionId, step)} />
          ) : page === "guide" ? (
            <Guide onStartSession={() => navigate("connect")} />
          ) : (
            <Suspense fallback={<div className="page-wrap"><div className="empty-state">Loading analytics…</div></div>}>
              <ChaosAnalytics onBack={() => navigate(analyticsOrigin)} workflowStep={workflowStep} />
            </Suspense>
          )}
        </ErrorBoundary>
        <footer className="page-footer"><span><LockKeyhole size={12} /> Sandbox environment · No live funds</span><span>AgentProof build 0.1.0</span></footer>
      </main>
    </div>
  )
}

function isWorkflowStep(value: string | null): value is WorkflowStepId {
  return value === "connect_system" || value === "create_order" || value === "verify_payment" || value === "run_scenarios" || value === "results" || value === "final_report"
}

function defaultStep(page: Page): WorkflowStepId {
  return page === "connect" ? "connect_system" : page === "merchant" ? "create_order" : page === "chaos" ? "run_scenarios" : page === "analytics" ? "results" : "connect_system"
}

function WorkflowProgress({ current, onNavigate }: { readonly current: WorkflowStepId; readonly onNavigate: (page: Page, step: WorkflowStepId) => void }) {
  const currentIndex = workflowSteps.findIndex((step) => step.id === current)
  return <nav className="workflow-progress" aria-label="Testing session progress">{workflowSteps.map((step, index) => <button key={step.id} className={`workflow-step ${index === currentIndex ? "active" : index < currentIndex ? "complete" : ""}`} aria-current={index === currentIndex ? "step" : undefined} onClick={() => onNavigate(step.page, step.id)}><span>{index < currentIndex ? "✓" : index + 1}</span><b>{step.label}</b></button>)}</nav>
}
