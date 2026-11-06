# Three-minute demo script

**0:00–0:15 — Set the problem.** “Traditional tests check a checkout path. AgentProof searches the event schedules where agentic payments stop being financially correct.” Open the Overview and point out the Sandbox integration status.

**0:15–0:35 — Show the reference system.** Open the merchant to show its approved maximum and real PayPal Sandbox approval flow. Do not imply a local model schedule has charged PayPal.

**0:35–1:00 — Start chaos.** Open Chaos Lab, set seed `17`, 25 schedules, three actors, and enable the explicitly labeled duplicate-fulfillment fault. Start the campaign. Explain local schedule exploration sends zero PayPal requests.

**1:00–1:25 — Show the found failure.** Read the capture/retry/fulfillment schedule, one capture versus duplicate fulfillment, the failed invariant IDs, and the shrink sequence. Clarify these are model results.

**1:25–1:45 — Replay and artifact.** Click Replay failure and show `REPRODUCED`. Expand the regression JSON to show the seed, schedule, expected invariant IDs, and logical replay identity.

**1:45–2:05 — Show analytics.** Open the AG Studio command center, build a report from the campaign, schedules, and invariant tables, and ask its assistant to summarize the recorded failures. State that deterministic invariant code is authoritative.

**2:05–2:35 — Confirm the external boundary.** For the longer prepared manual demo, approve a Sandbox order, capture it, and show the PayPal capture/webhook trace. These are actual Sandbox transactions, separate from local schedule exploration.

**2:35–2:55 — Close.** “AgentProof doesn't just test the happy path. It searches for the path you didn't know existed, reduces it to a replay, and keeps the financial oracle deterministic.”
