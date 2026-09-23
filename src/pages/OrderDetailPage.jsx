import RecordEditor from '../components/RecordEditor.jsx'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { currency, dateTime } from '../lib/format.js'
import PaymentPanel from '../components/PaymentPanel.jsx'
import Loader from '../components/Loader.jsx'
import StatusBadge from '../components/StatusBadge.jsx'

const nextStatusMap = {
  New: ['Confirmed', 'Cancelled'],
  Confirmed: ['Packed', 'Cancelled'],
  Packed: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered', 'Cancelled'],
  Delivered: [],
  Cancelled: [],
}

export default function OrderDetailPage() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [status, setStatus] = useState('New')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [invoiceBusy, setInvoiceBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    const { data, error: queryError } = await supabase
      .from('orders')
      .select('*, order_items(*), invoices(id, invoice_number)')
      .eq('id', orderId)
      .single()

    if (queryError) setError(queryError.message)
    else {
      setOrder(data)
      setStatus(data.status)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [orderId])

  const allowedStatuses = useMemo(() => {
    if (!order) return []
    return [order.status, ...(nextStatusMap[order.status] || [])]
  }, [order])

  const saveStatus = async () => {
    if (!order || status === order.status) return
    if (!(nextStatusMap[order.status] || []).includes(status)) {
      setError('That status change is not allowed. Move the order through the normal flow.')
      setStatus(order.status)
      return
    }

    setSaving(true)
    setError('')
    setMessage('')
    const { error: updateError } = await supabase.from('orders').update({ status }).eq('id', orderId)
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      setStatus(order.status)
      return
    }
    setMessage(status === 'Cancelled' ? 'Order cancelled and reserved stock restored.' : `Order moved to ${status}.`)
    await load()
  }

  const generateInvoice = async () => {
    const existing = Array.isArray(order.invoices) ? order.invoices[0] : order.invoices
    if (existing) {
      navigate(`/admin/invoices/${existing.id}`)
      return
    }
    if (order.status === 'Cancelled') {
      setError('Cancelled orders cannot generate an invoice.')
      return
    }

    setInvoiceBusy(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('create_invoice', { p_order_id: orderId })
    setInvoiceBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    navigate(`/admin/invoices/${data.id}`)
  }

  if (loading) return <Loader label="Loading order details..." />
  if (!order) return <div className="admin-page"><div className="alert error">Order not found.</div></div>

  const terminalStatus = order.status === 'Delivered' || order.status === 'Cancelled'
  const existingInvoice = Array.isArray(order.invoices) ? order.invoices[0] : order.invoices
  const canInvoice = Boolean(existingInvoice) || order.status !== 'Cancelled'

  return (
    <div className="admin-page">
      <div className="page-header">
        <div><Link className="back-link" to="/admin/orders">← Orders</Link><h1>{order.order_number}</h1><p>Placed {dateTime(order.created_at)}</p></div>
        <div className="report-actions"><RecordEditor kind="order" record={order} onSaved={load}/><Link className="secondary-btn" to={'/admin/new-sale?repeat='+order.id}>Repeat order</Link><StatusBadge status={order.status} /></div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <div className="detail-grid">
        <section className="admin-card">
          <h2>Customer details</h2>
          <div className="detail-list">
            <div><span>Name</span><strong>{order.customer_name}</strong></div>
            <div><span>Mobile</span><strong>{order.mobile}</strong></div>
            <div><span>WhatsApp</span><strong>{order.whatsapp}</strong></div>
            <div><span>Address</span><strong>{[order.address, order.city, order.state, order.pin_code].filter(Boolean).join(', ')}</strong></div>
          </div>
        </section>

        <section className="admin-card">
          <h2>Order status</h2>
          {terminalStatus ? (
            <div className="status-lock"><StatusBadge status={order.status} /><p className="muted-text">This order is closed and cannot be moved to another status.</p></div>
          ) : (
            <>
              <label className="field"><span>Next status</span><select value={status} onChange={(e) => setStatus(e.target.value)}>{allowedStatuses.map((s) => <option key={s}>{s}</option>)}</select></label>
              <button className="primary-btn" onClick={saveStatus} disabled={saving || status === order.status}>{saving ? 'Saving...' : 'Update status'}</button>
            </>
          )}
          <p className="muted-text">Stock is reserved as soon as the customer places an order. Cancelling an order returns that stock automatically.</p>
        </section>
      </div>

      <section className="admin-card">
        <div className="card-title-row"><div><h2>Items</h2><p>Rates are preserved from the time the order was placed.</p></div></div>
        <div className="table-wrap">
          <table><thead><tr><th>Product</th><th>Size</th><th>Quantity</th><th>Rate</th><th>Amount</th></tr></thead>
            <tbody>{(order.order_items || []).map((item) => <tr key={item.id}><td>{item.product_name}</td><td>{item.size_label}</td><td>{item.quantity}</td><td>{currency(item.rate)}</td><td>{currency(item.amount)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="totals-box">
          <div><span>Subtotal</span><strong>{currency(order.subtotal)}</strong></div>
          {Number(order.discount_amount)>0 && <div><span>Discount{order.coupon_code ? " ("+order.coupon_code+")" : ""}</span><strong>−{currency(order.discount_amount)}</strong></div>}
          <div><span>Delivery Charge</span><strong>{currency(order.delivery_charge)}</strong></div>
          <div className="grand"><span>Grand Total</span><strong>{currency(order.grand_total)}</strong></div>
        </div>
      </section>

      <PaymentPanel order={order} />
      <section className="admin-card invoice-action-card">
        <div><h2>Invoice</h2><p>{existingInvoice ? `Invoice ${existingInvoice.invoice_number} is saved for this order, including after cancellation.` : canInvoice ? 'Generate an invoice for this older order.' : 'This cancelled order has no invoice.'}</p></div>
        <button className="primary-btn" onClick={generateInvoice} disabled={invoiceBusy || !canInvoice}>{invoiceBusy ? 'Generating...' : 'GENERATE / OPEN INVOICE'}</button>
      </section>
    </div>
  )
}

