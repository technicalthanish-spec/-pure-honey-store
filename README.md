# Pure Honey — simplified V5

Updated from the existing honey-order-app-v4 project. React + Vite + Supabase; original orders, stock reservation, cancellation, offline payments and invoice/PDF functionality retained.

## Run

1. Run `npm ci`.
2. Copy `.env.example` to `.env`. Set your Supabase project URL and public anon/publishable key. Never put a service-role key in the frontend.
3. Apply the database setup below.
4. Run `npm run dev`, or `npm run build` followed by `npm run preview`.
5. In Supabase Auth, enable email/password signups. Set Site URL and allowed redirect URLs to your app URL (include `/shop`). Email-confirmation signups show a confirmation message before login.

## Database setup — choose one

- Existing V5 database: run `supabase/migration_v6.sql` in the Supabase SQL Editor.
- Existing V4 database: run `supabase/migration_v5.sql`, then `supabase/migration_v6.sql`.
- Existing V3 database: run `migration_v4.sql`, then `migration_v5.sql`.
- Older database: apply the existing version migrations in sequence first.
- Brand-new project: run `supabase/schema.sql`, then `supabase/migration_v6.sql`.

Do not run older migrations after V5: they restore obsolete guest-order functions. Take a database backup before upgrading. The upgrade preserves orders and invoice numbers. Legacy guest orders have no verified account owner and remain admin-only; they are never automatically linked by mobile number. Existing coupons without a product are disabled until an admin selects a weight and saves them.

Create an account normally, then promote its verified email in SQL Editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'YOUR_ADMIN_EMAIL');
```

Admin opens from the Shop header or `/admin`. Only Orders, Products / Stock, and Coupons are navigation sections. Invoice details and offline payment recording remain inside an order. Set your existing three products' prices and stock before opening the shop. Delivery charge and invoice business details retain their existing values in `business_settings`; edit that row through Supabase if needed.

## Customer flow

Login / Signup → Shop (250 g, 500 g, 1 kg) → add one or more sizes to the cart → delivery details and optional coupon → review server total → place order → My Orders. A coupon discounts only its assigned size inside the cart. Each size supports quantity 1–100. Full address is one field; mobile is a 10-digit Indian mobile number. Payment is arranged offline; no payment gateway is added.

## Business dashboard

Set each product's selling price, cost price and stock in Products / Stock. Dashboard then shows current stock at cost and retail value, product sales, received payments, outstanding amount, sold-stock cost, free-giveaway loss and estimated net profit. Use Record free honey whenever a jar is gifted or sampled; this permanently records the recipient/reason and reduces stock. When a product receives its first non-zero cost price, older item rows without a cost snapshot are estimated using that cost.

## Backend guarantees

- Auth is required for both quote and place-order functions. The server records `auth.uid()` as the customer.
- RLS allows customers to read only their own orders, items and invoices. Admin roles come from protected profiles, not signup metadata.
- Each active coupon needs one product ID. Wrong weight, inactive, expired and exhausted coupons are rejected. Fixed discounts are capped at the products subtotal; percentages are rounded to two decimals. Delivery is excluded.
- Quote and order use database prices, stock and coupon rules. The place-order transaction revalidates everything, locks product and coupon rows, reserves stock, and writes order, item and invoice together. If the total changed since review, submission is rejected for another review.
- No client-supplied price or discount is accepted. The expected total is only a comparison, never the charged amount.
- Request IDs prevent duplicate orders on network retries. Usage is counted from committed orders and includes cancellations. Admin coupon totals are aggregated on the server rather than truncated by list pagination.
- Customer lists load 20 orders per page. Historical prices and discounts remain snapshots in invoices.

## Verification

Production build passed. 29 local PostgreSQL/PGlite assertions passed for fresh setup, repeat migration, auth, RLS, both wrong weights, quantity, stock, fixed/percentage discounts, limits, inactive/expired coupons, total tampering, invoices, retries and cancellation stock restoration.

Mock browser checks passed at 390 px and 1280 px: checkout, coupon review, order submission → My Orders, admin coupon form, no horizontal overflow and no runtime errors. Live Supabase credentials were not provided, so live email delivery, deployment and hosted-database integration were not exercised. Apply the migration and configure `.env` before use.

To rerun the included backend assertions: `npm install --no-save @electric-sql/pglite`, then `node tests/backend.mjs`. These tests run in an isolated local database and do not touch Supabase.

To rerun the included backend assertions: `npm install --no-save @electric-sql/pglite`, then `node tests/backend.mjs`. These tests run in an isolated local database and do not touch Supabase.
