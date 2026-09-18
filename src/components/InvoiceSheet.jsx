import { currency, shortDate } from '../lib/format.js'
export default function InvoiceSheet({ invoice, order, settings }) {
  const businessLines = [settings?.address, settings?.phone, settings?.email].filter(Boolean)
  return (
      <article className="invoice-sheet">
        {order.status === 'Cancelled' && <p role="status"><strong>CANCELLED — retained for records</strong></p>}
        <header className="invoice-topbar">
          <div className="invoice-business">
            <div className="invoice-logo">H</div>
            <div>
              <h2>{settings?.business_name || 'Pure Honey'}</h2>
              <div className="invoice-business-lines">
                {businessLines.map((line) => <p key={line}>{line}</p>)}
              </div>
            </div>
          </div>
          <div className="invoice-title-block">
            <div className="invoice-title">INVOICE</div>
            <div className="invoice-number">{invoice.invoice_number}</div>
          </div>
        </header>

        <section className="invoice-info-grid">
          <div className="invoice-party-card">
            <span className="invoice-kicker">BILL TO</span>
            <strong>{order.customer_name}</strong>
            <p>{order.mobile}</p>
            <p>{order.address}</p>
            <p>{order.city}, {order.state} - {order.pin_code}</p>
          </div>
          <div className="invoice-meta-card">
            <div><span>Invoice Date</span><strong>{shortDate(invoice.issued_at || invoice.created_at)}</strong></div>
            <div><span>Order Number</span><strong>{order.order_number}</strong></div>
            <div><span>Order Date</span><strong>{shortDate(order.created_at)}</strong></div>
            <div><span>Payment</span><strong>Offline</strong></div>
          </div>
        </section>

        <table className="invoice-table">
          <thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
          <tbody>
            {(order.order_items || []).map((item, index) => (
              <tr key={item.id}>
                <td>{index + 1}</td>
                <td><strong>{item.product_name}</strong><span>{item.size_label}</span></td>
                <td>{item.quantity}</td>
                <td>{currency(item.rate)}</td>
                <td>{currency(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="invoice-bottom-grid">
          <div className="invoice-note-box">
            <span className="invoice-kicker">NOTE</span>
            <p>Thank you for your order. This is a computer-generated invoice for the order recorded in the Honey Order system.</p>
          </div>
          <div className="invoice-summary">
            <div><span>Subtotal</span><strong>{currency(invoice.subtotal)}</strong></div>
            {Number(invoice.discount_amount)>0 && <div><span>Discount ({invoice.coupon_code})</span><strong>−{currency(invoice.discount_amount)}</strong></div>}
            <div><span>Delivery Charge</span><strong>{currency(invoice.delivery_charge)}</strong></div>
            <div className="invoice-grand"><span>Grand Total</span><strong>{currency(invoice.grand_total)}</strong></div>
          </div>
        </section>

        <footer className="invoice-footer">
          <span>Computer-generated invoice • No signature required</span>
          <strong>{settings?.business_name || 'Pure Honey'}</strong>
        </footer>
      </article>
  )
}
