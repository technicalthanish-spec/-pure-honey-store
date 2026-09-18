import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { currency, shortDate } from '../lib/format.js'
import Loader from '../components/Loader.jsx'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data, error: queryError } = await supabase
        .from('invoices')
        .select('id, invoice_number, issued_at, grand_total, orders(order_number, customer_name)')
        .order('created_at', { ascending: false })
      if (queryError) setError(queryError.message)
      else setInvoices(data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <Loader label="Loading invoices..." />

  return (
    <div className="admin-page">
      <div className="page-header"><div><h1>Invoices</h1><p>Generated invoices for customer orders.</p></div></div>
      {error && <div className="alert error">{error}</div>}
      <section className="admin-card"><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th></th></tr></thead><tbody>
        {invoices.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.invoice_number}</strong></td><td>{invoice.orders?.order_number || '-'}</td><td>{invoice.orders?.customer_name || '-'}</td><td>{shortDate(invoice.issued_at)}</td><td>{currency(invoice.grand_total)}</td><td><Link className="table-action" to={`/admin/invoices/${invoice.id}`}>Open</Link></td></tr>)}
        {!invoices.length && <tr><td colSpan="6" className="empty-cell">No invoices generated yet.</td></tr>}
      </tbody></table></div></section>
    </div>
  )
}
