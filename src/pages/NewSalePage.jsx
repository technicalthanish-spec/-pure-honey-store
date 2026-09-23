import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { readAll, customerBook, saleAmounts } from '../lib/adminTools.js'
import { useAdminSave } from '../lib/useAdminSave.js'
import { currency } from '../lib/format.js'
import AdminToolsGate from '../components/AdminToolsGate.jsx'
export default function NewSalePage(){return <AdminToolsGate><SaleForm/></AdminToolsGate>}
function SaleForm(){
 const [products,setProducts]=useState([]),[orders,setOrders]=useState([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('')
 const [step,setStep]=useState(0)
 const [cart,setCart]=useState({}),[customer,setCustomer]=useState({name:'',mobile:'',address:''}),[search,setSearch]=useState('')
 const [bill,setBill]=useState({discount_kind:'fixed',discount_value:'0',delivery:'0',paid:'0',method:'UPI',status:'New',note:''})
 const [query]=useSearchParams(),navigate=useNavigate(),request=useAdminSave('sale')
 useEffect(()=>{let live=true;Promise.all([readAll('products'),readAll('orders','id,customer_name,mobile,address,city,state,pin_code,created_at,order_items(product_id,quantity,rate)')]).then(([p,o])=>{
  if(!live)return;setProducts(p);setOrders(o)
  const prior=o.find(x=>x.id===query.get('repeat'))
  const selected=prior||o.filter(x=>x.mobile===query.get('customer')).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]
  if(selected)setCustomer({name:selected.customer_name,mobile:selected.mobile,address:[selected.address,selected.city,selected.state,selected.pin_code].filter(Boolean).join(', ')})
  if(prior)setCart(Object.fromEntries(prior.order_items.map(i=>[i.product_id,{quantity:i.quantity,rate:p.find(x=>x.id===i.product_id)?.price??i.rate}])))
 }).catch(e=>{if(live)setLoadError(e.message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[query])
 const people=useMemo(()=>customerBook(orders,[]),[orders])
 const items=Object.entries(cart).filter(([,v])=>Number(v.quantity)>0).map(([id,v])=>({product_id:id,quantity:Number(v.quantity),rate:Number(v.rate)}))
 const amounts=saleAmounts(items,bill.discount_kind,bill.discount_value,bill.delivery,bill.paid)
 const setField=(k,v)=>setBill(b=>({...b,[k]:v}))
 const next=()=>{
  const problem=step===0?(customer.name.trim().length<2?'Enter the customer name.':!/^\d{10}$/.test(customer.mobile)?'Enter a 10-digit mobile number.':''):(Object.values(cart).some(v=>!Number.isInteger(Number(v.quantity))||Number(v.quantity)<0)?'Enter whole, non-negative jar quantities.':!items.length?'Choose at least one jar.':items.some(i=>{const p=products.find(p=>p.id===i.product_id);return !p?.active||!Number.isInteger(i.quantity)||i.quantity>p.available_quantity||!Number.isFinite(i.rate)||i.rate<0||i.rate>1000000||cart[i.product_id].rate===''} )?'Check jar quantities, available stock and rates.':'')
  if(problem){setLoadError(problem);return}setLoadError('');setStep(s=>Math.min(2,s+1));window.scrollTo({top:0,behavior:'smooth'})
 }
 const submit=async e=>{
  e.preventDefault()
  if(step<2){next();return}
  if(!items.length){setLoadError('Choose at least one jar.');return}
  setLoadError('')
  const result=await request.save({...customer,...bill,items,discount_value:Number(bill.discount_value),delivery:Number(bill.delivery),paid:Number(bill.paid),expected_total:amounts.total})
  if(result)navigate('/admin/orders/'+result.id)
 }
 const retry=async()=>{const result=await request.save();if(result)navigate('/admin/orders/'+result.id)}
 if(loading)return <p className="loading">Loading customers and stock…</p>
 return <div className={`admin-page sale-wizard sale-stage-${step}`}>
  <div className="page-header"><div><div className="eyebrow">ADMIN BILLING</div><h1>New sale</h1><p>Customer details, honey selection, then review and payment.</p></div><Link className="secondary-btn" to="/admin/customers">Customer khata</Link></div>
  {(loadError||request.error)&&<p role="alert" className="alert error">{loadError||request.error}</p>}
  {request.pending&&<div className="alert warning"><p>A sale is awaiting confirmation. Retry the same saved request to avoid adding it twice.</p><button className="secondary-btn" disabled={request.busy} onClick={retry}>Check / retry saved sale</button></div>}
  <ol className="wizard-steps">{['Customer','Honey & quantity','Payment & review'].map((label,i)=><li key={label} className={i===step?'active':i<step?'done':''} aria-current={i===step?'step':undefined}><span>{i+1}</span>{label}</li>)}</ol>
  <form noValidate={step<2} onSubmit={submit}><fieldset disabled={request.busy||Boolean(request.pending)}>
   <div className="detail-grid"><section className="admin-card sale-customer"><h2>Customer</h2>
    <label className="field"><span>Find existing customer</span><input placeholder="Search name or mobile" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    {search.trim()&&<div className="customer-picks">{people.filter(c=>(c.name+' '+c.mobile).toLowerCase().includes(search.toLowerCase())).slice(0,6).map(c=><button className="secondary-btn" type="button" key={c.mobile} onClick={()=>{setCustomer({name:c.name,mobile:c.mobile,address:c.address});setSearch('')}}>{c.name} · {c.mobile}</button>)}</div>}
    <label className="field"><span>Customer name</span><input required={step===0} minLength="2" maxLength="100" value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></label>
    <label className="field"><span>Mobile · identifies this customer's khata</span><input required={step===0} inputMode="numeric" pattern="[0-9]{10}" maxLength="10" value={customer.mobile} onChange={e=>setCustomer({...customer,mobile:e.target.value})}/></label>
    <label className="field"><span>Address (optional for hand delivery)</span><textarea maxLength="500" value={customer.address} onChange={e=>setCustomer({...customer,address:e.target.value})}/></label>
   </section><section className="admin-card sale-items"><h2>Honey and price</h2>
    {products.filter(p=>[250,500,1000].includes(p.grams)).sort((a,b)=>a.grams-b.grams).map(p=><div className="sale-product" key={p.id}><strong>{p.name} · {p.size_label}</strong><small>{p.available_quantity} jars available {p.active?'':'· Inactive'}</small><div className="form-grid">
      <label className="field"><span>Jars</span><input type="number" min="0" max={p.active?p.available_quantity:0} step="1" value={cart[p.id]?.quantity||0} onChange={e=>setCart(c=>({...c,[p.id]:{rate:c[p.id]?.rate??p.price,quantity:e.target.value}}))}/></label>
      <label className="field"><span>Rate / jar (₹)</span><input type="number" min="0" max="1000000" step="0.01" required value={cart[p.id]?.rate??p.price} onChange={e=>setCart(c=>({...c,[p.id]:{quantity:c[p.id]?.quantity||0,rate:e.target.value}}))}/></label></div></div>)}
    {query.get('repeat')&&<p className="muted-text">Repeat order uses current prices. Check quantities and discount before saving.</p>}
   </section></div>
   <div className="detail-grid"><section className="admin-card sale-payment"><h2>Discount and payment</h2><div className="form-grid">
    <label className="field"><span>Discount type</span><select value={bill.discount_kind} onChange={e=>setField('discount_kind',e.target.value)}><option value="fixed">Amount (₹)</option><option value="percent">Percentage (%)</option></select></label>
    <label className="field"><span>Discount</span><input required type="number" min="0" max={bill.discount_kind==='percent'?100:amounts.subtotal} step="0.01" value={bill.discount_value} onChange={e=>setField('discount_value',e.target.value)}/></label>
    <label className="field"><span>Delivery charge (₹)</span><input required type="number" min="0" step="0.01" value={bill.delivery} onChange={e=>setField('delivery',e.target.value)}/></label>
    <label className="field"><span>Amount actually received (₹)</span><input required type="number" min="0" max={Math.max(0,amounts.total)} step="0.01" value={bill.paid} onChange={e=>setField('paid',e.target.value)}/></label>
    <label className="field"><span>Payment method</span><select value={bill.method} onChange={e=>setField('method',e.target.value)}>{['UPI','Cash','Bank'].map(v=><option key={v}>{v}</option>)}</select></label>
    <label className="field"><span>Delivery status</span><select value={bill.status} onChange={e=>setField('status',e.target.value)}><option value="New">New · needs delivery</option><option value="Delivered">Delivered · honey handed over</option></select></label>
   </div><button className="secondary-btn" type="button" onClick={()=>setBill(b=>({...b,status:'Delivered',paid:String(amounts.total)}))} disabled={amounts.total<0}>Honey delivered + full payment received</button>
    <label className="field"><span>Note</span><input maxLength="500" value={bill.note} onChange={e=>setField('note',e.target.value)}/></label>
   </section><section className="admin-card sale-summary"><h2>Bill summary</h2><p className="sale-review-customer"><strong>{customer.name}</strong><br/>{customer.mobile}<br/>{customer.address}</p><div className="detail-list">{items.map(i=><div key={i.product_id}><span>{products.find(p=>p.id===i.product_id)?.size_label} × {i.quantity}</span><strong>{currency(i.quantity*i.rate)}</strong></div>)}</div><div className="detail-list">{[['Amount',amounts.subtotal],['Discount',amounts.discount],['Delivery',Number(bill.delivery)],['Final total',amounts.total],['Received',Number(bill.paid)],['Pending / udhaar',amounts.pending]].map(([k,v])=><div key={k}><span>{k}</span><strong>{currency(v)}</strong></div>)}</div><p className="muted-text">Stock reduces once when saved. Record only payment you have received. Remaining money stays in the customer's khata.</p><button className="primary-btn" disabled={!items.length||amounts.pending<0||amounts.total<0}>{request.busy?'Saving…':'Save sale & create invoice'}</button></section></div>
  <div className="wizard-controls">{step>0&&<button className="secondary-btn" type="button" onClick={()=>{setStep(step-1);setLoadError('')}}>Back</button>}{step<2&&<button className="primary-btn" type="submit">{step===0?'Next: choose honey':'Next: payment & review'}</button>}</div>
  </fieldset></form>
 </div>
}

