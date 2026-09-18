import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { currency, shortDate } from '../lib/format.js'
import Loader from '../components/Loader.jsx'
import StatusBadge from '../components/StatusBadge.jsx'

const statuses = ['All', 'New', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled']

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, mobile, status, subtotal, delivery_charge, grand_total, created_at, order_items(size_label, quantity, product_name)')
      .order('created_at', { ascending: false })
    if (queryError) setError(queryError.message)
    else setOrders(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase.channel('orders-list').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return orders.filter((order) => {
      const statusMatch = filter === 'All' || order.status === filter
      const searchMatch = !q || order.order_number.toLowerCase().includes(q) || order.customer_name.toLowerCase().includes(q) || order.mobile.includes(q)
      return statusMatch && searchMatch
    })
  }, [orders, filter, search])

  if (loading) return <Loader label="Loading orders..." />

  return (
    <div className="admin-page">
      <div className="page-header"><div><h1>Orders</h1><p>Manage every customer order from one place.</p></div></div>
      {error && <div className="alert error">{error}</div>}
      <section className="admin-card">
        <div className="toolbar">
          <input className="search-input" placeholder="Search order, customer or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Order ID</th><th>Customer</th><th>Phone</th><th>Order Date</th><th>Products / Size</th><th>Quantity</th><th>Total Amount</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map((order) => {
                const items = order.order_items || []
                return (
                  <tr key={order.id}>
                    <td><Link to={`/admin/orders/${order.id}`}>{order.order_number}</Link></td>
                    <td>{order.customer_name}</td><td>{order.mobile}</td><td>{shortDate(order.created_at)}</td>
                    <td>{items.map((i) => `${i.product_name} ${i.size_label}`).join(', ') || '-'}</td>
                    <td>{items.reduce((sum, i) => sum + Number(i.quantity), 0)}</td>
                    <td>{currency(order.grand_total)}</td><td><StatusBadge status={order.status} /></td>
                  </tr>
                )
              })}
              {!filtered.length && <tr><td colSpan="8" className="empty-cell">No matching orders.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
