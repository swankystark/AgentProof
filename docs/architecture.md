# Architecture

## Runtime flow

The reference merchant captures a human-readable business intent, cart contents, and an approved maximum. Checkout re-reads the stored intent and cart before creating a PayPal order. PayPal REST calls run only on the API server. The browser receives the Sandbox client ID and approval URL, while server-side capture/refund calls use OAuth credentials and stable `PayPal-Request-Id` values.

PayPal webhooks are signature-verified through PayPal's verification endpoint before an event is inserted. A unique event ID prevents duplicate processing. Trace records, payment rows, scenario runs, invariant results, incident reports, chaos campaigns, and explored execution schedules are stored in PostgreSQL using Drizzle.

The local chaos runner operates on an explicit payment state model. It generates bounded seeded interleavings, checks the deterministic invariant engine after each action, saves schedule snapshots, shrinks a failing schedule, and emits a logical replay artifact. It does not call PayPal. The separate reference checkout and scenario paths use real Sandbox APIs.

Gemini powers the buyer tool loop, structured scenario generation, evidence investigator, and AG Studio analytics assistant. API keys remain in the server process. AI output may explain evidence; invariant outcomes and readiness arithmetic are computed by deterministic code.

AG Studio consumes campaign summaries, execution schedules, invariant failures, and trace events through its React integration. Its assistant calls the API, which builds an evidence snapshot from PostgreSQL before sending a bounded prompt to Gemini.

## Components

- `apps/web`: dashboard, Chaos Lab, AG Studio surface, and reference merchant.
- `apps/api`: Hono API, PayPal adapter, Gemini calls, webhook verification, and persistence.
- `packages/contracts`: Zod request/response contracts.
- `packages/invariant-engine`: deterministic I1–I12 financial checks and score.
- `packages/scenario-engine`: scenario catalog and seeded schedule/model/shrinker/replay core.
- PostgreSQL: merchants, orders, PayPal records, traces, scenario evidence, and campaign schedules.

## State and side-effect boundary

The model's `PayPalState` and `MerchantState` transitions are explicit. External PayPal IDs are distinct from logical replay identities. Sandbox API calls require configured credentials; a model campaign never synthesizes PayPal results or signed webhook events.
