import { useEffect, useRef, useState } from 'react'
import { useAdminSave } from '../lib/useAdminSave.js'
import { currency } from '../lib/format.js'
const fields={
 expense:[['category','Category',['Packaging','Courier','Travel','Other']],['amount','Amount (₹)','number'],['spent_on','Expense date','date'],['note','Note','text']],
 purchase:[['supplier','Supplier','text'],['purchased_on','Purchase date','date'],['quantity','Jars received','integer'],['unit_cost','Cost / jar (₹)','number'],['note','Note','text']],
 giveaway:[['recipient','Given to','text'],['quantity','Free jars','integer'],['unit_cost','Cost / jar (₹)','number'],['note','Note','text']],
 payment:[['kind','Entry type',['payment','refund']],['amount','Amount (₹)','number'],['method','Method',['Cash','UPI','Bank']],['paid_at','Payment date and time','datetime-local'],['note','Note','text']],
 order:[['customer_name','Customer name','text'],['mobile','Mobile','tel'],['whatsapp','WhatsApp','tel'],['address','Address','text'],['city','City','text'],['state','State','text'],['pin_code','PIN code','text'],['discount_amount','Discount (₹)','number'],['delivery_charge','Delivery charged (₹)','number'],['sale_note','Note','text']]
}
export default function RecordEditor({kind,record,onSaved}){
 const [action,setAction]=useState(null)
 return <><div className="record-actions">{!record.deleted_at&&<button className="secondary-btn small" onClick={()=>setAction('edit')}>Edit</button>}{kind==='expense'&&<button className="secondary-btn small" onClick={()=>setAction(record.deleted_at?'restore':'delete')}>{record.deleted_at?'Restore':'Delete'}</button>}</div>{action&&<Editor key={record.id+action} kind={kind} record={record} action={action} onClose={()=>setAction(null)} onSaved={onSaved}/>}</>
}
function Editor({kind,record,action,onClose,onSaved}){
 const modal=useRef(null),request=useAdminSave('correct-'+kind+'-'+record.id,'admin_correct_record')
 const [form,setForm]=useState(()=>({...record,paid_at:record.paid_at?new Date(new Date(record.paid_at).getTime()-new Date(record.paid_at).getTimezoneOffset()*60000).toISOString().slice(0,16):'',items:record.order_items?.map(i=>({...i}))}))
 useEffect(()=>{modal.current?.showModal();return()=>modal.current?.close()},[])
 const set=(key,value)=>setForm(f=>({...f,[key]:value}))
 const save=async(e,retry=false)=>{e?.preventDefault();let payload
  if(!retry){const {order_items,invoices,...expected}=record;const data={...form};if(kind==='payment')data.paid_at=new Date(form.paid_at).toISOString();payload={p_kind:kind,p_id:record.id,p_action:action,p_expected:expected,p_data:data}}
  const result=await request.save(payload);if(result){await onSaved();onClose()}
 }
 const subtotal=(form.items||[]).reduce((s,i)=>s+Number(i.quantity)*Number(i.rate),0)
 return <dialog ref={modal} className="record-dialog" aria-labelledby={'edit-title-'+record.id} onCancel={e=>{if(request.busy||request.pending)e.preventDefault();else onClose()}}><div className="section-heading"><h2 id={'edit-title-'+record.id}>{action==='edit'?'Edit '+kind:action==='delete'?'Delete expense?':'Restore expense?'}</h2><button className="secondary-btn" disabled={request.busy||Boolean(request.pending)} onClick={onClose}>Close</button></div>
 {request.error&&<p className="alert error" role="alert">{request.error}</p>}
 {request.pending&&<div className="alert warning"><p>Confirmation is pending. Check the same request before making another change.</p><button className="secondary-btn" disabled={request.busy} onClick={e=>save(e,true)}>Check / retry correction</button></div>}
 <form onSubmit={save}><fieldset disabled={request.busy||Boolean(request.pending)}>
 {action!=='edit'?<p>{action==='delete'?'This expense will be removed from profit calculations. You can restore it from Deleted expenses.':'This expense will count in profit calculations again.'} <strong>{currency(record.amount)}</strong> · {record.note}</p>:<>
 {kind==='purchase'&&<p className="muted-text">Supplier, date and note can be corrected anytime. Quantity and cost can be corrected only before later sales, giveaways or purchases for this honey.</p>}
 {kind==='giveaway'&&<p className="muted-text">Changing jars adjusts stock. Cost is the actual cost of this gift, not its selling price.</p>}
 {kind==='payment'&&<p className="muted-text">Correct an entry mistake here. For an actual refund, record a new refund instead.</p>}
 {kind==='order'&&<p className="muted-text">Edits update this bill and invoice, adjust reserved stock, and preserve the previous values in history. Discount becomes a manually reviewed bill discount.</p>}
 <div className="form-grid">{fields[kind].map(([key,label,type])=><label className="field" key={key}><span>{label}</span>{Array.isArray(type)?<select value={form[key]??''} onChange={e=>set(key,e.target.value)}>{type.map(v=><option key={v}>{v}</option>)}</select>:<input required={!['note','sale_note','address','city','state','pin_code','whatsapp'].includes(key)} type={type==='integer'?'number':type} min={type==='integer'?1:type==='number'?0:undefined} step={type==='integer'?1:type==='number'?'0.01':undefined} maxLength={type==='text'?500:undefined} value={form[key]??''} onChange={e=>set(key,e.target.value)}/>}</label>)}</div>
 {kind==='order'&&<><h3>Honey quantities, prices & costs</h3>{form.items.map((item,index)=><div className="edit-item" key={item.id}><strong>{item.product_name} · {item.size_label}</strong><div className="form-grid">{[['quantity','Jars'],['rate','Selling rate / jar'],['unit_cost','Actual cost / jar']].map(([key,label])=><label className="field" key={key}><span>{label}</span><input required type="number" min={key==='quantity'?1:0} step={key==='quantity'?1:0.01} value={item[key]} onChange={e=>set('items',form.items.map((i,n)=>n===index?{...i,[key]:e.target.value}:i))}/></label>)}</div></div>)}<p>Revised bill: <strong>{currency(subtotal-Number(form.discount_amount)+Number(form.delivery_charge))}</strong></p></>}
 </>}
 <button className="primary-btn">{request.busy?'Saving…':action==='edit'?'Save correction':action==='delete'?'Delete expense':'Restore expense'}</button></fieldset></form></dialog>
}
