import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { shortDate } from './format.js'

const moneyText = (value) => `Rs. ${Number(value || 0).toFixed(2)}`

export function buildInvoicePdf({ invoice, order, settings }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const left = 16
  const right = pageWidth - 16

  doc.setTextColor(18, 18, 18)
  doc.setDrawColor(35, 35, 35)

  // Brand / heading
  doc.setFillColor(25, 25, 25)
  doc.roundedRect(left, 16, 13, 13, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('H', left + 6.5, 24.5, { align: 'center' })

  doc.setTextColor(18, 18, 18)
  doc.setFontSize(16)
  doc.text(settings?.business_name || 'Pure Honey', left + 18, 21)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)

  const businessLines = [settings?.address, settings?.phone, settings?.email].filter(Boolean)
  businessLines.forEach((line, index) => {
    const wrapped = doc.splitTextToSize(String(line), 92)
    doc.text(wrapped, left + 18, 26 + index * 4)
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('INVOICE', right, 21, { align: 'right' })
  doc.setFontSize(10)
  doc.text(invoice.invoice_number, right, 28, { align: 'right' })

  doc.setDrawColor(90, 90, 90)
  doc.line(left, 39, right, 39)

  // Bill to + metadata
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('BILL TO', left, 49)
  doc.setFontSize(11)
  doc.text(order.customer_name, left, 56)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.8)
  doc.text(String(order.mobile), left, 61)

  const address = [order.address, order.city, order.state, order.pin_code].filter(Boolean).join(', ')
  doc.text(doc.splitTextToSize(address, 88), left, 66)

  const metaX = 124
  const metaRows = [
    ['Invoice Date', shortDate(invoice.issued_at || invoice.created_at)],
    ['Order Number', order.order_number],
    ['Order Date', shortDate(order.created_at)],
    ['Payment', 'Offline'],
    ['Status', order.status === 'Cancelled' ? 'CANCELLED' : order.status],
  ]

  let metaY = 49
  metaRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(95, 95, 95)
    doc.text(label, metaX, metaY)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(18, 18, 18)
    doc.text(String(value), right, metaY, { align: 'right' })
    metaY += 7
  })

  const rows = (order.order_items || []).map((item, index) => [
    String(index + 1),
    `${item.product_name}\n${item.size_label}`,
    String(item.quantity),
    moneyText(item.rate),
    moneyText(item.amount),
  ])

  autoTable(doc, {
    startY: 88,
    head: [['#', 'Description', 'Qty', 'Rate', 'Amount']],
    body: rows,
    theme: 'grid',
    margin: { left, right: 16 },
    styles: {
      font: 'helvetica',
      fontSize: 8.8,
      textColor: [22, 22, 22],
      lineColor: [150, 150, 150],
      lineWidth: 0.2,
      cellPadding: 3,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [20, 20, 20],
      fontStyle: 'bold',
      lineColor: [90, 90, 90],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 78 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 35, halign: 'right' },
    },
  })

  const finalY = doc.lastAutoTable?.finalY || 116
  const totalsX = 128
  const labelX = totalsX
  const valueX = right

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Subtotal', labelX, finalY + 12)
  doc.text(moneyText(invoice.subtotal), valueX, finalY + 12, { align: 'right' })
  if (Number(invoice.discount_amount)>0) {
    doc.text('Discount (' + invoice.coupon_code + ')', left, finalY + 19)
    doc.text('-' + moneyText(invoice.discount_amount), left, finalY + 26)
  }
  doc.text('Delivery Charge', labelX, finalY + 19)
  doc.text(moneyText(invoice.delivery_charge), valueX, finalY + 19, { align: 'right' })
  doc.setDrawColor(80, 80, 80)
  doc.line(totalsX, finalY + 23, right, finalY + 23)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Grand Total', labelX, finalY + 31)
  doc.text(moneyText(invoice.grand_total), valueX, finalY + 31, { align: 'right' })

  const noteY = Math.min(finalY + 48, pageHeight - 42)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('NOTE', left, noteY)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text(
    doc.splitTextToSize('Thank you for your order. This is a computer-generated invoice for the order recorded in the Honey Order system.', 105),
    left,
    noteY + 6,
  )

  doc.setDrawColor(140, 140, 140)
  doc.line(left, pageHeight - 18, right, pageHeight - 18)
  doc.setFontSize(7.8)
  doc.setTextColor(90, 90, 90)
  doc.text('Computer-generated invoice • No signature required', left, pageHeight - 12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(25, 25, 25)
  doc.text(settings?.business_name || 'Pure Honey', right, pageHeight - 12, { align: 'right' })

  return doc
}

export function previewInvoicePdf(data) {
  const doc = buildInvoicePdf(data)
  const url = URL.createObjectURL(doc.output('blob'))
  window.open(url, '_blank', 'noopener,noreferrer')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function downloadInvoicePdf(data) {
  const doc = buildInvoicePdf(data)
  doc.save(`${data.invoice.invoice_number}.pdf`)
}
