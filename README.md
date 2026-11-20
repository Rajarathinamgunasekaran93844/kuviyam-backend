# Kuviyam Publications API

Express 5 API with Prisma and PostgreSQL. The frontend is in `../../Publication_frontend/kuviyam-ecommerce`.

## Local setup

1. Copy `.env.example` to `.env` and fill in the database URL and a random `JWT_SECRET` of at least 32 characters. For Neon, use the pooled URL as `DATABASE_URL` and the direct URL as `DIRECT_DATABASE_URL`.
2. Install dependencies with `npm ci`.
3. Generate the Prisma client with `npm run prisma:generate`.
4. Apply checked-in migrations to a development database with `npx prisma migrate deploy`. Prisma uses `DIRECT_DATABASE_URL` for CLI migrations when it is set.
5. Set a unique `ADMIN_PASSWORD` (12 or more characters) and run `npm run seed` when creating the initial catalog/admin account.
6. Start with `npm run dev`.

For a disposable local UI/API run without PostgreSQL, start the API with `npm run dev:memory`; this uses process-local data, a temporary JWT key, and disables Razorpay and SMTP so local requests cannot reach those services. Catalog, users, carts and orders disappear on restart. Start Vite from the frontend folder with `npm run dev`; its development defaults call `http://localhost:5000/api`. Both servers bind to loopback by default. If a remote preview/browser needs the ports forwarded, set `DEV_HOST=0.0.0.0` for the API and pass `--host 0.0.0.0` to Vite. For persistent local data, configure a local PostgreSQL database and use `npm run dev`.

Never commit `.env` or use the example values as real credentials. The development-only in-memory mode is opt-in with `DATABASE_MODE=memory`; it is unavailable in production. Database errors return 503 rather than switching the API to transient storage.

## Payment deployment

The payment tracking migration adds nullable Razorpay order and payment identifiers with unique indexes. Before deploying the payment code, take a current database backup and apply all pending migrations using the deployment pipeline. This repository does not run migrations automatically. COD checkout does not depend on Razorpay credentials.

Online checkout requires valid Razorpay key ID/secret values. The backend calculates item prices from the catalog, stores a pending order for the authenticated account, verifies the Razorpay signature and captured payment details, and then marks that same order paid.

## Operational requirements and limits

- `/api/health` checks database readiness and returns 503 when it is unavailable.
- Rate limits currently use a per-process memory store. Use a shared store or gateway-level limits before running multiple API instances.
- Password reset requires SMTP settings. OTPs are kept in process memory for ten minutes, so use a shared store before horizontal scaling.
- Gallery image uploads use Cloudinary when `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are set. Existing database-stored media remains readable; new images fall back to database storage only when Cloudinary is not configured outside production.
- New gallery video uploads use authenticated Mux direct uploads when Mux credentials are configured. Set `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, and `MUX_WEBHOOK_SECRET`; configure a Mux webhook for `/api/webhooks/mux` with `video.upload.asset_created`, `video.asset.ready`, and `video.asset.errored` events. Videos upload from the browser directly to Mux, while PostgreSQL stores media metadata and playback IDs.
- Configure database backups, retention, restore drills, TLS, log retention, and error monitoring with the hosting provider. This repository cannot verify those account-level settings.
- Set `CLIENT_URL` to the exact comma-separated production frontend origins, `TRUST_PROXY_HOPS` to the number of trusted reverse proxies in front of Express, and size `DB_POOL_MAX` for the hosting plan and number of API instances.
- Set `NODE_ENV=production`, a production `DATABASE_URL`, `JWT_SECRET` and `CLIENT_URL` in the API host. The server binds to `0.0.0.0` in production and uses the platform `PORT`; local development binds to `127.0.0.1`. `DATABASE_MODE=memory` is deliberately disabled in production.

## Commands

- `npm run check` syntax-checks the server entry point.
- `npm run test` runs the Node.js built-in test suite.
- `npm run prisma:generate` regenerates Prisma Client from `prisma/schema.prisma`.
