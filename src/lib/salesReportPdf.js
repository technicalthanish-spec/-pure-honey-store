import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { indiaDate, weightText, giveawayTotals, reportSummary } from './salesReport.js'
const money=value=>Number(value||0).toFixed(2)
const ascii=value=>String(value||'').replaceAll('×','x').replaceAll('−','-').replaceAll('₹','Rs. ')
export function buildSalesReport(rows,total,description,freeRows=[],freeTotal=giveawayTotals(freeRows)){
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'}),summary=reportSummary(total,freeTotal)
 doc.setFontSize(18);doc.text('Honey Sales, Costs & Free Honey',12,16)
 doc.setFontSize(8);const intro=doc.splitTextToSize('PRIVATE BUSINESS REPORT | '+ascii(description),272);doc.text(intro,12,23)
 let y=28+intro.length*3.5
 const heading=(title,space=28)=>{if(y+space>190){doc.addPage();y=17}doc.setFontSize(12);doc.text(title,12,y);y+=5}
 const table=(head,body,foot)=>{autoTable(doc,{startY:y,margin:{left:12,right:12,top:15,bottom:18},theme:'grid',head:[head],body,foot:foot?[foot]:undefined,showFoot:'lastPage',styles:{fontSize:8,cellPadding:2,overflow:'linebreak'},headStyles:{fillColor:[41,77,60]},footStyles:{fillColor:[234,240,231],textColor:[30,45,30]},rowPageBreak:'avoid'});y=doc.lastAutoTable.finalY+10}
 heading('1. Sold honey - selling rates, costs and discounts')
 table(['Date / Order','Customer','Honey / jars','Sell rate / jar','Cost / jar','Sold cost','Sale amount','Discount','Delivery','Bill total','Net received','Pending'],rows.map(r=>[indiaDate(r.created_at)+'\n'+r.order_number+'\n'+r.status,r.customer_name,ascii(r.itemsText),ascii(r.rateText),ascii(r.costText),money(r.costTotal),money(r.subtotal),money(r.discount_amount),money(r.delivery_charge),money(r.grand_total),money(r.net),money(r.pending)]),['TOTAL',total.orders+' orders',total.jars+' jars / '+weightText(total),'','',money(total.costTotal),money(total.subtotal),money(total.discount_amount),money(total.delivery_charge),money(total.grand_total),money(total.net),money(total.pending)])
 heading('2. Sales summary',90)
 table(['Sales and payment summary','INR'],summary.sales.map(([k,v])=>[k,money(v)]))
 heading('3. Free honey - recipients and actual cost')
 table(['Date','Given to','Honey / size','Jars','Weight','Cost / jar','Total cost / loss','Charge','Note'],freeRows.length?freeRows.map(g=>[indiaDate(g.created_at),g.recipient,g.product_name+' '+g.size_label,g.jars,weightText(g),money(g.unit_cost),money(g.costTotal),'FREE / 0.00',g.note||'-']):[['-','No matching giveaways','','','','','','','']],['FREE TOTAL','','',freeTotal.jars,weightText(freeTotal),'',money(freeTotal.costTotal),'0.00',''])
 heading('4. Final summary - deducting sold and free honey cost',80)
 table(['Calculation','INR'],summary.final.map(([k,v])=>[k,money(v)]))
 if(y+24>190){doc.addPage();y=17}doc.setFontSize(8)
 const note='Profit uses billed sales; net received is payments minus refunds. Operating expenses are excluded from this report. See the dashboard for complete net profit. '+((total.missingCost||freeTotal.missingCost)?'WARNING: Some costs are zero or missing; profit may be overstated.':'')
 doc.text(doc.splitTextToSize(note,272),12,y)
 for(let page=1;page<=doc.getNumberOfPages();page++){doc.setPage(page);doc.setFontSize(8);doc.text('INR | Private cost statement | Cancelled orders excluded | Not a customer tax invoice',12,202);doc.text(page+' / '+doc.getNumberOfPages(),284,202,{align:'right'})}
 return doc
}
export function downloadSalesReport(...args){buildSalesReport(...args).save('honey-sales-report-'+indiaDate(new Date())+'.pdf')}
