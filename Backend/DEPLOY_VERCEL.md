# Deploy Backend to Vercel

## 1. Project settings

Deploy the `Backend` folder as the Vercel project root.

Vercel settings:

- Framework Preset: Other
- Build Command: empty
- Output Directory: empty
- Install Command: `npm install`

## 2. Environment variables

Add these variables in Vercel Project Settings -> Environment Variables.

Required for core API:

- `MONGO_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `FRONTEND_URL`
- `BACKEND_URL`

Required when using the related features:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`
- `BREVO_SENDER_NAME` (optional, defaults to `No-Reply`)
- `PAYOS_CLIENT_ID`
- `PAYOS_API_KEY`
- `PAYOS_CHECKSUM_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_FALLBACK_MODELS`
- `FITROOM_API_KEY`
- `FITROOM_API_KEY_2`
- `DNS_SERVERS`

After the first deployment, set `BACKEND_URL` to your Vercel deployment URL, for example:

```txt
https://your-backend.vercel.app
```

## 3. Deploy with CLI

From this folder:

```bash
vercel --prod
```

## 4. Confirm the payOS webhook

The canonical webhook for both shop orders and AI packages is:

```txt
https://your-backend.vercel.app/api/payos/webhook
```

After `BACKEND_URL` and the three `PAYOS_*` variables are available locally, register and validate it with:

```bash
npm run payos:confirm-webhook
```

For an existing database created before the unified `Payment` model, run this once before confirming the webhook:

```bash
npm run payos:migrate-payments
```

Run this again whenever the production backend URL or payOS payment channel changes. The legacy
`/api/ai-packages/webhook/payos` path remains an alias, but must not be configured as a second webhook.

MongoDB must be a replica set (MongoDB Atlas satisfies this) because payment fulfillment uses database
transactions to guarantee that duplicate webhooks cannot grant AI credits twice.

## 5. Test

Open:

```txt
https://your-backend.vercel.app/
https://your-backend.vercel.app/docs
```

Use API paths exactly like local:

```txt
https://your-backend.vercel.app/api/auth/login
https://your-backend.vercel.app/api/products
```

## Notes

- Do not upload `.env` to git.
- Avatar upload using local `/image` storage is not durable on Vercel serverless. Prefer the Cloudinary upload endpoint `/api/upload`.
- See `PAYOS_INTEGRATION.md` for the frontend return-page and polling contract.
