import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { currency, dateTime, shortDate } from '../lib/format.js'
import { balance, customers, inPeriod, exportCsv, cents, rupees } from '../lib/business.js'
import CouponManager from '../components/CouponManager.jsx'
import Loader from '../components/Loader.jsx'
const sum=(rows,key)=>rupees(rows.reduce((n,r)=>n+cents(r[key]),0))
const titles={overview:'Business overview',customers:'Customers',payments:'Payments & refunds',coupons:'Coupons',reports:'Reports',activity:'Activity history'}
export default function BusinessPage({section}) {
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false)
 const [period,setPeriod]=useState('all'),[search,setSearch]=useState(''),[selected,setSelected]=useState(null),[paymentFilter,setPaymentFilter]=useState('pending')
 const load=useCallback(async()=>{setRefreshing(true);try{const {data,error}=await supabase.rpc('admin_business_data');if(error)throw error;setData(data);setError('')}catch(e){setError(e.message+' — If this is your first V4 launch, apply migration_v4.sql in Supabase.')}finally{setLoading(false);setRefreshing(false)}},[])
 useEffect(()=>{load()},[load])
 const customerRows=useMemo(()=>data?customers(data.orders,data.payments):[],[data])
 if(loading)return <Loader label="Loading business records…"/>
 const header=<div className="page-header"><div><div className="eyebrow">HONEY BUSINESS</div><h1>{titles[section]}</h1><p>Orders, money and customer history in one place.</p></div><button className="secondary-btn" onClick={load} disabled={refreshing}>{refreshing?'Refreshing…':'Refresh'}</button></div>
 if(!data)return <div className="admin-page">{header}<p className="alert error" role="alert">{error}</p></div>
 const {orders,payments,products,coupons,activity,admins}=data
 const filteredOrders=orders.filter(o=>inPeriod(o.created_at,period))
 const filteredPayments=payments.filter(p=>inPeriod(p.paid_at,period))
 const active=filteredOrders.filter(o=>o.status!=='Cancelled')
 const balances=orders.map(o=>({...o,...balance(o,payments)}))
 const q=search.trim().toLowerCase()
 const matches=o=>!q||[o.order_number,o.customer_name,o.mobile].some(v=>String(v).toLowerCase().includes(q))
 const searchedCustomers=customerRows.filter(c=>!q||[c.name,c.mobile,c.city].some(v=>String(v).toLowerCase().includes(q)))
 const selectedCustomer=customerRows.find(c=>c.mobile===selected)
 const metrics=[['Total orders',filteredOrders.length],['Order value (all statuses)',currency(sum(filteredOrders,'grand_total'))],['Active order value',currency(sum(active,'grand_total'))],['Received in period',currency(sum(filteredPayments.filter(p=>p.kind==='payment'),'amount'))],['Refunded in period',currency(sum(filteredPayments.filter(p=>p.kind==='refund'),'amount'))],['Net cash in period',currency(sum(filteredPayments.filter(p=>p.kind==='payment'),'amount')-sum(filteredPayments.filter(p=>p.kind==='refund'),'amount'))],['Pending payment · all time',currency(sum(balances,'pending'))],['Refund pending · all time',currency(sum(balances,'refundDue'))],['Cancelled value',currency(sum(filteredOrders.filter(o=>o.status==='Cancelled'),'grand_total'))]]
 const orderList=rows=><div className="business-list">{rows.map(o=><Link className="business-row" key={o.id} to={'/admin/orders/'+o.id}><div><strong>{o.order_number} · {o.customer_name}</strong><small>{o.mobile} · {shortDate(o.created_at)} · {o.status}</small>{o.pending>0&&<small>Pending: {currency(o.pending)}</small>}{o.refundDue>0&&<small>Refund due: {currency(o.refundDue)}</small>}</div><strong>{currency(o.grand_total)} ↗</strong></Link>)}{!rows.length&&<p className="muted-text">No matching orders.</p>}</div>
 return <div className="admin-page business-page">{header}{error&&<p className="alert error" role="alert">{error}</p>}
  {['overview','reports'].includes(section)&&<>
   <div className="toolbar"><label className="field"><span>Reporting period · India time</span><select value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">All time</option><option value="today">Today</option><option value="month">This month</option></select></label><p className="muted-text">Order figures use order date. Cash figures use payment/refund date. Outstanding balances are current, across all dates.</p></div>
   <div className="business-metrics">{metrics.map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>
  </>}
  {section==='overview'&&<>
   <div className="detail-grid"><section className="admin-card"><h2>Needs attention</h2><div className="business-list"><Link className="business-row" to="/admin/payments"><span>Orders awaiting payment</span><strong>{balances.filter(o=>o.pending>0).length} ↗</strong></Link><Link className="business-row" to="/admin/payments"><span>Cancelled orders needing refunds</span><strong>{balances.filter(o=>o.refundDue>0).length} ↗</strong></Link><Link className="business-row" to="/admin/orders"><span>New orders</span><strong>{orders.filter(o=>o.status==='New').length} ↗</strong></Link></div></section>
   <section className="admin-card"><h2>Low stock · 5 jars or fewer</h2><div className="business-list">{products.filter(p=>p.active&&p.available_quantity<=5).map(p=><Link className="business-row" key={p.id} to="/admin/products"><span>{p.name} · {p.size_label}</span><strong>{p.available_quantity} left ↗</strong></Link>)}{!products.some(p=>p.active&&p.available_quantity<=5)&&<p>Stock levels look healthy.</p>}</div></section></div>
   <section className="admin-card"><h2>Recent orders</h2>{orderList(balances.slice(0,10))}</section>
  </>}
  {section==='customers'&&<>
   <input aria-label="Search customers" className="business-search" placeholder="Search name, mobile or city" value={search} onChange={e=>setSearch(e.target.value)}/>
   <p className="muted-text">{customerRows.length} customers, grouped by entered mobile number. Purchase value excludes cancelled orders.</p>
   <div className="customer-cards">{searchedCustomers.map(c=><button className={'customer-stat-card '+(selected===c.mobile?'selected':'')} key={c.mobile} onClick={()=>setSelected(c.mobile)}><strong>{c.name}</strong><small>{c.mobile} · {c.city}</small><div><span>{c.orders.length} orders</span><strong>{currency(c.value)}</strong></div><small>Held: {currency(c.net)} · Pending: {currency(c.pending)}</small><small>Last order: {shortDate(c.last)}</small></button>)}</div>
   {!searchedCustomers.length&&<p>No customers match this search.</p>}
   {selectedCustomer&&<section className="admin-card"><h2>{selectedCustomer.name} · Order history</h2><p className="muted-text">Net money held: {currency(selectedCustomer.net)} · Refund pending: {currency(selectedCustomer.refundDue)}. Open an order to view its invoice or record a payment.</p>{orderList(selectedCustomer.orders.map(o=>({...o,...balance(o,payments)})))}</section>}
  </>}
  {section==='payments'&&<>
   <div className="toolbar"><input aria-label="Search payments by order or customer" placeholder="Search order, customer or mobile" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Payment filter" value={paymentFilter} onChange={e=>setPaymentFilter(e.target.value)}><option value="pending">Pending payments</option><option value="refund">Refund pending</option><option value="all">All orders</option><option value="ledger">Payment ledger</option></select></div>
   <p className="muted-text">Open an order to record a payment or refund. Existing orders have no payment recorded until you enter one.</p>
   <section className="admin-card">{paymentFilter==='ledger'?<div className="business-list">{payments.filter(p=>matches(orders.find(o=>o.id===p.order_id)||{})).map(p=><Link to={'/admin/orders/'+p.order_id} className="business-row" key={p.id}><div><strong>{orders.find(o=>o.id===p.order_id)?.order_number} · {p.kind} · {p.method}</strong><small>{dateTime(p.paid_at)} · {p.note}</small></div><strong>{p.kind==='refund'?'−':''}{currency(p.amount)}</strong></Link>)}{!payments.length&&<p>No payments recorded.</p>}</div>:orderList(balances.filter(o=>matches(o)&&(paymentFilter==='all'||(paymentFilter==='pending'?o.pending>0:o.refundDue>0))))}</section>
  </>}
  {section==='coupons'&&<CouponManager coupons={coupons} orders={orders} reload={load}/>}
  {section==='reports'&&<>
   <section className="admin-card"><h2>Download reports</h2><p className="muted-text">Orders and cash exports follow the selected period. Customer balances are all time. Amounts are INR; timestamps in exports are UTC.</p><div className="report-actions">
    <button className="secondary-btn" disabled={!filteredOrders.length} onClick={()=>exportCsv('honey-orders',filteredOrders.map(o=>({order:o.order_number,customer:o.customer_name,mobile:o.mobile,status:o.status,date:o.created_at,subtotal:o.subtotal,coupon:o.coupon_code,discount:o.discount_amount,delivery:o.delivery_charge,total:o.grand_total,...balance(o,payments)})))}>Orders CSV</button>
    <button className="secondary-btn" disabled={!filteredPayments.length} onClick={()=>exportCsv('honey-payments',filteredPayments.map(p=>({order:orders.find(o=>o.id===p.order_id)?.order_number,kind:p.kind,amount:p.amount,method:p.method,paid_at:p.paid_at,reference:p.note,recorded_at:p.created_at})))}>Payments CSV</button>
    <button className="secondary-btn" disabled={!customerRows.length} onClick={()=>exportCsv('honey-customers',customerRows.map(c=>({name:c.name,mobile:c.mobile,city:c.city,orders:c.orders.length,purchase_value:c.value,net_held:c.net,pending:c.pending,refund_due:c.refundDue,last_order:c.last})))}>Customers CSV</button>
    <button className="secondary-btn" disabled={!coupons.length} onClick={()=>exportCsv('honey-coupons',coupons.map(c=>{const used=filteredOrders.filter(o=>o.coupon_id===c.id);return {code:c.code,uses:used.length,discount_issued:sum(used,'discount_amount'),active_order_value:sum(used.filter(o=>o.status!=='Cancelled'),'grand_total')}}))}>Coupons CSV</button>
   </div></section>
   <section className="admin-card"><h2>Order status breakdown</h2><div className="business-list">{['New','Confirmed','Packed','Shipped','Delivered','Cancelled'].map(status=>{const rows=filteredOrders.filter(o=>o.status===status);return <div key={status} className="business-row"><span>{status} · {rows.length} orders</span><strong>{currency(sum(rows,'grand_total'))}</strong></div>})}</div></section>
  </>}
  {section==='activity'&&<section className="admin-card"><h2>Latest 200 changes</h2><p className="muted-text">Payment, coupon and order-status changes are recorded with the admin and time. History begins after the V4 migration.</p><div className="business-list">{activity.map(a=><div key={a.id} className="business-row"><div><strong>{a.entity==='orders'?a.details.order_number+' · '+a.details.from+' → '+a.details.to:a.entity==='payments'?a.details.kind+' · '+currency(a.details.amount)+' · '+a.details.method:'Coupon '+a.details.after?.code+' · '+(a.details.after?.active?'enabled':'disabled')}</strong><small>{admins.find(u=>u.id===a.actor_id)?.name||a.actor_id||'System'} · {dateTime(a.created_at)}</small></div></div>)}{!activity.length&&<p>No changes recorded yet.</p>}</div></section>}
 </div>
}
