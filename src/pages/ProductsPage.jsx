import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { currency } from '../lib/format.js'
import Loader from '../components/Loader.jsx'

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    const { data, error: queryError } = await supabase.from('products').select('*').order('sort_order')
    if (queryError) setError(queryError.message)
    else setProducts(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const patchLocal = (id, key, value) => setProducts((list) => list.map((p) => p.id === id ? { ...p, [key]: value } : p))

  const save = async (product) => {
    setSaving(product.id)
    setError('')
    setMessage('')
    if (!Number.isFinite(Number(product.price)) || Number(product.price)<=0 || !Number.isFinite(Number(product.cost_price)) || Number(product.cost_price)<0 || !Number.isInteger(Number(product.available_quantity)) || Number(product.available_quantity)<0) { setError('Enter a positive selling price, non-negative cost price, and whole stock quantity.'); setSaving(''); return }
    const payload = {
      price: Math.max(0, Number(product.price) || 0),
      cost_price: Math.max(0, Number(product.cost_price) || 0),
      available_quantity: Math.max(0, Number(product.available_quantity) || 0),
      active: Boolean(product.active),
    }
    const { error: updateError } = await supabase.from('products').update(payload).eq('id', product.id)
    setSaving('')
    if (updateError) setError(updateError.message)
    else {
      setMessage(`${product.size_label} updated.`)
      load()
    }
  }

  if (loading) return <Loader label="Loading products..." />

  return (
    <div className="admin-page">
      <div className="page-header"><div><h1>Products & Stock</h1><p>Set selling price, your cost and available stock for each honey size.</p></div></div>
      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}
      <div className="product-admin-grid">
        {products.map((product) => (
          <section className="admin-card product-admin-card" key={product.id}>
            <div className="card-title-row"><div><span className="eyebrow">PURE HONEY</span><h2>{product.size_label}</h2></div><span className={product.active && product.available_quantity > 0 ? 'availability yes' : 'availability no'}>{product.active && product.available_quantity > 0 ? 'Available' : 'Out of Stock'}</span></div>
            <label className="field"><span>Price (₹)</span><input type="number" min="0.01" step="0.01" value={product.price} onChange={(e) => patchLocal(product.id, 'price', e.target.value)} /></label>
            <label className="field"><span>Your cost per jar (₹)</span><input type="number" min="0" step="0.01" value={product.cost_price ?? 0} onChange={(e) => patchLocal(product.id, 'cost_price', e.target.value)} /></label>
            <label className="field"><span>Available quantity</span><input type="number" min="0" step="1" value={product.available_quantity} onChange={(e) => patchLocal(product.id, 'available_quantity', e.target.value)} /></label>
            <label className="toggle-row"><input type="checkbox" checked={product.active} onChange={(e) => patchLocal(product.id, 'active', e.target.checked)} /><span>Active for ordering</span></label>
            <div className="product-card-footer"><span>Margin: {currency(Number(product.price)-Number(product.cost_price||0))} / jar</span><button className="primary-btn small" onClick={() => save(product)} disabled={saving === product.id}>{saving === product.id ? 'Saving...' : 'Save'}</button></div>
          </section>
        ))}
      </div>
    </div>
  )
}
