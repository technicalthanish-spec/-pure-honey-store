import assert from 'node:assert/strict'
import { saleAmounts, customerBook } from '../src/lib/adminTools.js'
assert.deepEqual(saleAmounts([{rate:400,quantity:2}], 'fixed', 50, 20, 500),{subtotal:800,discount:50,total:770,pending:270})
assert.deepEqual(saleAmounts([{rate:0.1,quantity:3}], 'percent', 10, 0, 0),{subtotal:0.3,discount:0.03,total:0.27,pending:0.27})
assert.equal(saleAmounts([{rate:200,quantity:2}], 'percent', 100, 0, 0).total,0)
const orders=[
 {id:'a',mobile:'9000000001',customer_name:'Old name',created_at:'2026-01-01',status:'Delivered',grand_total:770,address:'A'},
 {id:'b',mobile:'9000000001',customer_name:'Latest name',created_at:'2026-02-01',status:'Cancelled',grand_total:200,address:'B'},
 {id:'c',mobile:'9000000002',customer_name:'Second customer',created_at:'2026-02-01',status:'New',grand_total:100,address:'C'}
]
const payments=[{order_id:'a',kind:'payment',amount:500},{order_id:'a',kind:'refund',amount:50},{order_id:'b',kind:'payment',amount:200}]
const book=customerBook(orders,payments)
assert.equal(book.length,2)
const customer=book.find(c=>c.mobile==='9000000001')
assert.equal(customer.name,'Latest name')
assert.equal(customer.total,770)
assert.equal(customer.pending,320)
assert.equal(customer.net,650)
assert.equal(customer.refundDue,200)
assert.equal(book.find(c=>c.mobile==='9000000002').pending,100)
console.log('Admin totals, rounding, customer separation and refunds passed.')
