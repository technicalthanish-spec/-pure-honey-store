import assert from 'node:assert/strict'
import { salesRows, salesTotals, itemGrams, indiaDate } from '../src/lib/salesReport.js'
const base = {"id":"a","created_at":"2026-09-21T20:00:00Z","customer_name":"Rahul","order_number":"HON-1","status":"Delivered","subtotal":800,"discount_amount":50,"delivery_charge":20,"grand_total":770,"order_items":[{"product_name":"Honey","size_label":"500 g","quantity":2}]}
const orders = [{"id":"a","created_at":"2026-09-21T20:00:00Z","customer_name":"Rahul","order_number":"HON-1","status":"Delivered","subtotal":800,"discount_amount":50,"delivery_charge":20,"grand_total":770,"order_items":[{"product_name":"Honey","size_label":"500 g","quantity":2}]},{"id":"b","created_at":"2026-09-21T20:00:00Z","customer_name":"Aman","order_number":"HON-1","status":"New","subtotal":400,"discount_amount":0,"delivery_charge":0,"grand_total":400,"order_items":[{"size_label":"250 gm","quantity":2}]},{"id":"c","created_at":"2026-09-21T20:00:00Z","customer_name":"Rahul","order_number":"HON-1","status":"Cancelled","subtotal":800,"discount_amount":50,"delivery_charge":20,"grand_total":770,"order_items":[{"product_name":"Honey","size_label":"500 g","quantity":2}]}]
const payments = [{"order_id":"a","kind":"payment","amount":600},{"order_id":"a","kind":"refund","amount":50}]
const total = salesTotals(salesRows(orders, payments))
assert.equal(total.orders, 2)
assert.equal(total.jars, 4)
assert.equal(total.grams, 1500)
assert.equal(total.grand_total, 1170)
assert.equal(total.discount_amount, 50)
assert.equal(total.net, 550)
assert.equal(total.pending, 620)
assert.equal(salesRows(orders, payments, { status: 'Delivered' }).length, 1)
assert.equal(salesRows(orders, payments, { search: 'rahul' }).length, 1)
assert.equal(indiaDate(base.created_at), '2026-09-22')
assert.equal(salesRows(orders, payments, { to: '2026-09-21' }).length, 0)
assert.equal(itemGrams({ size_label: '1 kg' }), 1000)
assert.equal(itemGrams({ size_label: 'unknown' }), null)
assert.equal(salesTotals([]).grand_total, 0)
console.log('Sales report calculations and filters passed.')
