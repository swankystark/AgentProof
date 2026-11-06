import { lazy, Suspense, useEffect, useState } from "react"
import { Activity, ArrowUpRight, CircleHelp, CreditCard, Fingerprint, LayoutDashboard, LifeBuoy, LockKeyhole, Menu, Network, Settings2, ShieldCheck, Store, Waves } from "lucide-react"
import { Dashboard } from "./Dashboard"
import { Merchant } from "./Merchant"
import { ChaosLab } from "./ChaosLab"
const ChaosAnalytics = lazy(() => import("./ChaosAnalytics").then((module) => ({ default: module.ChaosAnalytics })))

type Page = "dashboard" | "merchant" | "chaos" | "analytics"

export function App() {
  const pageFromPath = (): Page => window.location.pathname === "/merchant" ? "merchant" : window.location.pathname === "/chaos" ? "chaos" : window.location.pathname === "/analytics" ? "analytics" : "dashboard"
  const [page, setPage] = useState<Page>(pageFromPath)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const syncPath = () => setPage(pageFromPath())
    window.addEventListener("popstate", syncPath)
    return () => window.removeEventListener("popstate", syncPath)
  }, [])
  const navigate = (next: Page) => {
    setPage(next)
    window.history.pushState({}, "", next === "merchant" ? "/merchant" : next === "chaos" ? "/chaos" : next === "analytics" ? "/analytics" : "/")
  }

  return (
    <div className={`shell ${compact ? "shell--compact" : ""}`}>
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><ShieldCheck size={20} strokeWidth={2.2} /></div><div><strong>agentproof</strong><span>COMMERCE SECURITY</span></div><button className="icon-button sidebar-toggle" aria-label="Toggle navigation" onClick={() => setCompact((value) => !value)}><Menu size={18} /></button></div>
        <div className="workspace-switch"><div className="workspace-avatar">N</div><div><b>Northstar Goods</b><span>Sandbox merchant</span></div><ArrowUpRight size={15} /></div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={page === "dashboard" ? "nav-item active" : "nav-item"} onClick={() => navigate("dashboard")}><LayoutDashboard size={17} /><span>Overview</span></button>
          <button className={page === "chaos" ? "nav-item active" : "nav-item"} onClick={() => navigate("chaos")}><Waves size={17} /><span>Chaos Lab</span></button>
          <button className={page === "analytics" ? "nav-item active" : "nav-item"} onClick={() => navigate("analytics")}><Activity size={17} /><span>Command center</span></button>
          <button className="nav-item" onClick={() => navigate("analytics")}><CreditCard size={17} /><span>Evidence</span></button>
          <button className="nav-item" onClick={() => navigate("analytics")}><Fingerprint size={17} /><span>Invariant results</span></button>
          <button className={page === "merchant" ? "nav-item active" : "nav-item"} onClick={() => navigate("merchant")}><Store size={17} /><span>Demo merchant</span><ArrowUpRight size={13} className="nav-external" /></button>
        </nav>
        <div className="nav-label nav-label--lower">CONFIGURE</div>
        <nav className="main-nav" aria-label="Configuration">
          <button className="nav-item" onClick={() => navigate("dashboard")}><Network size={17} /><span>Integrations</span></button>
          <button className="nav-item" onClick={() => navigate("dashboard")}><Settings2 size={17} /><span>Settings</span></button>
        </nav>
        <div className="sidebar-bottom"><div className="support-link"><LifeBuoy size={17} /><span>Help center</span><ArrowUpRight size={13} /></div><div className="sidebar-profile"><div className="profile-avatar">JD</div><div><b>Jordan Davis</b><span>Demo workspace</span></div><CircleHelp size={17} /></div></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div className="breadcrumbs"><span>AgentProof</span><span className="crumb-separator">/</span><b>{page === "dashboard" ? "Overview" : page === "merchant" ? "Reference merchant" : page === "chaos" ? "Chaos Lab" : "Command center"}</b></div><div className="topbar-right"><div className="env-label"><span className="env-indicator" />PAYPAL SANDBOX</div><div className="top-avatar">JD</div></div></header>
        {page === "dashboard" ? <Dashboard onOpenMerchant={() => navigate("merchant")} onOpenChaos={() => navigate("chaos")} /> : page === "merchant" ? <Merchant /> : page === "chaos" ? <ChaosLab onOpenMerchant={() => navigate("merchant")} onOpenAnalytics={() => navigate("analytics")} /> : <Suspense fallback={<div className="page-wrap"><div className="empty-state">Loading analytics…</div></div>}><ChaosAnalytics onBack={() => navigate("chaos")} /></Suspense>}
        <footer className="page-footer"><span><LockKeyhole size={12} /> Sandbox environment · No live funds</span><span>AgentProof build 0.1.0</span></footer>
      </main>
    </div>
  )
}
