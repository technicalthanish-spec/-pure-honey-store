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
      netSales: rupees(cents(order.subtotal) - cents(order.discount_amount)),
    }
  })
}
export function salesTotals(rows) {
  const total = { orders: rows.length, jars: 0, grams: 0, unknownWeight: false }
  for (const key of ['subtotal', 'discount_amount', 'delivery_charge', 'grand_total', 'received', 'refunded', 'net', 'pending', 'netSales'])
    total[key] = rupees(rows.reduce((value, row) => value + cents(row[key]), 0))
  for (const row of rows) { total.jars += row.jars; total.grams += row.grams; total.unknownWeight ||= row.unknownWeight }
  return total
}
export const weightText = row => (row.grams / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 }) + ' kg' + (row.unknownWeight ? ' + unknown' : '')
