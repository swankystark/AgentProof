# PayPal integration

The API targets PayPal Sandbox at `https://api-m.sandbox.paypal.com` and uses OAuth client credentials. The browser gets only the public client ID needed for PayPal JS Buttons. The server keeps the client secret and performs order creation, capture, authorization, authorization capture/void, refund, order retrieval, and webhook signature verification.

## Order and capture

`POST /api/merchant/orders` validates the intent, amount, currency, and approved maximum, then creates a PayPal Orders v2 `CAPTURE` order. Approval takes place through the PayPal JS SDK. The API captures with a stable `PayPal-Request-Id`, records the unique capture ID, updates fulfillment exactly once, emits evidence, and evaluates invariants.

## Authorization

`POST /api/merchant/authorization-orders` creates an Orders v2 `AUTHORIZE` order. After buyer approval call `POST /api/merchant/orders/:id/authorize`; capture the returned authorization through `POST /api/merchant/authorizations/:id/capture`, or void it through `/api/merchant/authorizations/:id/void`. Capture and void use stable request IDs.

## Refund

`POST /api/merchant/refunds` accepts a captured payment only. An advisory transaction lock and stored refund total prevent concurrent/repeated refunds from exceeding the capture. The refund uses a stable request ID.

## Webhook

Register the Sandbox app webhook at `/api/webhooks/paypal` and subscribe to capture completion/refund events. Set `PAYPAL_WEBHOOK_ID` to the ID PayPal assigns. The receiver calls PayPal's `verify-webhook-signature` endpoint and stores the event only after `SUCCESS`; the event ID is unique.

## Negative testing and evidence

`PAYPAL-Mock-Response` is accepted only when `PAYPAL_NEGATIVE_TESTING=true` and a request carries a validated allowed profile. Keep it off for ordinary demos. Local chaos fault annotations are not PayPal responses and do not create fake captures or signed webhooks. `PayPal-Request-Id` is used for order, capture, authorize, capture-authorized, void, and refund operations.

Before a full test, use `/health` to confirm Sandbox OAuth. This component check makes no order or payment. Follow [the manual guide](final-manual-e2e.md) for the buyer approval and capture test.
