# Personal business tools — V7

The frontend is safe to deploy before the database update. New-sale, purchase, expense and backup pages show a setup screen until the admin-only version check returns 7. Existing orders, invoices and sales reports remain accessible.

## Activate once
In the same Supabase project used by this website, open SQL Editor and run all of `supabase/migration_v7.sql` after V6. This is one transaction and is safe to rerun. Return to Admin → New Sale and press Check again.

## Daily workflow
- Admin → New Sale: select a customer by mobile number, choose jars, adjust the rate or give a rupee/percentage discount.
- Enter money actually received. Select Delivered only if honey was handed over. The quick button fills Delivered and full payment; review and save.
- Invoice, stock reservation and initial payment commit together. Admin-created sales have no customer login attached. Existing customer history groups by entered mobile number, not Gmail.
- Customer Khata: see purchases, net payments, pending balances, cancellation refunds and repeat orders. Open any order for additional partial payments.
- Repeat orders copy quantities but use current prices and require a fresh review; discounts and payments do not carry over.
- Share invoice PDF uses the device share sheet where supported. WhatsApp bill message opens the chosen customer's conversation for the admin to send. No messages are sent automatically.
- Stock Purchases records packaged jars (not a bulk raw-honey manufacturing ledger). It adds stock on saving and updates the weighted average cost of available stock; prior order costs are preserved. Purchase date is a record date.
- Expenses are operating costs. Do not enter stock purchase cost again as an expense. Avoid recording packaging twice if already included in jar cost.
- Estimated dashboard profit includes all non-cancelled orders, including undelivered orders; it is not cash profit. It subtracts sold stock cost, giveaway cost and operating expenses, and includes delivery charges.
- Backup exports business records as JSON, including customer details, without auth passwords/users or code. It is not a one-click full Supabase restore. Protect the downloaded file.

## Validation
`npm run build`
`node tests/sales-report.mjs`
`node tests/admin-tools.mjs`
The business-tools workflow runs a temporary PostgreSQL database with test-only auth stubs. It checks V7 replay, idempotent sales, invoice/payment/stock totals, failed-sale rollback, purchase averaging, expenses, backup and non-admin denial.
