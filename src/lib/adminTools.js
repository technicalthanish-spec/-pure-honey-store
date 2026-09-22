import { cents, rupees } from './business.js'
export async function readAll(table, columns = '*') {
 const { supabase } = await import('./supabase.js')
 const rows=[]
 for(let offset=0;;offset+=500){
  const {data,error}=await supabase.from(table).select(columns).order('id').range(offset,offset+499)
  if(error)throw error
  rows.push(...(data||[]))
  if(!data||data.length<500)return rows
 }
}
export function saleAmounts(items, kind, value, delivery, paid) {
 const subtotalCents=items.reduce((sum,item)=>sum+cents(item.rate)*Number(item.quantity),0)
 const discountCents=kind==='percent'?Math.round(subtotalCents*Number(value||0)/100):cents(value)
 const totalCents=subtotalCents-discountCents+cents(delivery)
 return {subtotal:rupees(subtotalCents),discount:rupees(discountCents),total:rupees(totalCents),pending:rupees(totalCents-cents(paid))}
}
export function customerBook(orders,payments){
 const map=new Map()
 for(const o of [...orders].sort((a,b)=>b.created_at.localeCompare(a.created_at))){
  const key=o.mobile || 'order:'+o.id
  if(!map.has(key))map.set(key,{mobile:o.mobile,name:o.customer_name,address:[o.address,o.city,o.state,o.pin_code].filter(Boolean).join(', '),orders:[],total:0,net:0,pending:0,refundDue:0})
  map.get(key).orders.push(o)
 }
 const byOrder=new Map()
 for(const p of payments)byOrder.set(p.order_id,(byOrder.get(p.order_id)||0)+(p.kind==='refund'?-1:1)*cents(p.amount))
 for(const c of map.values()){
  for(const o of c.orders){
   const net=byOrder.get(o.id)||0
   c.net+=net
   if(o.status==='Cancelled')c.refundDue+=Math.max(0,net)
   else {c.total+=cents(o.grand_total);c.pending+=Math.max(0,cents(o.grand_total)-net)}
  }
  for(const key of ['total','net','pending','refundDue'])c[key]=rupees(c[key])
 }
 return [...map.values()]
}
export function saveJson(name,data){
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}))
 const a=document.createElement('a');a.href=url;a.download=name;a.click()
 setTimeout(()=>URL.revokeObjectURL(url),10000)
}
