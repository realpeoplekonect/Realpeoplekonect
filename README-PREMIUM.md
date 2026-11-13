# LINKUP Premium implementation

This ZIP is based on the supplied LINKUP project. The app in this ZIP is a static HTML/CSS/JavaScript frontend served by Express, not React. Premium has been integrated into that existing architecture without replacing the other pages.

## Plans
- Monthly: NGN 1,860, billed monthly.
- Yearly: NGN 17,856, billed yearly (20% below 12 monthly payments).
- Free remains available.

## Flutterwave setup (required before live checkout)
Flutterwave recurring billing uses Payment Plans. Create two plans in the same Flutterwave environment as your secret key:
1. `LINKUP Premium Monthly`: amount `1860`, currency `NGN`, interval `monthly`, duration left empty/indefinite.
2. `LINKUP Premium Yearly`: amount `17856`, currency `NGN`, interval `yearly`, duration left empty/indefinite.

You can create them in the Flutterwave dashboard under Payment Plans, or with `POST https://api.flutterwave.com/v3/payment-plans` using:
```json
{"amount":1860,"name":"LINKUP Premium Monthly","interval":"monthly","currency":"NGN"}
```
and:
```json
{"amount":17856,"name":"LINKUP Premium Yearly","interval":"yearly","currency":"NGN"}
```
Copy each returned `data.id`. Put them in the server environment as `FLW_PREMIUM_MONTHLY_PLAN_ID` and `FLW_PREMIUM_YEARLY_PLAN_ID`.

Set these server environment variables (see `.env.premium.example`):
- `FLW_SECRET_KEY`: Flutterwave secret key for the same Test or Live environment as the plans.
- `FLW_WEBHOOK_SECRET`: a strong random webhook hash. Set the exact same value in Flutterwave Dashboard > Settings > Webhooks.
- `FLW_PREMIUM_MONTHLY_PLAN_ID`
- `FLW_PREMIUM_YEARLY_PLAN_ID`
- `CLIENT_URL`: public HTTPS origin of the LINKUP website, no trailing slash.
- Keep existing `MONGODB_URI`, `JWT_SECRET`, Cloudinary and other settings.

Configure this webhook URL in Flutterwave:
`https://YOUR-DOMAIN/api/premium/webhook`
Enable charge completed and subscription cancelled events. The webhook checks the `verif-hash` header and independently verifies transaction details with Flutterwave before updating membership.

## Files changed/added
- `server/models/User.js`: subscription and profile-like fields.
- `server/models/PremiumPayment.js`: payment records with unique references/transaction IDs.
- `server/models/ProfileView.js`: profile visit history.
- `server/routes/premium.js`: plans, checkout, server-side verification, webhook, cancellation, profile-viewer/profile-like endpoints.
- `server/routes/users.js`: premium search gating, profile view tracking, premium priority ordering, free daily connection-request limit.
- `server/routes/admin.js`: Premium member counts and payment/revenue summary.
- `server/server.js`: mounts Premium API.
- `public/premium.html`, all navigation headers, `public/js/app.js`, `public/css/styles.css`: subscription page, plan switcher, checkout, benefit panels and badges.
- `public/admin.html`: Premium management summary.

## User experience and safeguards
- Payment secrets remain server-side.
- Checkout sends the Flutterwave `payment_plan` ID and only allows card payments because Flutterwave payment-plan subscriptions are card-only.
- Returning from checkout does not itself grant Premium. The backend verifies the transaction ID, reference, status, currency and amount.
- Webhooks independently verify charges and are safe against duplicate transaction notifications.
- Flutterwave handles future recurring charges and retries; webhook notifications update the LINKUP membership record.
- Cancellation stops future recurring billing through Flutterwave; the user keeps Premium until the already-paid period ends.
- Free members can send up to 5 connection requests per day; Premium removes that limit.
- Advanced discovery search is server-gated to Premium.
- Profile viewers and profile likes are only readable by the profile owner with active Premium. Authenticated profile visits are recorded.
- Ad-free browsing is represented as a Premium entitlement; the current supplied app has no ad-serving system, so there are no ads to suppress yet.

## Deployment
1. Back up the existing project/database.
2. Merge the changed files into the same paths in the project; do not upload `node_modules`.
3. Add the environment variables to the hosting provider.
4. Create the two Flutterwave payment plans and set their IDs.
5. Configure the HTTPS webhook URL and secret hash.
6. Deploy/restart the Node server.
7. Test with Flutterwave Test keys and Test plan IDs first; only switch to Live keys and Live plan IDs after a successful end-to-end test.
8. Log in, open Premium from the navigation, select a plan and complete a card test payment.
9. Confirm the user record has `subscription.plan=premium`, `subscription.status=active`, and a future `expiryDate`.

Do not put the Flutterwave secret key or webhook hash in frontend files or commit them to Git.
