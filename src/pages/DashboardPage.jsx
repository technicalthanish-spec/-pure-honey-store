import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { currency, dateTime, shortDate } from '../lib/format.js'
import Loader from '../components/Loader.jsx'
import StatusBadge from '../components/StatusBadge.jsx'

const empty={summary:{},products:[],product_performance:[],giveaways:[],recent_orders:[]}
export default function DashboardPage(){
 const [data,setData]=useState(empty),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 const [gift,setGift]=useState({product_id:'',quantity:1,recipient:'',note:''})
 const load=useCallback(async()=>{const {data,error}=await supabase.rpc('admin_dashboard_data');if(error)setError(error.message);else{setData(data||empty);setError('')}setLoading(false)},[])
 useEffect(()=>{load()},[load])
 const submit=async e=>{e.preventDefault();setBusy(true);setError('');setMessage('');const {error}=await supabase.rpc('record_giveaway',{p_product_id:gift.product_id,p_quantity:Number(gift.quantity),p_recipient:gift.recipient,p_note:gift.note});setBusy(false);if(error){setError(error.message);return}setGift({product_id:'',quantity:1,recipient:'',note:''});setMessage('Free giveaway recorded and stock reduced.');await load()}
 if(loading)return <Loader label="Loading business dashboard..."/>
 const s=data.summary||{}
 const cards=[
  ['Stock at cost',currency(s.stock_cost_value),'Money invested in current stock'],
  ['Stock retail value',currency(s.stock_retail_value),'Potential value at selling prices'],
  ['Product sales',currency(s.product_sales),'After coupons; cancelled excluded'],
  ['Payments received',currency(s.received),'Payments minus refunds'],
  ['Outstanding',currency(s.outstanding),'Order value still not received'],
  ['Sold stock cost',currency(s.sold_cost),'Cost price of sold jars'],
  ['Free stock loss',currency(s.giveaway_cost),`${s.giveaway_units||0} free jars · retail ${currency(s.giveaway_retail)}`],
  ['Estimated net profit',currency(s.estimated_net_profit),'Sales − sold cost − free stock cost'],
 ]
 return <div className="admin-page finance-dashboard">
  <div className="page-header"><div><span className="eyebrow">BUSINESS OVERVIEW</span><h1>Dashboard</h1><p>Stock, sales, collections, free giveaways and estimated profit in one place.</p></div><Link className="secondary-btn" to="/admin/orders">View orders</Link></div>
  {error&&<p className="alert error" role="alert">{error}</p>}{message&&<p className="alert success">{message}</p>}
  {data.products.some(p=>Number(p.cost_price)===0)&&<p className="alert warning">Set the cost price for every product in Products / Stock. Until then, cost and profit figures will be incomplete.</p>}
  <div className="finance-grid">{cards.map(([label,value,note])=><article className={'metric-card '+(label==='Estimated net profit'?'featured':'')} key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</div>
  <div className="dashboard-columns">
   <section className="admin-card"><h2>Current stock</h2><div className="table-wrap"><table><thead><tr><th>Size</th><th>Qty</th><th>Cost / jar</th><th>Price / jar</th><th>Cost value</th><th>Retail value</th></tr></thead><tbody>{data.products.map(p=><tr key={p.id}><td>{p.size_label}</td><td>{p.available_quantity}</td><td>{currency(p.cost_price)}</td><td>{currency(p.price)}</td><td>{currency(Number(p.cost_price)*p.available_quantity)}</td><td>{currency(Number(p.price)*p.available_quantity)}</td></tr>)}</tbody></table></div></section>
   <section className="admin-card giveaway-card"><h2>Record free honey</h2><p className="muted-text">Use this whenever stock is gifted or sampled. It reduces stock and counts its cost as a loss.</p><form onSubmit={submit}><fieldset disabled={busy}><label className="field"><span>Honey size</span><select required value={gift.product_id} onChange={e=>setGift({...gift,product_id:e.target.value})}><option value="">Choose size</option>{data.products.map(p=><option key={p.id} value={p.id}>{p.size_label} · {p.available_quantity} available</option>)}</select></label><label className="field"><span>Quantity</span><input required type="number" min="1" step="1" value={gift.quantity} onChange={e=>setGift({...gift,quantity:e.target.value})}/></label><label className="field"><span>Given to</span><input required minLength="2" maxLength="100" placeholder="Person, shop or event" value={gift.recipient} onChange={e=>setGift({...gift,recipient:e.target.value})}/></label><label className="field"><span>Reason / note</span><input maxLength="500" placeholder="Sample, gift, damaged, etc." value={gift.note} onChange={e=>setGift({...gift,note:e.target.value})}/></label><button className="primary-btn" disabled={busy}>{busy?'Recording…':'Record free giveaway'}</button></fieldset></form></section>
  </div>
  <section className="admin-card"><div className="card-title-row"><div><h2>Sales by honey size</h2><p>Coupon discount is counted against the size assigned to that coupon.</p></div></div><div className="table-wrap"><table><thead><tr><th>Size</th><th>Jars sold</th><th>Net sales</th><th>Stock cost</th><th>Gross profit</th></tr></thead><tbody>{data.product_performance.map(p=><tr key={p.id}><td>{p.size_label}</td><td>{p.sold_units}</td><td>{currency(p.net_sales)}</td><td>{currency(p.cost_of_sales)}</td><td>{currency(p.gross_profit)}</td></tr>)}</tbody></table></div></section>
  <section className="admin-card"><div className="card-title-row"><div><h2>Free giveaway history</h2><p>Permanent record of stock given without payment.</p></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Given to</th><th>Product</th><th>Qty</th><th>Cost loss</th><th>Retail value</th><th>Note</th></tr></thead><tbody>{data.giveaways.map(g=><tr key={g.id}><td>{dateTime(g.created_at)}</td><td>{g.recipient}</td><td>{g.size_label}</td><td>{g.quantity}</td><td>{currency(g.total_cost)}</td><td>{currency(g.retail_value)}</td><td>{g.note||'—'}</td></tr>)}{!data.giveaways.length&&<tr><td colSpan="7" className="empty-cell">No free stock recorded.</td></tr>}</tbody></table></div></section>
  <section className="admin-card"><div className="card-title-row"><div><h2>Recent orders</h2><p>{s.order_count||0} active orders · order value {currency(s.order_value)} · delivery charged {currency(s.delivery_charged)}</p></div></div><div className="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Status</th><th>Total</th></tr></thead><tbody>{data.recent_orders.map(o=><tr key={o.id}><td><Link to={`/admin/orders/${o.id}`}>{o.order_number}</Link></td><td>{o.customer_name}</td><td>{shortDate(o.created_at)}</td><td><StatusBadge status={o.status}/></td><td>{currency(o.grand_total)}</td></tr>)}{!data.recent_orders.length&&<tr><td colSpan="5" className="empty-cell">No orders yet.</td></tr>}</tbody></table></div></section>
 </div>
}
