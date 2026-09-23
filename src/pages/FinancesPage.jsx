import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { currency } from '../lib/format.js'
import Loader from '../components/Loader.jsx'

const empty={summary:{},products:[],product_performance:[],giveaways:[],recent_orders:[]}
export default function FinancesPage(){
 const [data,setData]=useState(empty),[loading,setLoading]=useState(true),[error,setError]=useState('')
 
 const load=useCallback(async()=>{const {data,error}=await supabase.rpc('admin_dashboard_data');if(error)setError(error.message);else{setData(data||empty);setError('')}setLoading(false)},[])
 useEffect(()=>{load()},[load])
 if(error)return <div className="admin-page"><h1>Financial summary</h1><p className="alert error" role="alert">{error}</p><button className="secondary-btn" onClick={load}>Retry</button></div>
 if(loading)return <Loader label="Loading business dashboard..."/>
 const s=data.summary||{}
 const cards=[
  ['Stock at cost',currency(s.stock_cost_value),'Money invested in current stock'],
  ['Stock retail value',currency(s.stock_retail_value),'Potential value at selling prices'],
  ['Product sales',currency(s.product_sales),'After discounts; includes open orders'],
  ['Payments received',currency(s.received),'Payments minus refunds'],
  ['Outstanding',currency(s.outstanding),'Order value still not received'],
  ['Sold stock cost',currency(s.sold_cost),'Cost price of sold jars'],
  ['Free stock loss',currency(s.giveaway_cost),`${s.giveaway_units||0} free jars · retail ${currency(s.giveaway_retail)}`],
  ['Operating expenses',s.operating_expenses === undefined ? 'Setup needed' : currency(s.operating_expenses),'Packaging, courier, travel and other costs'],
  ['Estimated net profit',currency(s.estimated_net_profit),s.operating_expenses === undefined ? 'Before operating expenses · complete V7 setup' : 'Sales + delivery − sold cost − gifts − expenses'],
 ]
 return <div className="admin-page finance-dashboard">
  <div className="page-header"><div><span className="eyebrow">BUSINESS OVERVIEW</span><h1>Financial summary</h1><p>All-time financial totals. Order value includes undelivered orders; it is not cash profit.</p></div><div className="report-actions"><Link className="primary-btn" to="/admin/new-sale">+ New sale</Link><Link className="secondary-btn" to="/admin/customers">Customer khata</Link></div></div>
  {error&&<p className="alert error" role="alert">{error}</p>}
  {data.products.some(p=>Number(p.cost_price)===0)&&<p className="alert warning">Set the cost price for every product in Products / Stock. Until then, cost and profit figures will be incomplete.</p>}
  <div className="finance-grid">{cards.map(([label,value,note])=><article className={'metric-card '+(label==='Estimated net profit'?'featured':'')} key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</div>
  <div className="dashboard-columns">
   <section className="admin-card"><h2>Current stock</h2><div className="table-wrap"><table><thead><tr><th>Size</th><th>Qty</th><th>Cost / jar</th><th>Price / jar</th><th>Cost value</th><th>Retail value</th></tr></thead><tbody>{data.products.map(p=><tr key={p.id}><td>{p.size_label}</td><td>{p.available_quantity}</td><td>{currency(p.cost_price)}</td><td>{currency(p.price)}</td><td>{currency(Number(p.cost_price)*p.available_quantity)}</td><td>{currency(Number(p.price)*p.available_quantity)}</td></tr>)}</tbody></table></div></section>

  </div>
  <section className="admin-card"><div className="card-title-row"><div><h2>Sales by honey size</h2><p>Direct discounts are shared across bill items; coupons apply to their assigned honey size.</p></div></div><div className="table-wrap"><table><thead><tr><th>Size</th><th>Jars sold</th><th>Net sales</th><th>Stock cost</th><th>Gross profit</th></tr></thead><tbody>{data.product_performance.map(p=><tr key={p.id}><td>{p.size_label}</td><td>{p.sold_units}</td><td>{currency(p.net_sales)}</td><td>{currency(p.cost_of_sales)}</td><td>{currency(p.gross_profit)}</td></tr>)}</tbody></table></div></section>

 </div>
}

