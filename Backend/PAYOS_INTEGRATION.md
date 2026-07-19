# payOS integration contract

The backend uses one `Payment` lifecycle and one signed webhook for both shop orders and AI package purchases.

## Production webhook

Configure the payOS payment channel with exactly this URL:

```txt
POST {BACKEND_URL}/api/payos/webhook
```

The backend verifies the payOS signature before changing data. Unknown signed order codes are acknowledged with
HTTP 200 so payOS can validate the URL without creating test application records.

## Canonical statuses

Payment and AI transaction statuses are always returned as one of:

```txt
PENDING
PAID
CANCELLED
FAILED
REFUNDED (Payment only)
```

## AI package frontend flow

1. Call `POST /api/ai-packages/purchase` with the bearer token and `packageId`.
2. Keep the returned `transaction.id`, `paymentId`, and `orderCode`, then navigate to `checkoutUrl`.
3. payOS redirects to `/ai/payment-result` or `/ai/cancel` and appends `orderCode`, `status`, `code`, and its link `id`.
4. Treat those query parameters as display hints only. With the bearer token, call:

   ```txt
   GET /api/ai-packages/payment-status/{orderCode}
   ```

5. If `paymentStatus` is `PENDING`, poll every 1-2 seconds for up to 60 seconds. Show success only for `PAID`.
6. The status endpoint asks payOS directly while local state is pending, so it also recovers from a delayed webhook.

The generic authenticated endpoint `GET /api/payos/payment-status/{orderCode}` supports both target types. Existing
shop clients may continue using `GET /api/orders/payment-status/{orderCode}`.

## Fulfillment guarantees

- A package payment, its AI transaction, and the user's credit balance update in one MongoDB transaction.
- Replaying the same valid webhook does not grant credits again.
- Payment amount and ownership are checked before fulfillment or status disclosure.
- A package payment is linked through `Payment.aiTransaction`; an order payment uses `Payment.order`.
