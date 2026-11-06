# Failure shrinking

When a campaign finds a failing schedule, AgentProof applies bounded delta debugging. It removes chunks of events, reruns the candidate with the same deterministic model and fault configuration, and keeps a reduction only when the same target invariant failure remains. Invalid candidates that break required state transitions are rejected.

The result stores the original schedule, the minimal schedule, a sequence of event counts, attempt count in the engine result, and expected failure identifiers. The current default attempt ceiling is 500. This is a practical minimizer, not a proof of globally minimal schedules under every possible dependency relation.

The minimized schedule is saved as a versioned JSON regression artifact. The UI shows the reduction history and allows replay. Campaigns do not perform an external PayPal request while shrinking.
