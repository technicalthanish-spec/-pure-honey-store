import { cents, rupees } from './business.js'
export function profitSummary({orders=[],giveaways=[],expenses=[],payments=[],products=[]},scope='delivered'){
 const selected=orders.filter(o=>o.status!=='Cancelled'&&(scope==='all'||o.status==='Delivered'))
 const sum=(rows,fn)=>rows.reduce((s,r)=>s+fn(r),0)
 const sales=sum(selected,o=>cents(o.subtotal)),discount=sum(selected,o=>cents(o.discount_amount)),delivery=sum(selected,o=>cents(o.delivery_charge))
 const cost=sum(selected,o=>sum(o.order_items||[],i=>cents(i.unit_cost)*Number(i.quantity)))
 const freeCost=sum(giveaways,g=>cents(g.unit_cost)*Number(g.quantity)),expense=sum(expenses.filter(e=>!e.deleted_at),e=>cents(e.amount))
 const result={sales,discount,delivery,cost,freeCost,expense,net:sales-discount+delivery-cost-freeCost-expense,stockValue:sum(products,p=>cents(p.cost_price)*Number(p.available_quantity)),cashReceived:sum(payments,p=>(p.kind==='refund'?-1:1)*cents(p.amount))}
 for(const key of Object.keys(result))result[key]=rupees(result[key])
 result.freeJars=sum(giveaways,g=>Number(g.quantity));result.orders=selected.length
 result.missingCost=selected.some(o=>!o.order_items?.length||o.order_items.some(i=>Number(i.unit_cost)<=0))||giveaways.some(g=>Number(g.unit_cost)<=0)
 return result
}
