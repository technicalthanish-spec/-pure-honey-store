import { balance, cents, rupees } from './business.js'

export function indiaDate(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}
export function itemGrams(item) {
  const match = String(item.size_label || '').trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(kg|g|gm|gms|grams?)$/i)
  return match ? Number(match[1]) * (match[2].toLowerCase() === 'kg' ? 1000 : 1) : null
}
export function salesRows(orders, payments, filters = {}) {
  const query = (filters.search || '').trim().toLowerCase()
  return orders.filter(order => {
    const day = indiaDate(order.created_at)
    return order.status !== 'Cancelled' &&
      (filters.status !== 'Delivered' || order.status === 'Delivered') &&
      (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to) &&
      (!query || [order.customer_name, order.mobile, order.order_number].some(v => String(v || '').toLowerCase().includes(query)))
  }).map(order => {
    const items = order.order_items || []
    const unknownWeight = !items.length || items.some(item => itemGrams(item) === null)
    const grams = items.reduce((total, item) => total + (itemGrams(item) || 0) * Number(item.quantity), 0)
    return { ...order, ...balance(order, payments), grams, unknownWeight,
      jars: items.reduce((total, item) => total + Number(item.quantity), 0),
      itemsText: items.map(item => item.product_name + ' ' + item.size_label + ' × ' + item.quantity).join(', '),
      costTotal: rupees(items.reduce((s,i)=>s+cents(i.unit_cost)*Number(i.quantity),0)),
      missingCost: !items.length || items.some(i=>i.unit_cost==null || Number(i.unit_cost)===0),
      rateText: items.map(i=>i.size_label+' × '+i.quantity+' @ '+Number(i.rate||0).toFixed(2)).join('; '),
      costText: items.map(i=>i.size_label+' × '+i.quantity+' @ '+Number(i.unit_cost||0).toFixed(2)).join('; '),
      netSales: rupees(cents(order.subtotal) - cents(order.discount_amount)),
    }
  })
}
export function salesTotals(rows) {
  const total = { orders: rows.length, jars: 0, grams: 0, unknownWeight: false, missingCost: false }
  for (const key of ['subtotal', 'discount_amount', 'delivery_charge', 'grand_total', 'received', 'refunded', 'net', 'pending', 'netSales', 'costTotal'])
    total[key] = rupees(rows.reduce((value, row) => value + cents(row[key]), 0))
  for (const row of rows) { total.jars += row.jars; total.grams += row.grams; total.unknownWeight ||= row.unknownWeight; total.missingCost ||= row.missingCost }
  return total
}
export const weightText = row => (row.grams / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 }) + ' kg' + (row.unknownWeight ? ' + unknown' : '')

export function giveawayRows(giveaways, filters = {}) {
 const query=(filters.search||'').trim().toLowerCase()
 return giveaways.filter(g=>{
  const day=indiaDate(g.created_at)
  return (!filters.from||day>=filters.from)&&(!filters.to||day<=filters.to)&&
   (!query||[g.recipient,g.product_name,g.size_label,g.note].some(v=>String(v||'').toLowerCase().includes(query)))
 }).sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id)).map(g=>({
  ...g,costTotal:rupees(cents(g.unit_cost)*Number(g.quantity)),missingCost:g.unit_cost==null||Number(g.unit_cost)===0,jars:Number(g.quantity),grams:(itemGrams(g)||0)*Number(g.quantity),unknownWeight:itemGrams(g)===null,
 }))
}
export function giveawayTotals(rows) {
 return rows.reduce((t,g)=>({jars:t.jars+g.jars,grams:t.grams+g.grams,unknownWeight:t.unknownWeight||g.unknownWeight,costTotal:rupees(cents(t.costTotal)+cents(g.costTotal)),missingCost:t.missingCost||g.missingCost}),{jars:0,grams:0,unknownWeight:false,costTotal:0,missingCost:false})
}


export function reportSummary(total,freeTotal){
 const profit=rupees(cents(total.grand_total)-cents(total.costTotal)-cents(freeTotal.costTotal))
 const receivedLessCost=rupees(cents(total.net)-cents(total.costTotal)-cents(freeTotal.costTotal))
 return {profit,receivedLessCost,sales:[['Honey sale amount',total.subtotal],['Discount given',-total.discount_amount],['Delivery charged',total.delivery_charge],['Net billed sales',total.grand_total],['Cost of sold honey',total.costTotal],['Payments received',total.received],['Refunds',-total.refunded],['Net received',total.net],['Payment pending',total.pending]],final:[['Net billed sales',total.grand_total],['Less: sold honey cost',-total.costTotal],['Less: free honey cost',-freeTotal.costTotal],['Profit after honey costs (before operating expenses)',profit],['Net received less sold + free honey cost (before expenses)',receivedLessCost]]}
}
