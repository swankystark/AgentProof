# AgentProof

**Deterministic Payment Resilience & Chaos Testing Platform**

AgentProof battle-tests payment checkouts against real-world chaos—network drops, duplicate webhooks, retry storms, and race conditions—before they hit production. It pairs real PayPal Sandbox transactions with local property-based chaos exploration, catches subtle payment violations, and shrinks them to the exact minimal sequence required to reproduce the bug.

---

## ⚠️ Problem Statement

In real-world e-commerce, checkouts are distributed and timing-dependent. When network latency or retries occur:
- **Double Charges:** A buyer retrying a timed-out checkout gets billed twice.
- **Duplicate Fulfillments:** A webhook delivered twice triggers two warehouse shipments for one order.
- **Authorization Breaches:** Race conditions allow captures to exceed buyer-approved amounts.

Standard unit tests run sequentially and pass 100% of the time. PayPal's staging sandbox cannot simulate concurrency or message races. These silent bugs remain undiscovered until customers complain.

---

## 💡 Solution

AgentProof brings deterministic chaos testing to modern payment checkouts:
1. **Live Sandbox Verification:** Connects to real PayPal Sandbox REST APIs with cryptographically verified webhooks.
2. **Deterministic Chaos Engine:** Simulates interleaved buyer retries, network timeouts, and duplicate webhook worker deliveries.
3. **Automated Invariant Oracle:** Enforces financial rules (exact-once fulfillment, capture limits, idempotent webhooks).
4. **Minimal Counterexample Shrinking:** When a failure occurs across dozens of actions, AgentProof prunes it down to the exact 2 or 3 steps that caused it.
5. **AI Attack Scenarios:** Google Gemini generates adversarial edge cases tailored to specific merchant conditions.
6. **AG Studio Analytics:** Interactive charts and an AI assistant visualize failure distributions and risk areas.

---

## 🏛️ Architecture

```mermaid
flowchart LR
    subgraph UI ["Frontend (React 19 + AG Studio)"]
        A[Testing Sessions] --> B[Live Checkout Demo]
        B --> C[Chaos Lab]
        C --> D[AG Studio Analytics]
    end

    subgraph Core ["Backend (Bun + Hono)"]
        E[API Gateway]
        F[Deterministic Chaos Explorer]
        G[Delta-Debug Shrinker]
        H[Invariant Engine]
    end

    subgraph Integrations ["Integrations & Storage"]
        P[(PostgreSQL + Drizzle)]
        PP[PayPal Sandbox REST API v2]
        W[Cryptographic Webhook Verifier]
        AI[Google Gemini 2.5 Flash]
    end

    A --> E
    B --> PP
    PP --> W
    W --> P
    C --> F
    F --> H
    H -->|Violation Found| G
    G --> P
    D --> AI
    E --> P
```

---

## 🧰 Tech Stack

| Category | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, AG Grid, AG Studio |
| **Backend** | Bun Runtime, Hono API framework |
| **Database** | PostgreSQL, Drizzle ORM |
| **Payments** | PayPal REST SDK v2, Cryptographic Webhook Signature Verification |
| **AI** | Google Gemini 2.5 Flash (scenario generation + plain-English analytics assistant) |
| **Testing** | Custom property-based chaos explorer with delta-debugging shrinking |

---

## 🚀 Key Features

- **End-to-End Real Sandbox Payment:** Real catalog checkout with live PayPal approval and server-side capture.
- **Cryptographic Webhook Verification:** Real-time certificate validation, deduplication checks, and persistent audit logs.
- **Chaos Lab:** Execute seeded adversarial schedules across concurrent buyer, worker, and network actors.
- **Minimal Bug Counterexamples:** Automatically simplifies 20-step chaos schedules down to minimal 2-step reproducible bug reports.
- **Interactive AG Studio Analytics:** 5 pre-built analytical datasets to explore test outcomes, schedules, and violation categories.
- **AI Analytics Assistant:** Conversational insights explaining payment risks without cryptic error codes.
- **Session Management:** Start, resume, review, and delete test sessions with full historical evidence.

---

## ⚙️ Setup & Installation

### Prerequisites
- [Bun](https://bun.sh/) (v1.x)
- Docker & Docker Compose (for PostgreSQL)
- Node.js 18+ (optional, for tooling)

### 1. Clone & Install
```bash
git clone https://github.com/swankystark/AgentProof.git
cd AgentProof
bun install
```

### 2. Environment Configuration
Copy the example environment file and fill in your credentials:
```bash
cp .env.example .env
```
Key environment variables:
```env
DATABASE_URL=postgresql://agentproof:agentproof@localhost:5432/agentproof
PAYPAL_CLIENT_ID=your_paypal_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_paypal_sandbox_client_secret
PAYPAL_WEBHOOK_ID=your_paypal_webhook_id
GEMINI_API_KEY=your_gemini_api_key
```

### 3. Start Database & Run Migrations
```bash
docker compose up -d postgres
cd apps/api
bun run db:migrate
cd ../..
```

---

## 🏃 Running the Application

### Start Development Servers
```bash
bun run dev
```
- **Web UI:** `http://localhost:5173`
- **API Server:** `http://localhost:8787`

### Run Deterministic Chaos CLI (Offline Model Testing)
```bash
# Run 25 bounded chaos schedules
bun run chaos -- --seed=42 --runs=25 --actors=3

# Injected fault testing (should catch violation)
bun run chaos -- --seed=17 --runs=25 --actors=3 --inject-duplicate-fulfillment --expect-failure
```

### Typecheck & Build
```bash
bun run typecheck
bun run build
```
