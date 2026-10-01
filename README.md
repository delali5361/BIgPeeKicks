# Big Pee Kicks

A responsive online shop for shoes, sneakers, and slides, with a product catalog, 3D product presentation, shopping cart, checkout, buyer accounts, and an admin area for store operations.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Run locally](#run-locally)
- [Create the Supabase database](#create-the-supabase-database)
- [Environment variables](#environment-variables)
- [Payments](#payments)
- [Product image storage](#product-image-storage)
- [Deploy to Vercel](#deploy-to-vercel)
- [SMS notifications](#sms-notifications)
- [Useful commands](#useful-commands)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)

## Features

- Product browsing, product details, sizing, stock, and wishlist.
- Persistent cart and checkout with delivery details.
- Buyer registration, login, account, order history, and return requests.
- Paystack checkout in Ghana cedis (GHS).
- Admin dashboard for products, orders, payments, customers, returns, settings, and notifications.
- Product image uploads to Supabase Storage.
- Optional Arkesel SMS alerts for selected order events.
- Responsive pages, motion effects, and interactive 3D product scenes.

## Requirements

- Node.js 22 LTS recommended.
- pnpm (the repository includes `pnpm-lock.yaml`; Corepack can provide pnpm).
- A Supabase project for the application database.

Enable Corepack if pnpm is not available:

```sh
corepack enable
```

## Run locally

Clone the repository using its Git URL, then from the project directory install dependencies:

```sh
git clone <repository-url>
cd pee-sneaker-studio
pnpm install
```

Create the Supabase database by following [Create the Supabase database](#create-the-supabase-database). Then create a `.env` file in the project root and add the required settings from [Environment variables](#environment-variables).

Start the development server:

```sh
pnpm dev
```

Open the local URL printed in the terminal (Vite normally uses `http://localhost:5173`).

## Create the Supabase database

1. Create a project in the Supabase dashboard.
2. Open **SQL Editor** and create a new query.
3. Copy the complete contents of [`supabase/schema.sql`](supabase/schema.sql) into the editor and run it.
4. Check that the tables were created and the starter catalog was inserted:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

select id, name, category
from public.products
order by name;
```

The schema creates the tables, indexes, the restricted `execute_app_sql` function used by the server, default store settings, shipping rates, and starter products and sizes. The inserts are safe to run again for seeded rows.

Use `supabase/schema.sql` for Supabase. The files in `database/migrations/` are SQLite migrations and should not be run in Supabase's PostgreSQL SQL Editor.

For a new Supabase project, run `supabase/schema.sql` first, then run each SQL migration in `supabase/migrations/` in filename order. For an existing project, run any migration not yet applied before deploying code that depends on it. The stock reservation migration creates the reservation table and atomic order, release, and payment-settlement functions.

Stock reservation cleanup is optional. The app already runs cleanup during checkout and payment settlement, and it can also be triggered manually or by a hosted scheduler if you want to reclaim expired reservations automatically. If you do configure a scheduled cleanup, set a strong random `CRON_SECRET` and call the protected `/api/cron/release-stock-reservations` endpoint with a `Bearer` token.

### Tables

The app uses `products`, `product_images`, `product_sizes`, `customers`, `orders`, `order_items`, `stock_reservations`, `returns`, `admin_users`, `admin_sessions`, `buyer_accounts`, `buyer_sessions`, `carts`, `cart_items`, `notifications`, `store_settings`, and `shipping_rates`.

## Environment variables

Put local values in `.env` at the project root. Add the same values in the hosting provider's server-side environment settings for deployment. Never commit real secrets.

```dotenv
# Required for database reads and writes
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Set these before the first visit to /admin-login
ADMIN_EMAIL=admin@your-store-domain.com
ADMIN_PASSWORD=replace-with-a-long-unique-password

# Paystack checkout
PAYSTACK_SECRET_KEY=your-paystack-secret-key
VITE_PAYSTACK_PUBLIC_KEY=your-paystack-public-key

# Optional: Arkesel SMS alerts
ARKESEL_API_KEY=your-arkesel-api-key
ARKESEL_SENDER_ID=BigPeeKicks
ADMIN_PHONE=0241234567

# Optional: defaults to product-images
SUPABASE_STORAGE_BUCKET=product-images
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only key used by the backend for database and Storage operations. |
| `ADMIN_EMAIL` | Recommended before first admin login | Email stored for the initial admin record. Admin login currently authenticates with the password. |
| `ADMIN_PASSWORD` | Strongly recommended before first admin login | Password used when the initial admin record is created. If unset, the code currently falls back to `bigpee`; do not use that default in a deployed store. |
| `PAYSTACK_SECRET_KEY` | For payments | Server-side Paystack API key used to initialize and verify transactions and validate webhooks. |
| `VITE_PAYSTACK_PUBLIC_KEY` | For checkout | Paystack public key used by the browser checkout flow. This is intended to be public; do not put a secret key in a `VITE_*` variable. |
| `ARKESEL_API_KEY` | Optional | Enables SMS notifications. |
| `ARKESEL_SENDER_ID` | Optional | SMS sender name; defaults to `BigPeeKicks`. Use a sender ID approved by Arkesel. |
| `ADMIN_PHONE` | Optional | Ghana number used for admin SMS alerts, for example `0241234567` or `+233241234567`. Can also be set in admin store settings. |
| `SUPABASE_STORAGE_BUCKET` | Optional | Public product image bucket name; defaults to `product-images`. |
| `CRON_SECRET` | Optional | Strong random value used to authorize scheduled expired-reservation cleanup requests when you enable a cron or other external scheduler. |

### Key handling

The service-role key bypasses normal Row Level Security protections. Keep it only in trusted server environments such as local `.env` and Vercel server variables. Never expose it through `VITE_*`, browser code, screenshots, or public logs. The database function `execute_app_sql` is granted to `service_role` and is called by the server adapter.

Set `ADMIN_PASSWORD` before the first request to `/admin-login`. The initial admin account is created on the first login attempt when `admin_users` is empty; changing environment variables later does not update an existing account. After logging in, change the password in the admin settings. Password changes require at least 10 characters and invalidate existing admin sessions.

## Payments

Checkout uses Paystack Inline and the server API. Configure both `PAYSTACK_PUBLIC_KEY` (in this app, `VITE_PAYSTACK_PUBLIC_KEY`) and `PAYSTACK_SECRET_KEY` with keys from the same Paystack environment, test or live. The app stores amounts in GHS and converts them to pesewas for Paystack.

The checkout return page verifies transactions on the server. To also receive asynchronous success events, configure a Paystack webhook to call:

```text
https://your-production-domain.example/api/payments/paystack/webhook
```

The webhook signature is checked using `PAYSTACK_SECRET_KEY`. Use your deployed HTTPS domain and confirm the webhook is enabled in the Paystack dashboard before relying on it for order updates.

## Product image storage

When product images are uploaded, the server stores them in Supabase Storage. The default bucket is `product-images`. The app attempts to create the bucket as public on the first upload when it does not already exist, using the service-role key. You can also create a public bucket with that name in **Supabase Dashboard → Storage** before uploading images.

Product image files are limited by the app to JPEG, PNG, and WebP formats. Do not make the service-role key available to the browser; image uploads are performed by the server.

## Deploy to Vercel

1. Push the repository to a Git provider and import it into Vercel.
2. Set the required environment variables in **Project Settings → Environment Variables**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, and a strong `ADMIN_PASSWORD`.
3. Add `PAYSTACK_SECRET_KEY` and `VITE_PAYSTACK_PUBLIC_KEY` to enable payments. Add Arkesel variables only if SMS is needed.
4. Redeploy after setting or changing environment variables.
5. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor if you have not already done so.
6. Visit `/admin-login` and sign in with the configured password. Change it in admin settings if appropriate.
7. For Paystack webhooks, register `https://<your-domain>/api/payments/paystack/webhook` in the Paystack dashboard.

The repository's `vercel.json` uses `pnpm install` and `pnpm build`. The Vercel project should build from the repository root.

## SMS notifications

SMS is optional. Configure `ARKESEL_API_KEY` and an approved `ARKESEL_SENDER_ID`; the default sender is `BigPeeKicks`. Supply the admin phone number in `ADMIN_PHONE` or admin store settings. Supported phone numbers are Ghana numbers such as `0241234567` or `+233241234567`.

Current SMS behavior:

- Payment confirmation: sent to the buyer or delivery recipient and admin after server-side payment verification or a valid Paystack success webhook.
- Shipment: sent to the buyer or delivery recipient and admin when the admin marks an order as shipped.
- Return decision: sent to the buyer or recipient when the admin approves or rejects a return.
- A pending checkout and a return request create admin in-app notifications but do not themselves send SMS.

SMS delivery depends on the Arkesel account, balance, sender approval, valid phone numbers, and the recipient's network. A provider accepting a message does not guarantee handset delivery.

## Useful commands

```sh
pnpm dev       # Start the development server
pnpm build     # Create a production build
pnpm start     # Run the built server
pnpm preview   # Preview the Vite production build
pnpm lint      # Run ESLint
```

Run `pnpm build` before `pnpm start`.

## Project structure

```text
database/migrations/  SQLite migrations; not for Supabase PostgreSQL
public/               Static files served by the website
src/components/       Shared UI and product components
src/context/          Cart, catalog, auth, order, and wishlist state
src/lib/              Server services and shared utilities
src/routes/           TanStack Start file-based pages
src/server.ts         Server API routes and request handling
supabase/schema.sql   PostgreSQL schema and starter data for Supabase
```

## Troubleshooting

- **Database configuration error:** Confirm `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present in the server environment, with no extra quotes or whitespace, and restart or redeploy the app.
- **Database function or relation missing:** Run the full `supabase/schema.sql` script in the correct Supabase project's SQL Editor.
- **Admin login does not accept the configured password:** If `admin_users` already has a row, its stored password takes precedence over `ADMIN_PASSWORD`. Use the existing password to change it in settings, or manage the admin record securely in the database.
- **Paystack checkout is not configured:** Set the matching `PAYSTACK_SECRET_KEY` and `VITE_PAYSTACK_PUBLIC_KEY`, then rebuild/redeploy. Keep test keys paired with test mode and live keys paired with live mode.
- **Product upload fails:** Confirm Storage is enabled, the configured bucket exists or can be created, and the server has the correct service-role key. Check that the bucket is public for public product image URLs.
- **SMS is not received:** Confirm the Arkesel API key, approved sender ID, Ghana phone format, provider balance, and `ADMIN_PHONE` or the admin settings phone number.
