import { ArrowRight, BookOpen, CheckCircle2, CircleHelp, ShieldCheck, Terminal } from "lucide-react"

export function Guide({ onStartSession }: { readonly onStartSession: () => void }) {
  return (
    <div className="page-wrap guide-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow"><span className="live-pip" /> USER GUIDE <span className="heading-divider">/</span> DOCUMENTATION</div>
          <h1>How to use AgentProof.</h1>
          <p>Everything you need to know about testing PayPal checkout flows and exploring failure scenarios.</p>
        </div>
        <div className="heading-actions">
          <button className="button button-primary" onClick={onStartSession}><ArrowRight size={15} /> Start a testing session</button>
        </div>
      </div>

      {/* Guided 5-Step Workflow */}
      <section className="panel" style={{ padding: "1.75rem", marginBottom: "1.75rem" }}>
        <div className="panel-heading" style={{ marginBottom: "1.25rem" }}>
          <div>
            <div className="eyebrow">STEP-BY-STEP WORKFLOW</div>
            <h2>The Testing Lifecycle</h2>
            <p>From initial connection through sandbox payment and automated failure exploration.</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
          <div style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)", borderRadius: "8px", background: "var(--surface-primary)" }}>
            <span style={{ display: "inline-block", width: "26px", height: "26px", borderRadius: "50%", background: "var(--accent-primary)", color: "#fff", textAlign: "center", lineHeight: "26px", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.75rem" }}>1</span>
            <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>Connect System</h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Verifies the Northstar Goods store, database connectivity, and PayPal Sandbox API keys before initiating test orders.
            </p>
          </div>

          <div style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)", borderRadius: "8px", background: "var(--surface-primary)" }}>
            <span style={{ display: "inline-block", width: "26px", height: "26px", borderRadius: "50%", background: "var(--accent-primary)", color: "#fff", textAlign: "center", lineHeight: "26px", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.75rem" }}>2</span>
            <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>Create Test Order</h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Select items from the catalog and confirm your approved maximum spend. A spending limit guarantees no excess charge can occur.
            </p>
          </div>

          <div style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)", borderRadius: "8px", background: "var(--surface-primary)" }}>
            <span style={{ display: "inline-block", width: "26px", height: "26px", borderRadius: "50%", background: "var(--accent-primary)", color: "#fff", textAlign: "center", lineHeight: "26px", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.75rem" }}>3</span>
            <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>Verify Real Payment</h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Approve and capture using a real PayPal Sandbox account. This establishes verified evidence before scenario stress-testing unlocks.
            </p>
          </div>

          <div style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)", borderRadius: "8px", background: "var(--surface-primary)" }}>
            <span style={{ display: "inline-block", width: "26px", height: "26px", borderRadius: "50%", background: "var(--accent-primary)", color: "#fff", textAlign: "center", lineHeight: "26px", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.75rem" }}>4</span>
            <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>Explore Chaos Scenarios</h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Run interleavings simulating dropped networks, duplicate webhooks, race conditions, and retry storms without charging real money.
            </p>
          </div>

          <div style={{ padding: "1.25rem", border: "1px solid var(--border-subtle)", borderRadius: "8px", background: "var(--surface-primary)" }}>
            <span style={{ display: "inline-block", width: "26px", height: "26px", borderRadius: "50%", background: "var(--accent-primary)", color: "#fff", textAlign: "center", lineHeight: "26px", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.75rem" }}>5</span>
            <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>Inspect & Export Report</h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Inspect minimal counterexamples, shrink sequences, or ask questions in AG Studio. Export audit-ready reports as structured JSON.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
