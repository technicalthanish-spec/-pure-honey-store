# Immediate customer invoices

## Apply to the existing V2 database

Run `supabase/migration_v3.sql` in your Supabase SQL Editor, then restart/rebuild the updated frontend. Do not rerun `schema.sql` or `migration_v2.sql` on an existing V2 database. New installations use the updated `schema.sql`.

The migration preserves the existing invoice sequence and existing invoices. Orders, stock reservations, and invoices commit together. Sequence gaps after a rolled-back transaction are normal; issued numbers are never recycled. Admin invoice creation also accepts older New orders and serializes repeated requests to return one invoice per order.

Customers get the newly created invoice, order items, delivery details, and business settings in the order response. No public invoice lookup or public invoice-table access is added. The customer preview is held in page memory; download before leaving or refreshing. Admin continues to access saved invoices using admin-only RLS.

Cancellation restores stock using the existing trigger and retains the invoice. Admin previews/PDFs mark cancelled orders. Previously downloaded files do not update automatically.

## Validation

Production Vite build passed (351 modules). The existing bundle-size warning remains. Shared invoice rendering and PDF smoke tests passed for New and Cancelled orders, customer text escaping, invoice numbers, and totals. Build validation used Vite's native config loader because the sandbox blocked the default config bundler's parent-directory scan.

The migration has not been executed against a live database here. Before rollout, verify in a test Supabase project:

1. Place an anonymous order: one invoice is saved, returned, and displayed; stock decreases once. Preview, download, and print show its number and totals.
2. Confirm and progress the order: stock does not decrease again; admin sees the same invoice ID/number.
3. Cancel the order: stock returns once; the invoice remains accessible to admin and shows cancellation.
4. Two simultaneous orders for the final unit: only one succeeds. Repeated admin invoice requests return the existing invoice.
5. Anonymous and authenticated non-admin users cannot read other orders/items/invoices or call admin invoice creation.
6. Force an invoice insertion failure in a test database: no order or stock deduction commits.

No live database credentials or environment file are included in this deliverable. Keep your existing `.env`.
