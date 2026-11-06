# Merchant adapter boundary

The current runnable target is the AgentProof reference merchant. Its operations are split across the API merchant services and the deterministic model actions: create intent/order, approve, capture, retry, deliver webhook, fulfill, refund, and reconcile.

The abstraction boundary a third-party integration should implement is:

1. Provide a deterministic initial merchant/payment snapshot and protected intent ID.
2. Expose named operations with input validation and a structured result/evidence event.
3. Define reset/fixture behavior for local candidate schedules.
4. State which actions can be simulated locally and which require a fresh external Sandbox transaction.
5. Provide an idempotency key strategy for every financial side effect.

The current code does not yet ship a generic SDK, user-supplied adapter loader, or arbitrary merchant HTTP integration. The campaign runner's core API is reusable; production adapter isolation, auth, lifecycle, and side-effect permissions remain implementation work before claiming third-party compatibility.
