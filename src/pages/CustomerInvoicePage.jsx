import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import InvoiceSheet from '../components/InvoiceSheet.jsx'
import { downloadInvoicePdf, previewInvoicePdf } from '../lib/invoicePdf.js'
import { currency } from '../lib/format.js'

export default function CustomerInvoicePage() {
  const { state } = useLocation()
  const data = state?.receipt
  const [error, setError] = useState('')
  useEffect(() => { window.scrollTo(0, 0); document.title = 'Your invoice · Pure Honey' }, [])
  const act = (action) => {
    setError('')
    try { action(data) } catch { setError('Could not open the PDF. Please try Download PDF or Print instead.') }
  }

  if (!data?.order_number) return (
    <main className="receipt-empty">
      <div className="brand-mark large">H</div>
      <h1>Your invoice stays with your order.</h1>
      <p>Open this screen after placing an order. If you already ordered, contact the store for a copy—there’s no need to order again.</p>
      <Link className="primary-btn" to="/">Back to store</Link>
    </main>
  )

  return (
    <div className="receipt-page">
      <header className="receipt-header no-print">
        <Link className="brand-lockup" to="/"><span className="brand-mark">H</span><strong>{data.settings?.business_name || 'Pure Honey'}</strong></Link>
        <Link className="back-link" to="/">Back to store ↗</Link>
      </header>
      <main className="receipt-main">
        <section className="receipt-confirmation no-print" aria-labelledby="receipt-heading">
          <span className="receipt-check" aria-hidden="true">✓</span>
          <div className="eyebrow">ORDER RECEIVED</div>
          <h1 id="receipt-heading">Thank you. You’re all set.</h1>
          <p>Your order <strong>{data.order_number}</strong> has been placed.</p>
          <div className="receipt-summary"><span>Total <strong>{currency(data.grand_total)}</strong></span><span>Payment <strong>Collected separately</strong></span></div>
        </section>
        {data.invoice && data.order ? <>
          <div className="receipt-toolbar no-print">
            <div><h2>Your invoice</h2><p>{data.invoice.invoice_number} · Save a copy for your records</p></div>
            <div className="receipt-actions">
              <button className="primary-btn" onClick={() => act(downloadInvoicePdf)}>Download PDF ↓</button>
              <button className="secondary-btn" onClick={() => act(previewInvoicePdf)}>Preview PDF ↗</button>
              <button className="secondary-btn" onClick={() => window.print()}>Print</button>
            </div>
          </div>
          {error && <p role="alert" className="alert error no-print">{error}</p>}
          <div className="receipt-document"><InvoiceSheet {...data} /></div>
        </> : <p role="status">Your order is saved. Contact the store for your invoice; please don’t place the order again.</p>}
        <footer className="receipt-bottom no-print"><p>Keep your invoice handy for any questions about your order.</p><Link to="/" className="secondary-btn">Place another order</Link></footer>
      </main>
    </div>
  )
}
