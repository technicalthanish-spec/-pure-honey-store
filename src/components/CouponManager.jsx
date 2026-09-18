import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { currency } from '../lib/format.js'
const blank={code:'',kind:'percent',value:'',min_order:0,max_discount:'',expires_at:'',usage_limit:'',per_customer_limit:'',active:true}
export default function CouponManager({coupons,orders,reload}){
 const [form,setForm]=useState({...blank}),[id,setId]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 const update=(k,v)=>setForm(f=>({...f,[k]:v}))
 const edit=c=>{const d=c.expires_at?new Date(c.expires_at):null;setId(c.id);setForm({...c,max_discount:c.max_discount??'',usage_limit:c.usage_limit??'',per_customer_limit:c.per_customer_limit??'',expires_at:d?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16):''});window.scrollTo({top:0,behavior:'smooth'})}
 const save=async e=>{e.preventDefault();setBusy(true);setError('');setMessage('');try{
  const data={code:form.code.trim().toUpperCase(),kind:form.kind,value:Number(form.value),min_order:Number(form.min_order),max_discount:form.max_discount===''?null:Number(form.max_discount),expires_at:form.expires_at?new Date(form.expires_at).toISOString():null,usage_limit:form.usage_limit===''?null:Number(form.usage_limit),per_customer_limit:form.per_customer_limit===''?null:Number(form.per_customer_limit),active:form.active}
  const {error}=id?await supabase.from('coupons').update(data).eq('id',id):await supabase.from('coupons').insert(data)
  if(error)throw error
  setMessage('Coupon saved. Existing invoices keep their original discount.');setId(null);setForm({...blank});await reload()
 }catch(e){setError(e.message)}finally{setBusy(false)}}
 return <>
  <section className="admin-card"><h2>{id?'Edit coupon':'Create a coupon'}</h2><p className="muted-text">Discount applies to products, not delivery. Empty limits mean unlimited. Expiry uses your device’s local time.</p>
   {error&&<p className="alert error" role="alert">{error}</p>}{message&&<p className="alert success">{message}</p>}
   <form className="form-grid ledger-form" onSubmit={save}>
    <label className="field"><span>Code</span><input required pattern="[A-Za-z0-9_-]{3,24}" maxLength={24} value={form.code} onChange={e=>update('code',e.target.value.toUpperCase())}/></label>
    <label className="field"><span>Discount type</span><select value={form.kind} onChange={e=>update('kind',e.target.value)}><option value="percent">Percentage</option><option value="fixed">Fixed rupees</option></select></label>
    {[['value',form.kind==='percent'?'Percentage':'Discount ₹'],['min_order','Minimum products total ₹'],['max_discount','Maximum discount ₹'],['usage_limit','Total usage limit'],['per_customer_limit','Uses per mobile number']].map(([k,label])=><label className="field" key={k}><span>{label}</span><input type="number" min={k==='min_order'?0:k.includes('limit')?1:0.01} step={k.includes('limit')?1:0.01} max={k==='value'&&form.kind==='percent'?100:undefined} required={['value','min_order'].includes(k)} value={form[k]} onChange={e=>update(k,e.target.value)}/></label>)}
    <label className="field"><span>Expires at (optional)</span><input type="datetime-local" value={form.expires_at} onChange={e=>update('expires_at',e.target.value)}/></label>
    <label className="check-row"><input type="checkbox" checked={form.active} onChange={e=>update('active',e.target.checked)}/>Active</label>
    <div className="button-group"><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Save coupon'}</button>{id&&<button type="button" className="secondary-btn" onClick={()=>{setId(null);setForm({...blank})}}>Cancel edit</button>}</div>
   </form>
  </section>
  <section className="admin-card"><h2>Your coupons</h2><p className="muted-text">Cancelled orders still count as uses. Mobile limits are not identity-verified.</p><div className="business-list">{coupons.map(c=>{const used=orders.filter(o=>o.coupon_id===c.id);return <div className="business-row" key={c.id}><div><strong>{c.code} · {c.kind==='percent'?c.value+'%':currency(c.value)}</strong><small>{!c.active?'Disabled':c.expires_at&&new Date(c.expires_at)<new Date()?'Expired':'Active'} · {used.length}/{c.usage_limit??'∞'} uses</small><small>Discount issued: {currency(used.reduce((s,o)=>s+Number(o.discount_amount),0))} · Active order value: {currency(used.filter(o=>o.status!=='Cancelled').reduce((s,o)=>s+Number(o.grand_total),0))}</small></div><button className="secondary-btn" onClick={()=>edit(c)}>Edit / disable</button></div>})}{!coupons.length&&<p>No coupons yet.</p>}</div></section>
 </>
}
