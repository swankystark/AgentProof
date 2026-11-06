# CI use

The bounded campaign CLI is dependency-light and makes no PayPal or Gemini requests.

```sh
bun install --frozen-lockfile
bun test tests packages apps/api/src
bun run typecheck
bun run build
bun run chaos -- --seed=42 --runs=25 --actors=3
```

The command exits nonzero when an unexpected invariant failure is found. To verify a controlled vulnerability in a regression job, include `--inject-duplicate-fulfillment --expect-failure`; the command passes only when the campaign reproduces a failure. Seeds and actor/execution bounds are explicit for reproducible CI runs.

No GitHub Actions workflow is enabled in this repository yet. These commands can be added to the team's CI provider without external service secrets.
