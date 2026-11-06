# Chaos engine

The current bounded engine lives in `packages/scenario-engine/src/chaos.ts`. It models PayPal and merchant states, validates explicit PayPal and merchant transitions, generates deterministic order-preserving interleavings from a seeded linear-congruential PRNG, executes each schedule against an in-memory payment model, checks invariants after each action, and reports campaign statistics.

## Campaign inputs

A campaign records its name, seed, maximum schedule count, actor count, approved maximum, and whether controlled duplicate fulfillment is injected. The API validates execution limits (1–1,000) and actor limits (1–3) before persisting schedules and results.

The actor traces currently represent buyer order/approval/capture/retry, webhook delivery/fulfillment/redelivery, and a fulfillment worker. Per-actor order is preserved while actors are interleaved. A webhook has a causal dependency on successful capture; a pre-capture delivery is recorded as an attempted but ineffective action.

## Faults and evidence boundary

The model includes response loss, duplicate webhook delivery, duplicate fulfillment, and worker-crash-after-effect annotations. In this implementation the worker crash is an event annotation; it does not restart a real process. Local campaign results are never represented as PayPal requests. Real PayPal negative tests and signed webhook processing remain separate API paths.

## Seed and coverage

The same input seed and configuration generate the same candidate schedule sequence. The runner samples bounded valid interleavings; it does not claim exhaustive schedule coverage. `schedulesGenerated` and `executions` report actual local runs. PayPal rate limits and external transaction cost are avoided during broad local exploration; representative conditions must be confirmed through the separate Sandbox workflow.

The saved result contains each schedule, its failed invariant identifiers, and a model state snapshot. The first failure is shrunk and saved alongside the campaign summary.
