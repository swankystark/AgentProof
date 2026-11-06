# Threat model

## Assets

Human-approved amount and purchase intent; PayPal client secret and Gemini key; PayPal order, authorization, capture, and refund state; merchant fulfillment count; webhook authenticity; and persisted evidence.

## Threats and controls

- **Prompt injection in product text:** catalog descriptions are treated as untrusted by the buyer system prompt. Server-side cart and amount rules remain authoritative.
- **Agent hallucination or excess action:** buyer tools are bounded by server-side Zod validation, human-approved ceiling, and a human PayPal approval step. The model cannot directly capture funds.
- **Duplicate capture or retry:** stable idempotency request IDs and unique capture IDs prevent repeated local side effects; the chaos model explores response loss and retry schedules.
- **Webhook forgery/replay:** webhook signatures are verified with PayPal before processing; a unique event ID suppresses a repeated event. The local model's webhook event is labeled as simulated and is not shown as a signed PayPal event.
- **State divergence:** trace and payment evidence are reconciled by deterministic invariants. AI explanations do not override that oracle.
- **Refund overrun:** refund totals are locked and checked against captured amount before calling PayPal.
- **Intent drift:** checkout rechecks the approved maximum and recomputes the persisted cart total before order creation.
- **Secret exposure:** API credentials are server-only; errors avoid returning PayPal payloads and keys; `.env` is git-ignored.
- **Campaign abuse/cost:** local campaign limits cap executions at 1,000 and do not contact external services. PayPal and Gemini calls are separate user-triggered paths.

## Limits

The local campaign models the included reference workflow. It does not prove arbitrary merchant implementations correct or exhaustively model PayPal's distributed internals. The webhook endpoint needs a registered Sandbox webhook ID and a publicly reachable URL for external delivery. Rate limiting and authenticated multi-tenant access are not implemented; do not expose the demo API as a production merchant service.
