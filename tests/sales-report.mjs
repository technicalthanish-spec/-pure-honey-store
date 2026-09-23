import assert from 'node:assert/strict'
import { salesRows, salesTotals, itemGrams, indiaDate, giveawayRows, giveawayTotals } from '../src/lib/salesReport.js'
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

const gifts=[
 {id:'g1',recipient:'Ravi',product_name:'Honey',size_label:'500 g',quantity:2,created_at:'2026-09-21T20:00:00Z',note:'Sample'},
 {id:'g2',recipient:'Aman',product_name:'Honey',size_label:'250 g',quantity:1,created_at:'2026-09-20T10:00:00Z',note:'Gift'},
]
const giftRows=giveawayRows(gifts)
assert.equal(giveawayTotals(giftRows).grams,1250)
assert.equal(giveawayTotals(giftRows).jars,3)
assert.equal(giveawayRows(gifts,{search:'ravi'}).length,1)
assert.equal(giveawayRows(gifts,{from:'2026-09-22'}).length,1)
assert.equal(giveawayRows(gifts,{status:'Delivered'}).length,2)
assert.equal(giveawayTotals([]).jars,0)
assert.equal(giveawayTotals(giveawayRows([{...gifts[0],size_label:'unknown'}])).unknownWeight,true)
assert.equal(salesTotals(salesRows(orders,payments)).grand_total,1170)
console.log('Free giveaway quantity, filters and separate revenue checks passed.')

const {reportSummary}=await import('../src/lib/salesReport.js')
const costRows=salesRows([{...base,order_items:[{product_name:'Honey',size_label:'500 g',quantity:2,rate:400,unit_cost:100}]}],payments)
const costTotal=salesTotals(costRows),freeCost=giveawayTotals(giveawayRows([{...gifts[0],unit_cost:50}]))
assert.equal(costTotal.costTotal,200)
assert.equal(freeCost.costTotal,100)
assert.equal(reportSummary(costTotal,freeCost).profit,470)
assert.equal(reportSummary(costTotal,freeCost).receivedLessCost,250)
assert.equal(costTotal.missingCost,false)
assert.equal(salesTotals(salesRows(orders,payments)).missingCost,true)
assert.equal(reportSummary(salesTotals([]),giveawayTotals([])).profit,0)
assert.equal(reportSummary(salesTotals([]),freeCost).profit,-100)
assert.match(costRows[0].rateText, /400.00/)
assert.match(costRows[0].costText, /100.00/)
console.log('Report cost, gift loss, discount, refund, empty totals and received-versus-profit checks passed.')
