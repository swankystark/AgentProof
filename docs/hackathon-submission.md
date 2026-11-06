# PayPal AI Hackathon submission draft

## Problem

Autonomous agents turn checkout into a distributed system. Retries, delayed notifications, worker races, and ambiguous network failures can produce duplicate fulfillment or merchant/PayPal state divergence even when each component passes its ordinary happy-path tests.

## Solution

AgentProof is a model-based chaos-engineering platform for agentic commerce. It generates bounded seeded event interleavings, evaluates deterministic financial invariants after each event, shrinks failures into minimal counterexamples, and saves exact logical replay/regression artifacts. The included merchant provides a reference system and controlled local fault injection.

## PayPal usage

The reference merchant uses PayPal Sandbox OAuth, Orders v2, capture, authorization/capture/void, refunds, request idempotency, and signature-verified webhooks. PayPal Sandbox supplies transaction evidence for explicit checkout flows. Local campaign runs do not pretend to be PayPal transactions and send zero PayPal requests.

## AI usage

Gemini can operate the buyer agent through validated merchant tools, generate scenario candidates, investigate deterministic invariant evidence, and summarize campaign evidence inside AG Studio. AI does not determine financial correctness or the resilience score.

## AG Studio usage

AG Studio provides a self-serve analytics surface over actual campaign, schedule, invariant, and trace records. Operators can compose and cross-filter their own chaos reports; its assistant uses server-side evidence and a Gemini adapter.

## Impact and innovation

The key differentiator is schedule exploration plus automatic failure shrinking and replay, rather than another fixed collection of checkout attacks. Bounded local exploration keeps broad schedule searches cheap; representative cases can then be confirmed through PayPal Sandbox.

## Technical implementation

Bun/TypeScript monorepo; React and AG Studio; Hono API; PostgreSQL/Drizzle; PayPal REST/JS SDK; Gemini; deterministic I1–I12 invariants; seeded interleaving scheduler; delta-debug shrinker; logical replay; and portable JSON regression cases.

## Current scope

The campaign model targets the included reference merchant and its payment lifecycle. Generic third-party adapter loading, exhaustive exploration, and live full-flow verification remain outside the locally verified scope.
