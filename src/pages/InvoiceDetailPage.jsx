import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import InvoiceSheet from '../components/InvoiceSheet.jsx'
import { buildInvoicePdf, downloadInvoicePdf, previewInvoicePdf } from '../lib/invoicePdf.js'
import Loader from '../components/Loader.jsx'

export default function InvoiceDetailPage() {
  const { invoiceId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      const [{ data: invoice, error: invoiceError }, { data: settings, error: settingsError }] = await Promise.all([
        supabase.from('invoices').select('*, orders(*, order_items(*))').eq('id', invoiceId).single(),
        supabase.from('business_settings').select('*').eq('id', 1).maybeSingle(),
      ])
      if (invoiceError) setError(invoiceError.message)
      else if (settingsError) setError(settingsError.message)
      else setData({ invoice, order: invoice.orders, settings })
      setLoading(false)
    }
    load()
  }, [invoiceId])

  if (loading) return <Loader label="Loading invoice..." />
  if (!data) return <div className="admin-page"><div className="alert error">{error || 'Invoice not found.'}</div></div>

  const { invoice, order, settings } = data
  const sharePdf = async () => {
    try {
      const file = new File([buildInvoicePdf(data).output('blob')], invoice.invoice_number + '.pdf', { type: 'application/pdf' })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: invoice.invoice_number, text: 'Honey invoice for ' + order.customer_name })
      else downloadInvoicePdf(data)
    } catch (e) { if (e.name !== 'AbortError') setError('Could not share PDF. Use Download PDF and attach it in WhatsApp.') }
  }
  const whatsapp = 'https://wa.me/91' + String(order.mobile).replace(/[^0-9]/g, '') + '?text=' + encodeURIComponent(
    'Hello ' + order.customer_name + ', your honey bill ' + invoice.invoice_number + ': ' +
    (order.order_items || []).map(i => i.size_label + ' x ' + i.quantity).join(', ') +
    '. Amount: Rs. ' + Number(invoice.subtotal).toFixed(2) + ', discount: Rs. ' + Number(invoice.discount_amount || 0).toFixed(2) +
    ', delivery: Rs. ' + Number(invoice.delivery_charge).toFixed(2) + '. Total: Rs. ' + Number(invoice.grand_total).toFixed(2) + '. Thank you.'
  )

  return (
    <div className="admin-page invoice-page">
      <div className="page-header no-print">
        <div><Link className="back-link" to="/admin/orders">← Orders</Link><h1>{invoice.invoice_number}</h1><p>Order {order.order_number}</p></div>
        <div className="button-group">
          <button className="secondary-btn" onClick={() => previewInvoicePdf(data)}>Preview PDF</button>
          <button className="secondary-btn" onClick={() => downloadInvoicePdf(data)}>Download PDF</button>
          <button className="secondary-btn" onClick={sharePdf}>Share invoice PDF</button><a className="secondary-btn" target="_blank" rel="noreferrer" href={whatsapp}>WhatsApp bill message</a><button className="primary-btn" onClick={() => window.print()}>Print Invoice</button>
        </div>
      </div>
      {error && <div className="alert error no-print">{error}</div>}

      <InvoiceSheet {...data} />
    </div>
  )
}
