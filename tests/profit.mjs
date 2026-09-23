import assert from 'node:assert/strict'
import { profitSummary } from '../src/lib/profit.js'
const data={orders:[{status:'Delivered',subtotal:2000,discount_amount:100,delivery_charge:50,order_items:[{quantity:2,unit_cost:500}]},{status:'New',subtotal:600,discount_amount:0,delivery_charge:0,order_items:[{quantity:1,unit_cost:300}]},{status:'Cancelled',subtotal:9999,order_items:[{quantity:1,unit_cost:100}]}],giveaways:[{quantity:2,unit_cost:150,retail_value:1000}],expenses:[{amount:100},{amount:900,deleted_at:'deleted'}],payments:[{kind:'payment',amount:500},{kind:'refund',amount:50}],products:[{available_quantity:4,cost_price:300}]}
const p=profitSummary(data);assert.equal(p.net,550);assert.equal(p.freeCost,300);assert.equal(p.expense,100);assert.equal(p.cashReceived,450);assert.equal(p.stockValue,1200);assert.equal(profitSummary(data,'all').net,850)
assert.equal(profitSummary({...data,expenses:[{amount:900}]}).net,-250)
assert.equal(profitSummary({...data,giveaways:[{quantity:1,unit_cost:0}]}).missingCost,true)
console.log('Profit: discount, delivery, sale cost, free cost, deleted expense, cancellations, cash separation and loss checks passed.')
