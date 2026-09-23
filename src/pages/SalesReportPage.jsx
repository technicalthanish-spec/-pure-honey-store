import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { currency } from '../lib/format.js'
import { exportCsv } from '../lib/business.js'
import { indiaDate, salesRows, salesTotals, weightText, giveawayRows, giveawayTotals } from '../lib/salesReport.js'
import Loader from '../components/Loader.jsx'

async function readAll(table, columns) {
  const rows = []
  // Page past the API's default row limit so all-time reports remain complete.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(offset, offset + 499)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 500) return rows
  }
}
export default function SalesReportPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [filters, setFilters] = useState({ search: '', from: '', to: '', status: 'Active' })
  const [page, setPage] = useState(0)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [orders, payments, giveaways] = await Promise.all([
        readAll('orders', 'id,order_number,customer_name,mobile,status,created_at,subtotal,discount_amount,coupon_code,delivery_charge,grand_total,order_items(product_name,size_label,quantity),invoices(id,invoice_number)'),
        readAll('payments', 'id,order_id,kind,amount'),
        readAll('stock_giveaways', 'id,recipient,product_name,size_label,quantity,note,created_at'),
      ])
      orders.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
      setData({ orders, payments, giveaways, loadedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) })
      setPage(0)
    } catch (e) { setError('Could not load the complete report. ' + e.message); setData(null) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const invalidDates = Boolean(filters.from && filters.to && filters.from > filters.to)
  const rows = useMemo(() => data && !invalidDates ? salesRows(data.orders, data.payments, filters) : [], [data, filters, invalidDates])
  const total = useMemo(() => salesTotals(rows), [rows])
  const freeRows = useMemo(() => data && !invalidDates ? giveawayRows(data.giveaways, filters) : [], [data, filters, invalidDates])
  const freeTotal = useMemo(() => giveawayTotals(freeRows), [freeRows])
  const combined = { grams: total.grams + freeTotal.grams, unknownWeight: total.unknownWeight || freeTotal.unknownWeight }
  const update = (key, value) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(0) }
  const description = [
    filters.status === 'Delivered' ? 'Delivered orders only' : 'All non-cancelled orders (includes unfulfilled orders)',
    'Order / giveaway dates (IST): ' + (filters.from || 'Beginning') + ' to ' + (filters.to || 'Today'),
    filters.search.trim() ? 'Search: ' + filters.search.trim() : '',
    'Free giveaways included separately; order status filter applies to sales only',
    'Loaded: ' + (data?.loadedAt || '') + ' IST',
  ].filter(Boolean).join(' | ')
  const download = async () => {
    setExporting(true); setError('')
    try { const { downloadSalesReport } = await import('../lib/salesReportPdf.js'); downloadSalesReport(rows, total, description, freeRows, freeTotal) }
    catch (e) { setError('PDF could not be created. ' + e.message) }
    finally { setExporting(false) }
  }
  const csv = () => {
    const records = rows.map(row => ({
      type: 'SALE', note: '',
      date_ist: indiaDate(row.created_at), order: row.order_number, customer: row.customer_name, status: row.status,
      honey: row.itemsText, jars: row.jars, weight: weightText(row), amount: row.subtotal, discount: row.discount_amount || 0,
      coupon: row.coupon_code || '', delivery: row.delivery_charge, total: row.grand_total,
      received: row.received, refunded: row.refunded, net_received: row.net, pending: row.pending,
    }))
    records.push({ type: 'SALES TOTAL', note: '', date_ist: '', order: 'TOTAL', customer: total.orders + ' orders', status: '', honey: '', jars: total.jars,
      weight: weightText(total), amount: total.subtotal, discount: total.discount_amount, coupon: '', delivery: total.delivery_charge,
      total: total.grand_total, received: total.received, refunded: total.refunded, net_received: total.net, pending: total.pending })
    freeRows.forEach(g => records.push({type:'FREE',note:g.note||'',date_ist:indiaDate(g.created_at),order:'',customer:g.recipient,status:'FREE',honey:g.product_name+' '+g.size_label,jars:g.jars,weight:weightText(g),amount:0,discount:0,coupon:'',delivery:0,total:0,received:0,refunded:0,net_received:0,pending:0}))
    records.push({type:'FREE TOTAL',note:'',date_ist:'',order:'',customer:'',status:'FREE',honey:'',jars:freeTotal.jars,weight:weightText(freeTotal),amount:0,discount:0,coupon:'',delivery:0,total:0,received:0,refunded:0,net_received:0,pending:0})
    records.push({type:'COMBINED QUANTITY',note:'Sales plus free giveaways; not an additional financial total',date_ist:'',order:'',customer:'',status:'',honey:'',jars:total.jars+freeTotal.jars,weight:weightText(combined),amount:'',discount:'',coupon:'',delivery:'',total:'',received:'',refunded:'',net_received:'',pending:''})
    exportCsv('honey-sales-report', records)
  }
  return <div className="admin-page sales-report">
    <div className="page-header"><div><div className="eyebrow">HONEY BUSINESS</div><h1>Sales report / Hisab</h1><p>Sales and free honey, with recipient names and separate totals.</p></div>
      <button className="secondary-btn" disabled={loading} onClick={load}>{loading ? 'Loading…' : 'Refresh'}</button></div>
    {error && <div className="alert error" role="alert">{error}</div>}
    <section className="admin-card">
      <div className="sales-filters">
        <label className="field"><span>Customer / free recipient / order</span><input value={filters.search} onChange={e => update('search', e.target.value)} placeholder="Search records" /></label>
        <label className="field"><span>From · record date</span><input type="date" value={filters.from} onChange={e => update('from', e.target.value)} /></label>
        <label className="field"><span>To · record date</span><input type="date" value={filters.to} onChange={e => update('to', e.target.value)} /></label>
        <label className="field"><span>Orders included</span><select value={filters.status} onChange={e => update('status', e.target.value)}><option value="Active">All non-cancelled</option><option value="Delivered">Delivered only</option></select></label>
      </div>
      <p className="muted-text">Cancelled orders are excluded. Free giveaways are shown separately at ₹0 and do not increase sales or pending payments. Use Delivered only for completed sales. Payment balances use all recorded payments/refunds for these orders.</p>
      {invalidDates && <p role="alert" className="alert error">From date must be on or before To date.</p>}
    </section>
    {loading ? <Loader label="Loading complete sales history…" /> : data && !invalidDates && <>
      <div className="business-metrics">{[['Sales total',currency(total.grand_total)],['Payment pending',currency(total.pending)],['Free honey',weightText(freeTotal)+' · '+freeTotal.jars+' jars'],['Sales + free quantity',weightText(combined)]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <details className="admin-card report-detail"><summary>View sales and discount breakdown</summary><div className="business-metrics">{[['Sales quantity',weightText(total)],['Jars / orders',total.jars+' / '+total.orders],['Before discount',currency(total.subtotal)],['Discount given',currency(total.discount_amount)],['Delivery charges',currency(total.delivery_charge)],['Net received',currency(total.net)]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></details>
      <section className="admin-card">
        <div className="card-title-row"><div><h2>Customer-wise statement</h2><details className="report-detail"><summary>Report scope & updated time</summary><p>{description}</p></details></div>
          <div className="report-actions"><button className="primary-btn" disabled={(!rows.length && !freeRows.length) || exporting} onClick={download}>{exporting ? 'Creating PDF…' : 'Download PDF / Print'}</button><button className="secondary-btn" disabled={!rows.length && !freeRows.length} onClick={csv}>Download CSV</button></div></div>
        <p className="muted-text">Total = amount − discount + delivery. Exports include every filtered row. Open the PDF to print.</p>
        {total.unknownWeight && <p className="alert warning">Some older item sizes are unrecognised; their weight is marked unknown rather than counted as zero.</p>}
        <div className="table-wrap"><table className="sales-table">
          <thead><tr><th>Date / Order</th><th>Customer</th><th>Honey / Quantity</th><th>Weight</th><th>Amount</th><th>Discount</th><th>Delivery</th><th>Total</th><th>Net received</th><th>Pending</th><th>Invoice</th></tr></thead>
          <tbody>{rows.slice(page * 50, (page + 1) * 50).map(row => {
            const invoice = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices
            return <tr key={row.id}>
              <td>{indiaDate(row.created_at)}<br/><Link to={'/admin/orders/' + row.id}>{row.order_number}</Link><small>{row.status}</small></td>
              <td>{row.customer_name}</td><td>{row.itemsText || 'No item details'}<small>{row.jars} jars</small></td><td>{weightText(row)}</td>
              <td>{currency(row.subtotal)}</td><td>{currency(row.discount_amount || 0)}{row.coupon_code && <small>{row.coupon_code}</small>}</td>
              <td>{currency(row.delivery_charge)}</td><td><strong>{currency(row.grand_total)}</strong></td><td>{currency(row.net)}</td><td>{currency(row.pending)}</td>
              <td><Link to={invoice ? '/admin/invoices/' + invoice.id : '/admin/orders/' + row.id}>{invoice ? invoice.invoice_number : 'Open order'}</Link></td>
            </tr>
          })}{!rows.length && <tr><td colSpan="11" className="empty-cell">No matching sales records.</td></tr>}</tbody>
          <tfoot><tr><th colSpan="2">TOTAL · {total.orders} orders</th><th>{total.jars} jars</th><th>{weightText(total)}</th><th>{currency(total.subtotal)}</th><th>{currency(total.discount_amount)}</th><th>{currency(total.delivery_charge)}</th><th>{currency(total.grand_total)}</th><th>{currency(total.net)}</th><th>{currency(total.pending)}</th><th /></tr></tfoot>
        </table></div>
        {rows.length > 50 && <div className="report-actions"><button className="secondary-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {Math.ceil(rows.length / 50)}</span><button className="secondary-btn" disabled={(page + 1) * 50 >= rows.length} onClick={() => setPage(page + 1)}>Next</button></div>}
      </section>
      <section className="admin-card">
        <div className="card-title-row"><div><h2>Free honey / Giveaways</h2><p>{freeTotal.jars} jars · {weightText(freeTotal)} · Customer charge ₹0</p></div><Link className="secondary-btn" to="/admin/giveaways">Record free honey</Link></div>
        <p className="muted-text">Included in PDF and CSV. Dates and recipient search apply here; the order status filter does not hide giveaways.</p>
        {freeTotal.unknownWeight && <p className="alert warning">Some giveaway sizes are unrecognised; their weight is marked unknown.</p>}
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Given to</th><th>Honey / Size</th><th>Jars</th><th>Weight</th><th>Amount</th><th>Note</th></tr></thead>
          <tbody>{freeRows.map(g => <tr key={g.id}><td>{indiaDate(g.created_at)}</td><td>{g.recipient}</td><td>{g.product_name} · {g.size_label}</td><td>{g.jars}</td><td>{weightText(g)}</td><td><strong>FREE · ₹0</strong></td><td>{g.note || '—'}</td></tr>)}
          {!freeRows.length && <tr><td colSpan="7" className="empty-cell">No free honey recorded for these filters.</td></tr>}</tbody>
          <tfoot><tr><th colSpan="3">FREE TOTAL</th><th>{freeTotal.jars}</th><th>{weightText(freeTotal)}</th><th>₹0</th><th /></tr></tfoot>
        </table></div>
      </section>
    </>}
  </div>
}

