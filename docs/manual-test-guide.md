# Manual test guide

The full first checkout run is in [final-manual-e2e.md](final-manual-e2e.md). It covers service startup, health checks, real PayPal Sandbox buyer approval/capture/refund, optional verified webhook delivery, the safe and vulnerable seeded campaigns, counterexample shrinking/replay, regression JSON, and AG Studio analytics.

The independent local campaign component check is:

```sh
bun run chaos -- --seed=17 --runs=25 --actors=3 --inject-duplicate-fulfillment --expect-failure
```

Expected: JSON reports `passed: true`, the `local_model_exploration` mode, `externalPaymentRequests: 0`, and an invariant counterexample. This command does not need PostgreSQL, PayPal, or Gemini.
