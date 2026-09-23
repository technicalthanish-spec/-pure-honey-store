import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { indiaDate, weightText, giveawayTotals } from './salesReport.js'
const money = value => Number(value || 0).toFixed(2)
export function downloadSalesReport(rows, total, description, freeRows = [], freeTotal = giveawayTotals(freeRows)) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setFontSize(19)
  doc.text('Honey Sales & Free Honey Report', 12, 17)
  doc.setFontSize(9)
  const lines = doc.splitTextToSize(description, 270)
  doc.text(lines, 12, 24)
  const start = 29 + lines.length * 4
  autoTable(doc, {
    startY: start, margin: { left: 12, right: 12, bottom: 16 }, theme: 'grid',
    head: [['Date / Order', 'Customer', 'Honey / Quantity', 'Weight', 'Amount', 'Discount', 'Delivery', 'Total', 'Net received', 'Pending']],
    body: rows.map(row => [indiaDate(row.created_at) + '\n' + row.order_number + '\n' + row.status,
      row.customer_name, row.itemsText.replaceAll('×', 'x'), weightText(row), money(row.subtotal), money(row.discount_amount),
      money(row.delivery_charge), money(row.grand_total), money(row.net), money(row.pending)]),
    foot: [['TOTAL', total.orders + ' orders', total.jars + ' jars', weightText(total), money(total.subtotal),
      money(total.discount_amount), money(total.delivery_charge), money(total.grand_total), money(total.net), money(total.pending)]],
    showFoot: 'lastPage', styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [75, 51, 34] }, footStyles: { fillColor: [245, 237, 219], textColor: [45, 35, 20] },
  })
  let freeY = (doc.lastAutoTable?.finalY || start) + 12
  if (freeY > 160) { doc.addPage(); freeY = 18 }
  doc.setFontSize(12)
  doc.text('Free honey / Giveaways', 12, freeY)
  autoTable(doc, {
    startY: freeY + 5, margin: { left: 12, right: 12, bottom: 22 }, theme: 'grid',
    head: [['Date', 'Given to', 'Honey / Size', 'Jars', 'Weight', 'Charge', 'Note']],
    body: freeRows.length ? freeRows.map(g => [indiaDate(g.created_at), g.recipient, g.product_name + ' ' + g.size_label, String(g.jars), weightText(g), 'FREE - Rs. 0', g.note || '-']) : [['-', 'No free honey recorded for these filters', '', '', '', '', '']],
    foot: [['FREE TOTAL', '', '', String(freeTotal.jars), weightText(freeTotal), 'Rs. 0', 'Not added to sales revenue']],
    showFoot: 'lastPage', styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [75,51,34] }, footStyles: { fillColor: [245,237,219], textColor: [45,35,20] },
  })
  let summaryY = doc.lastAutoTable.finalY + 10
  if (summaryY > 187) { doc.addPage(); summaryY = 18 }
  doc.setFontSize(10)
  doc.text('Sales + free honey: ' + (total.jars + freeTotal.jars) + ' jars | ' + weightText({grams: total.grams + freeTotal.grams, unknownWeight: total.unknownWeight || freeTotal.unknownWeight}), 12, summaryY)
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFontSize(8)
    doc.text('INR | Cancelled orders excluded | Sales summary, not an individual tax invoice', 12, 202)
    doc.text(page + ' / ' + pages, 284, 202, { align: 'right' })
  }
  doc.save('honey-sales-report-' + indiaDate(new Date()) + '.pdf')
}
