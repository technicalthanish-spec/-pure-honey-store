import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { indiaDate, weightText, giveawayTotals, reportSummary } from './salesReport.js'
const money=v=>Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2})
const clean=v=>String(v??'').replaceAll('×','x').replaceAll('−','-').replaceAll('₹','Rs. ')
export function buildSalesReport(rows,total,description,freeRows=[],freeTotal=giveawayTotals(freeRows)){
 const doc=new jsPDF({unit:'mm',format:'a4'}),summary=reportSummary(total,freeTotal),green=[41,77,60]
 doc.setFont('helvetica','normal');doc.setCharSpace(0)
 doc.setTextColor(...green);doc.setFontSize(10);doc.text('HONEY BUSINESS',14,17)
 doc.setTextColor(30);doc.setFont('helvetica','bold');doc.setFontSize(23);doc.text('Sales statement',14,28)
 doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(95)
 const scope=description.split(' | ').filter(s=>!s.startsWith('Loaded:')&&!s.startsWith('Free giveaways')).join(' | ')
 const intro=doc.splitTextToSize(clean(scope),182);doc.text(intro,14,35)
 let y=40+intro.length*3.5
 const ensure=height=>{if(y+height>279){doc.addPage();y=18}}
 const title=(text,note='')=>{ensure(24);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(35);doc.text(text,14,y);if(note){doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(95);doc.text(note,196,y,{align:'right'})}y+=5}
 const table=(head,body,foot,widths)=>{autoTable(doc,{startY:y,margin:{left:14,right:14,top:18,bottom:18},theme:'plain',head:[head],body,foot:foot?[foot]:undefined,showFoot:'lastPage',styles:{font:'helvetica',fontSize:9,cellPadding:1.7,textColor:40,overflow:'linebreak',lineWidth:0},headStyles:{fillColor:green,textColor:255,fontSize:8,fontStyle:'bold'},bodyStyles:{lineColor:[225,230,224],lineWidth:{bottom:.15}},footStyles:{fillColor:[240,244,238],textColor:35,fontStyle:'bold'},columnStyles:Object.fromEntries(widths.map((w,i)=>[i,{cellWidth:w,halign:i>=widths.length-3?'right':'left'}])),rowPageBreak:'avoid'});y=doc.lastAutoTable.finalY+8}
 title('Sold honey',total.orders+' orders / '+total.jars+' jars / '+weightText(total))
 const priceText=(r,key)=>(r.order_items||[]).map(i=>money(i[key])).join('\n')
 table(['Customer / Honey','Sell / jar','Cost / jar','Amount','Discount','Bill','Cost'],rows.length?rows.map(r=>[clean(r.customer_name)+'\n'+(r.order_items||[]).map(i=>i.size_label+' x '+i.quantity).join('\n'),priceText(r,'rate'),priceText(r,'unit_cost'),money(r.subtotal),money(r.discount_amount),money(r.grand_total),money(r.costTotal)]):[['No matching sales','','','','','','']],['TOTAL','','',money(total.subtotal),money(total.discount_amount),money(total.grand_total),money(total.costTotal)],[51,23,23,23,20,22,20])
 ensure(15);doc.setFontSize(9);doc.setTextColor(65);doc.setFont('helvetica','normal');doc.text('Net received: Rs. '+money(total.net)+'    |    Pending: Rs. '+money(total.pending),14,y)
 y+=5;if(Number(total.delivery_charge)||Number(total.refunded)){doc.setFontSize(8);doc.text('Delivery included in bills: Rs. '+money(total.delivery_charge)+'    |    Refunds deducted: Rs. '+money(total.refunded),14,y);y+=5}y+=6
 title('Free honey',freeTotal.jars+' jars / '+weightText(freeTotal))
 table(['Given to','Honey','Jars','Cost / jar','Total cost'],freeRows.length?freeRows.map(g=>[clean(g.recipient),g.size_label,String(g.jars),money(g.unit_cost),money(g.costTotal)]):[['No matching free honey','','','','']],['TOTAL','',String(freeTotal.jars),'',money(freeTotal.costTotal)],[66,40,18,29,29])
 ensure(47)
 const start=y;doc.setFillColor(244,247,242);doc.roundedRect(14,start,182,39,3,3,'F');doc.setFontSize(9);doc.setTextColor(60)
 const calculations=[['Billed sales after discount',total.grand_total],['Less: sold honey cost',-total.costTotal],['Less: free honey cost',-freeTotal.costTotal]]
 calculations.forEach(([label,value],i)=>{doc.setFont('helvetica','normal');doc.text(label,19,start+7+i*6);doc.text('Rs. '+money(value),191,start+7+i*6,{align:'right'})})
 doc.setDrawColor(208,218,204);doc.line(19,start+24,191,start+24);doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(...green);doc.text(summary.profit<0?'LOSS AFTER HONEY COSTS':'PROFIT AFTER HONEY COSTS',19,start+33);doc.text('Rs. '+money(Math.abs(summary.profit)),191,start+33,{align:'right'});y=start+45
 doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(100);const note=(total.missingCost||freeTotal.missingCost)?'Some costs are missing or zero. Correct them before using the profit total.':'Before operating expenses. Profit includes pending sales; received payment is shown separately.';ensure(10);doc.text(doc.splitTextToSize(note,182),14,y)
 const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(120);doc.text('Private business statement  |  All amounts in INR',14,289);doc.text(p+' / '+pages,196,289,{align:'right'})}
 return doc
}
export function downloadSalesReport(...args){buildSalesReport(...args).save('honey-sales-report-'+indiaDate(new Date())+'.pdf')}
