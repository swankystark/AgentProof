# Replay and regression artifacts

Each discovered counterexample receives a stable logical replay identity derived from the seed and reduced schedule length. The regression JSON records schema version, seed, action order, expected invariant IDs, and logical identity.

Replay executes the recorded logical actions against the current local payment model and reports `REPRODUCED` only when the expected invariant set matches. It deliberately does not reuse an old PayPal order, capture, or refund identifier: an external replay must create fresh Sandbox resources while preserving the logical schedule conditions.

The API exposes `POST /api/chaos/replay`; the campaign result exposes a portable regression JSON object suitable for storing in a source-controlled fixture. Use the CLI for fresh seeded campaigns and the dashboard replay control for a saved minimized schedule.
