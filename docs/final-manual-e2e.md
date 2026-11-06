# Final manual end-to-end test

This guide is for the first complete checkout run. The project has only been tested at component level; do not treat the PayPal checkout, external webhook delivery, or deployment as locally verified until you complete these steps.

## Prerequisites

- Bun 1.x, Docker Desktop, and PayPal Sandbox business/buyer accounts.
- `.env` contains Sandbox client ID/secret, `PAYPAL_ENV=sandbox`, and Gemini key if you want the AI functions. Keep passwords and keys out of chat and screenshots.
- For external webhooks, deploy or tunnel a public HTTPS endpoint first, register `https://<public-host>/api/webhooks/paypal` on the Sandbox REST app, subscribe to capture/refund completion, and save its webhook ID as `PAYPAL_WEBHOOK_ID` in `.env`. Restart the API after changing `.env`.
- For an unwatermarked AG Studio deployment, add a valid trial/deployment `AG_STUDIO_LICENSE_KEY`. Local development can proceed without it.

## Start and check services

From the project root:

```sh
bun install
docker compose up -d postgres
bun run db:migrate
bun run dev
```

Open <http://localhost:5173>. In another terminal:

```sh
curl http://localhost:8787/health
curl http://localhost:8787/ready
```

Expected: `/ready` returns `ready: true`; `/health` reports the database connected, PayPal configured and connected, Gemini configured if its key is present, webhook configuration state, and AG Studio license state. A missing optional integration must be reported as not configured.

Failure looks like: `/ready` returns 503 (database or migrations); `/health` shows PayPal OAuth disconnected (check Sandbox client credentials and `PAYPAL_ENV`); Gemini remains unavailable if its key is absent.

## Normal PayPal Sandbox purchase

1. Open <http://localhost:5173/merchant> and add one product to the cart.
2. Set a business intent limit above the cart total and click the checkout/PayPal button.
3. Confirm PayPal opens the Sandbox approval page for that total.
4. Sign in with a Sandbox personal buyer account, approve once, and return to the merchant.
5. Confirm the merchant reports a completed capture ID. Verify it in the PayPal Sandbox business account activity.
6. If webhook setup is complete, wait for delivery and confirm a verified capture event appears in AgentProof's trace. If it is not configured, the health endpoint should say so; do not fabricate a webhook result.
7. Attempt a refund from the captured payment. Confirm a PayPal Sandbox refund ID and a total no larger than the capture.

Failure looks like: the browser never leaves for PayPal (client ID or script issue); approval returns but capture fails (API logs show a safe error); an amount over the approved maximum must be rejected before order creation; a webhook is not accepted unless PayPal signature verification succeeds.

## Chaos campaign and replay

8. Return to <http://localhost:5173> and open **Chaos Lab**.
9. Run a baseline with seed `42`, 25 schedules, three actors, and duplicate fulfillment disabled.
10. Confirm the result says local model exploration and `PayPal requests: 0`.
11. Enable **Inject duplicate fulfillment**, set seed `42`, and start another campaign.
12. Confirm the campaign shows a failed invariant (including I4 or I11), a minimized counterexample, and the shrink progression.
13. Click **Replay failure**. Expected: `REPRODUCED` with the same expected invariant class. Replay uses the logical schedule, not the old PayPal capture ID.
14. Expand **Regression artifact JSON** and save it if you want a portable regression fixture.
15. Disable duplicate fulfillment and rerun seed `42`. The generated campaign should show no duplicate-fulfillment finding when that fault is absent.

Failure looks like: no schedules (invalid bounds); an unsafe run with no violation (unexpected engine regression); a safe replay that no longer reproduces after a code change (regression no longer matches or has been fixed).

## Analytics and AI

16. Open **Command center** and refresh evidence.
17. In AG Studio, add a campaign summary, invariant, or execution schedule view and filter/group it as needed.
18. Open the Studio assistant and ask: “Show failures where capture retries overlap fulfillment.” Check that it refers to recorded seed/schedule/invariant evidence and labels model exploration accurately.
19. If Gemini is missing, the assistant must report unavailable; no generated fallback should be presented as a real Gemini response.

## Optional deployment validation

20. Deploy `render.yaml` as a Render Blueprint, enter Sandbox/Gemini credentials through Render secret prompts, and wait for `/ready` to pass. Set up the Sandbox webhook against the deployed API before testing external delivery. Keep production credentials and live-fund flows disabled.

Run the focused local checks any time with:

```sh
bun test tests packages apps/api/src
bun run typecheck
bun run build
bun run chaos -- --seed=42 --runs=25 --actors=3
```
