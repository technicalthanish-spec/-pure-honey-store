# Business dashboard, payments and coupons

## Activate

The frontend changes have been applied to your existing Desktop `honey-order-app-v3` folder. Keep using that folder and its existing `.env`.

1. Run the entire `supabase/migration_v4.sql` in Supabase SQL Editor on your existing V3 database. Do not rerun schema.sql or older migrations.
2. Refresh the app. If needed, restart `npm.cmd run dev`.
3. Sign in as admin. Overview, Customers, Payments, Coupons, Reports and Activity are available in the navigation.

For a new database only, use the bundled schema.sql, which includes V4.

## Using it

- Open an order to record actual money received, a partial payment, or a refund. Entries are permanent. Corrections use compensating entries, not deletion. Retry a failed request with the same details while keeping the page open; it reuses the request ID. Before retrying after a browser restart, inspect the ledger to confirm whether the payment was recorded.
- Old orders are not assumed paid. Enter historical receipts using their actual dates. Cancelled paid orders appear in Refund pending until their refunds are recorded.
- Dashboard order figures use order creation dates; received/refunded figures use the money entry date. Today and This month use India time. Pending balances always cover all dates. Net cash is receipts minus refunds, not profit.
- Customers are grouped by entered mobile number, not verified identity. Purchase value excludes cancelled orders. Customer history links to each order, invoice and payment record.
- Coupons support percent/fixed discounts, minimum product subtotal, maximum discount, expiry, total and per-mobile limits. Discounts exclude delivery. Cancelled orders still use a redemption. Disable a coupon through Edit / disable. Existing orders keep their original coupon/discount snapshots when the coupon is edited.
- Quotes do not reserve stock or coupons. Final order placement rechecks availability and limits transactionally. Customers must reapply a coupon after changing quantity, product, mobile or code.
- Reports export orders, payments, customers and coupon performance as CSV. Spreadsheet formula-leading text is escaped. Exports contain customer data and should be handled privately.
- Low-stock alerts use a threshold of five active jars. Activity displays the latest 200 order-status, coupon and payment changes since migration installation.

## Validation and limits

Production build passed; existing large-bundle warning remains. An isolated PostgreSQL-compatible PGlite database passed migration reruns, anonymous order/invoice discount snapshots, coupon limits, public-table denial, non-admin denial, payment idempotency, overpayment/refund rejection, cancellation stock restoration/invoice retention, report access and audit checks. This did not create live orders or apply the migration to Supabase.

The report RPC returns all business rows without the default 1,000-row REST truncation, appropriate for the current small business. At a much larger scale, move report aggregation and customer pagination fully into SQL. Ledger data is not a payment-provider integration; the admin records actual payments manually. Mobile layouts were implemented with wrapping lists, cards, touch targets and responsive grids; this update has not had a full browser end-to-end test.
