export const cents = value => Math.round(Number(value || 0) * 100)
export const rupees = value => value / 100
export function balance(order, payments) {
  const rows = payments.filter(p => p.order_id === order.id)
  const received = rows.filter(p=>p.kind==='payment').reduce((n,p)=>n+cents(p.amount),0)
  const refunded = rows.filter(p=>p.kind==='refund').reduce((n,p)=>n+cents(p.amount),0)
  const net = received-refunded
  return { received:rupees(received), refunded:rupees(refunded), net:rupees(net), pending:order.status==='Cancelled'?0:rupees(Math.max(0,cents(order.grand_total)-net)), refundDue:order.status==='Cancelled'?rupees(Math.max(0,net)):0 }
}
const day = value => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))
export function inPeriod(value, period, now = new Date()) {
  if(period==='all') return true
  const a=day(value), b=day(now)
  return period==='today'?a===b:a.slice(0,7)===b.slice(0,7)
}
export function customers(orders,payments) {
  const result=new Map()
  for(const o of orders){
    let c=result.get(o.mobile)
    if(!c){ c={mobile:o.mobile,name:o.customer_name,city:o.city,last:o.created_at,orders:[],value:0,net:0,pending:0,refundDue:0};result.set(o.mobile,c) }
    if(o.created_at>c.last){c.name=o.customer_name;c.city=o.city;c.last=o.created_at}
    c.orders.push(o)
    const b=balance(o,payments)
    if(o.status!=='Cancelled')c.value+=cents(o.grand_total)
    c.net+=cents(b.net);c.pending+=cents(b.pending);c.refundDue+=cents(b.refundDue)
  }
  return [...result.values()].map(c=>({...c,value:rupees(c.value),net:rupees(c.net),pending:rupees(c.pending),refundDue:rupees(c.refundDue)}))
}
export function exportCsv(name, rows) {
  if(!rows.length) return
  const keys=Object.keys(rows[0])
  const cell=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
  const text=[keys,...rows.map(r=>keys.map(k=>r[k]))].map(row=>row.map(cell).join(',')).join('\r\n')
  const url=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'}))
  const a=document.createElement('a');a.href=url;a.download=name+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
