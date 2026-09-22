import { useCallback, useEffect, useState } from 'react'
import AdminToolsGate from '../components/AdminToolsGate.jsx'
import { readAll, saveJson } from '../lib/adminTools.js'
import { useAdminSave } from '../lib/useAdminSave.js'
import { supabase } from '../lib/supabase.js'
import { currency, shortDate } from '../lib/format.js'
import { indiaDate } from '../lib/salesReport.js'
import { exportCsv, cents, rupees } from '../lib/business.js'
export default function RecordsPage({kind}){return <AdminToolsGate><Records key={kind} kind={kind}/></AdminToolsGate>}
function Records({kind}){
 const purchase=kind==='purchase',backup=kind==='backup'
 const [rows,setRows]=useState([]),[products,setProducts]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[exporting,setExporting]=useState(false)
 const initial={date:indiaDate(new Date()),note:'',amount:'',category:'Packaging',product_id:'',quantity:'1',unit_cost:'',supplier:''}
 const [form,setForm]=useState(initial),request=useAdminSave(purchase?'purchase':'expense')
 const load=useCallback(async()=>{setLoading(true);setError('');try{if(!backup){const [r,p]=await Promise.all([readAll(purchase?'stock_purchases':'business_expenses'),purchase?readAll('products'):Promise.resolve([])]);setRows(r.sort((a,b)=>b.created_at.localeCompare(a.created_at)));setProducts(p)}}catch(e){setError(e.message)}finally{setLoading(false)}},[purchase,backup])
 useEffect(()=>{load()},[load])
 const change=(key,value)=>setForm(f=>({...f,[key]:value}))
 const saved=async result=>{if(result){setMessage(purchase?'Purchase saved. Stock and average cost updated.':'Expense saved.');setForm(initial);await load()}}
 const submit=async e=>{e.preventDefault();setMessage('');await saved(await request.save(purchase?{product_id:form.product_id,quantity:Number(form.quantity),unit_cost:Number(form.unit_cost),supplier:form.supplier,date:form.date,note:form.note}:{category:form.category,amount:Number(form.amount),date:form.date,note:form.note}))}
 const downloadBackup=async()=>{setExporting(true);setError('');try{const {data,error}=await supabase.rpc('admin_backup_v7');if(error)throw error;saveJson('honey-business-backup-'+indiaDate(new Date())+'.json',data);setMessage('Business records backup downloaded.')}catch(e){setError(e.message)}finally{setExporting(false)}}
 const total=rupees(rows.reduce((n,r)=>n+cents(purchase?r.total_cost:r.amount),0))
 return <div className="admin-page business-page"><div className="page-header"><div><div className="eyebrow">BUSINESS RECORDS</div><h1>{backup?'Backup':purchase?'Stock purchases':'Expenses'}</h1><p>{backup?'Download a copy of your business data.':purchase?'Record newly received jars with their supplier and purchase cost.':'Record operating costs so profit includes your expenses.'}</p></div>{!backup&&<button className="secondary-btn" onClick={load} disabled={loading}>Refresh</button>}</div>
 {(error||request.error)&&<p className="alert error" role="alert">{error||request.error}</p>}{message&&<p className="alert success" role="status">{message}</p>}
 {backup?<section className="admin-card"><h2>Complete business records export</h2><p>Includes orders, invoice records, customers' details, payments, stock, purchases, expenses, coupons, giveaways, settings and activity history.</p><p className="muted-text">This JSON export contains private customer data. It does not contain account passwords, authentication users or the application code. Restoration requires importing the records into the matching database schema.</p><button className="primary-btn" disabled={exporting} onClick={downloadBackup}>{exporting?'Preparing backup…':'Download business backup'}</button></section>:<>
 {request.pending&&<div className="alert warning"><p>A record is awaiting confirmation. Retry the saved request before adding another.</p><button className="secondary-btn" disabled={request.busy} onClick={async()=>saved(await request.save())}>Check / retry saved record</button></div>}
 <section className="admin-card"><h2>{purchase?'Add stock purchase':'Add expense'}</h2><p className="muted-text">{purchase?'Quantity is in packaged jars. Include honey and packaging in the cost per jar if that is how you track stock. This adds stock today; purchase date is for your records.':'Add packaging here only if it is not already included in the stock cost. Honey inventory purchases belong in Stock purchases, so the cost is not deducted twice.'}</p>
 <form onSubmit={submit}><fieldset disabled={loading||request.busy||Boolean(request.pending)}><div className="form-grid">
 {purchase?<>
  <label className="field"><span>Honey size</span><select required value={form.product_id} onChange={e=>change('product_id',e.target.value)}><option value="">Choose product</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.size_label}</option>)}</select></label>
  <label className="field"><span>Jars received</span><input required type="number" min="1" max="100000" step="1" value={form.quantity} onChange={e=>change('quantity',e.target.value)}/></label>
  <label className="field"><span>Purchase cost / jar (₹)</span><input required type="number" min="0" max="1000000" step="0.01" value={form.unit_cost} onChange={e=>change('unit_cost',e.target.value)}/></label>
  <label className="field"><span>Supplier</span><input required minLength="2" maxLength="100" value={form.supplier} onChange={e=>change('supplier',e.target.value)}/></label>
 </>:<>
  <label className="field"><span>Category</span><select value={form.category} onChange={e=>change('category',e.target.value)}>{['Packaging','Courier','Travel','Other'].map(v=><option key={v}>{v}</option>)}</select></label>
  <label className="field"><span>Amount (₹)</span><input required type="number" min="0.01" max="10000000" step="0.01" value={form.amount} onChange={e=>change('amount',e.target.value)}/></label>
 </>}
 <label className="field"><span>{purchase?'Purchase date':'Expense date'}</span><input required type="date" max={indiaDate(new Date())} value={form.date} onChange={e=>change('date',e.target.value)}/></label>
 <label className="field"><span>Note / receipt reference</span><input required={!purchase} minLength={purchase?0:2} maxLength="500" value={form.note} onChange={e=>change('note',e.target.value)}/></label>
 </div>{purchase&&<p>Total purchase cost: <strong>{currency(Number(form.quantity)*Number(form.unit_cost))}</strong></p>}<button className="primary-btn">{request.busy?'Saving…':purchase?'Save purchase & add stock':'Save expense'}</button></fieldset></form></section>
 <section className="admin-card"><div className="card-title-row"><div><h2>All-time records · {currency(total)}</h2><p>{rows.length} entries</p></div><button className="secondary-btn" disabled={!rows.length} onClick={()=>exportCsv(purchase?'stock-purchases':'business-expenses',rows)}>Download CSV</button></div>{loading?<p>Loading…</p>:<div className="table-wrap"><table><thead><tr><th>Date</th><th>{purchase?'Supplier / Product':'Category'}</th>{purchase&&<><th>Jars</th><th>Cost / jar</th></>}<th>Amount</th><th>Note</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{shortDate((purchase?r.purchased_on:r.spent_on)+'T12:00:00+05:30')}</td><td>{purchase?r.supplier+' · '+r.size_label:r.category}</td>{purchase&&<><td>{r.quantity}</td><td>{currency(r.unit_cost)}</td></>}<td>{currency(purchase?r.total_cost:r.amount)}</td><td>{r.note}</td></tr>)}</tbody></table>{!rows.length&&<p>No records yet.</p>}</div>}</section>
 </>}
 </div>
}
