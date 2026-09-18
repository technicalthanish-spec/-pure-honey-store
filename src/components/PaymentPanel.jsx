import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { currency, dateTime } from '../lib/format.js'
import { balance } from '../lib/business.js'

const localNow=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
export default function PaymentPanel({order}) {
  const [rows,setRows]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[message,setMessage]=useState('')
  const [kind,setKind]=useState('payment'),[amount,setAmount]=useState(''),[method,setMethod]=useState('UPI'),[date,setDate]=useState(localNow),[note,setNote]=useState('')
  const attempt=useRef(null),lock=useRef(false)
  const load=async()=>{
    const {data,error}=await supabase.from('payments').select('*').eq('order_id',order.id).order('created_at',{ascending:false})
    if(error){setError('Payment records unavailable. Apply migration_v4.sql first, then refresh.');setLoaded(false)}else{setRows(data||[]);setLoaded(true)}
  }
  useEffect(()=>{load()},[order.id])
  const b=balance(order,rows)
  const submit=async e=>{
    e.preventDefault();if(lock.current)return
    lock.current=true;setBusy(true);setError('');setMessage('')
    try{
      const payload={p_order_id:order.id,p_kind:kind,p_amount:Number(amount),p_method:method,p_paid_at:new Date(date).toISOString(),p_note:note}
      const fingerprint=JSON.stringify(payload)
      if(!attempt.current || attempt.current.fingerprint!==fingerprint)attempt.current={fingerprint,id:crypto.randomUUID()}
      const {error}=await supabase.rpc('record_payment',{...payload,p_request_id:attempt.current.id})
      if(error)throw error
      attempt.current=null;setAmount('');setNote('');setMessage('Recorded successfully. The ledger keeps this entry permanently.');await load()
    }catch(e){setError(e.message+' If the connection failed, retry with the same details to avoid a duplicate entry.')}
    finally{lock.current=false;setBusy(false)}
  }
  return <section className="admin-card payment-panel">
    <h2>Payments & refunds</h2><p className="muted-text">Record money only after it has actually been received or refunded. Date uses your device’s local time.</p>
    {error&&<p role="alert" className="alert error">{error}</p>}{message&&<p role="status" className="alert success">{message}</p>}
    {loaded&&<>
      <div className="business-metrics compact">{[['Received',b.received],['Refunded',b.refunded],['Pending payment',b.pending],['Refund pending',b.refundDue]].map(([k,v])=><div key={k}><span>{k}</span><strong>{currency(v)}</strong></div>)}</div>
      <form onSubmit={submit} className="form-grid ledger-form">
        <label className="field"><span>Entry type</span><select value={kind} onChange={e=>setKind(e.target.value)} disabled={busy}><option value="payment">Payment received</option><option value="refund">Refund sent</option></select></label>
        <label className="field"><span>Amount (₹)</span><input required type="number" min="0.01" step="0.01" max={kind==='payment'?b.pending:b.net} value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy}/></label>
        <label className="field"><span>Method</span><select value={method} onChange={e=>setMethod(e.target.value)} disabled={busy}>{['Cash','UPI','Bank'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="field"><span>Received / refunded at</span><input required type="datetime-local" value={date} onChange={e=>setDate(e.target.value)} disabled={busy}/></label>
        <label className="field full"><span>Reference / note</span><input maxLength={500} value={note} onChange={e=>setNote(e.target.value)} placeholder="UPI reference or reason for refund" disabled={busy}/></label>
        <button className="primary-btn" disabled={busy || (kind==='payment'?b.pending<=0:b.net<=0)}>{busy?'Saving…':'Record '+(kind==='payment'?'payment':'refund')}</button>
      </form>
      <div className="business-list">{rows.map(p=><div className="business-row" key={p.id}><div><strong>{p.kind==='refund'?'Refund':'Payment'} · {p.method}</strong><small>{dateTime(p.paid_at)} · {p.note||'No reference'}</small></div><strong>{p.kind==='refund'?'−':''}{currency(p.amount)}</strong></div>)}{!rows.length&&<p className="muted-text">No money recorded yet. This order has not been marked paid.</p>}</div>
    </>}
  </section>
}
