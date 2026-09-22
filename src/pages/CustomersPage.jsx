import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { readAll, customerBook } from '../lib/adminTools.js'
import { balance, exportCsv } from '../lib/business.js'
import { currency, shortDate } from '../lib/format.js'
export default function CustomersPage(){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[search,setSearch]=useState(''),[selected,setSelected]=useState(''),[onlyPending,setOnlyPending]=useState(false)
 const load=useCallback(async()=>{setBusy(true);setError('');try{const [orders,payments]=await Promise.all([readAll('orders','*,order_items(*),invoices(id,invoice_number)'),readAll('payments')]);setData({orders,payments})}catch(e){setError(e.message);setData(null)}finally{setBusy(false)}},[])
 useEffect(()=>{load()},[load])
 const people=useMemo(()=>data?customerBook(data.orders,data.payments):[],[data])
 const current=people.find(c=>c.mobile===selected)
 const filtered=people.filter(c=>(!onlyPending||c.pending>0)&&(c.name+' '+c.mobile).toLowerCase().includes(search.toLowerCase()))
 return <div className="admin-page business-page"><div className="page-header"><div><div className="eyebrow">CUSTOMER KHATA</div><h1>Customers & udhaar</h1><p>Separate records by mobile number, regardless of the Gmail used to log in.</p></div><div className="report-actions"><Link className="primary-btn" to="/admin/new-sale">New sale</Link><button className="secondary-btn" onClick={load} disabled={busy}>Refresh</button></div></div>
 {error&&<p role="alert" className="alert error">{error}</p>}
 <div className="toolbar"><input aria-label="Find customer" placeholder="Search name or mobile" value={search} onChange={e=>setSearch(e.target.value)}/><label className="check-row"><input type="checkbox" checked={onlyPending} onChange={e=>setOnlyPending(e.target.checked)}/> Pending payment only</label></div>
 {busy?<p>Loading complete customer history…</p>:data&&<>
 <div className="customer-cards">{filtered.map(c=><button className={'customer-stat-card '+(c.mobile===selected?'selected':'')} key={c.mobile} onClick={()=>setSelected(c.mobile)}><strong>{c.name}</strong><small>{c.mobile}</small><div><span>{c.orders.length} orders</span><strong>{currency(c.total)}</strong></div><small>Pending: {currency(c.pending)} · Received less refunds: {currency(c.net)}</small>{c.refundDue>0&&<small>Refund due: {currency(c.refundDue)}</small>}</button>)}</div>
 {!filtered.length&&<p>No matching customers.</p>}
 {current&&<section className="admin-card"><div className="card-title-row"><div><h2>{current.name}</h2><p>{current.mobile} · {current.address}</p></div><div className="report-actions"><Link className="primary-btn" to={'/admin/new-sale?customer='+encodeURIComponent(current.mobile)}>New sale for customer</Link><button className="secondary-btn" onClick={()=>exportCsv('customer-khata',current.orders.map(o=>({order:o.order_number,date:o.created_at,status:o.status,total:o.grand_total,...balance(o,data.payments)})))}>Download khata CSV</button></div></div>
 <p className="muted-text">Open an order to add a partial payment or refund. Cancelled orders are excluded from purchases; any money still held is shown as refund due.</p>
 <div className="table-wrap"><table><thead><tr><th>Order / Date</th><th>Status</th><th>Bill</th><th>Received</th><th>Pending</th><th>Refund due</th><th>Actions</th></tr></thead><tbody>{current.orders.map(o=>{const b=balance(o,data.payments);return <tr key={o.id}><td><Link to={'/admin/orders/'+o.id}>{o.order_number}</Link><br/>{shortDate(o.created_at)}</td><td>{o.status}</td><td>{currency(o.grand_total)}</td><td>{currency(b.net)}</td><td>{currency(b.pending)}</td><td>{currency(b.refundDue)}</td><td><Link to={'/admin/orders/'+o.id}>Payment / invoice</Link><br/><Link to={'/admin/new-sale?repeat='+o.id}>Repeat order</Link></td></tr>})}</tbody></table></div>
 <h3>Payment history</h3><div className="business-list">{data.payments.filter(p=>current.orders.some(o=>o.id===p.order_id)).sort((a,b)=>b.paid_at.localeCompare(a.paid_at)).map(p=><div className="business-row" key={p.id}><div><strong>{p.kind} · {p.method}</strong><small>{shortDate(p.paid_at)} · {p.note}</small></div><strong>{currency(p.amount)}</strong></div>)}</div></section>}
 </>}
 </div>
}
