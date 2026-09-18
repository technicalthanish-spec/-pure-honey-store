import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { currency } from '../lib/format.js'
import { useNavigate } from 'react-router-dom'
import Loader from '../components/Loader.jsx'

const emptyForm = {
  fullName: '',
  mobile: '',
  whatsapp: '',
  sameWhatsapp: true,
  address: '',
  city: '',
  state: '',
  pinCode: '',
}

export default function CustomerOrderPage() {
  const [products, setProducts] = useState([])
  const [settings, setSettings] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const [coupon, setCoupon] = useState('')
  const [quote, setQuote] = useState(null)
  const [couponError, setCouponError] = useState('')
  const [couponBusy, setCouponBusy] = useState(false)
  useEffect(() => { setQuote(null); setCouponError('') }, [selectedId, quantity, form.mobile, coupon])
  const applyCoupon = async () => {
    setCouponBusy(true); setCouponError(''); setQuote(null)
    try {
      const { data, error } = await supabase.rpc('quote_order', { p_product_id: selectedId, p_quantity: quantity, p_mobile: form.mobile.trim(), p_coupon_code: coupon.trim() })
      if (error) throw error
      setQuote({ ...data, context: JSON.stringify([selectedId, quantity, form.mobile, coupon]) })
    } catch (e) { setCouponError(e.message) } finally { setCouponBusy(false) }
  }

  const loadStore = useCallback(async ({ keepSelection = true } = {}) => {
    const [{ data: productData, error: productError }, { data: settingsData, error: settingsError }] = await Promise.all([
      supabase.from('products').select('*').order('sort_order'),
      supabase.from('business_settings').select('*').eq('id', 1).maybeSingle(),
    ])

    if (productError) throw productError
    if (settingsError) throw settingsError

    const list = productData || []
    setProducts(list)
    setSettings(settingsData)
    setSelectedId((current) => {
      const currentProduct = keepSelection ? list.find((item) => item.id === current) : null
      if (currentProduct?.active && currentProduct.available_quantity > 0) return currentProduct.id
      return list.find((item) => item.active && item.available_quantity > 0)?.id || list[0]?.id || ''
    })
    return list
  }, [])

  useEffect(() => {
    let active = true
    loadStore({ keepSelection: false })
      .catch((loadError) => active && setError(loadError.message))
      .finally(() => active && setLoading(false))

    return () => { active = false }
  }, [loadStore])

  const selected = products.find((item) => item.id === selectedId)
  const maxQuantity = Math.max(0, Number(selected?.available_quantity || 0))
  const subtotal = Number(selected?.price || 0) * quantity
  const delivery = Number(settings?.delivery_charge || 0)
  const appliedQuote = quote?.context === JSON.stringify([selectedId, quantity, form.mobile, coupon]) ? quote : null
  const discount = Number(appliedQuote?.discount_amount || 0)
  const total = appliedQuote ? Number(appliedQuote.grand_total) : subtotal + delivery
  const unavailable = !selected || !selected.active || maxQuantity <= 0

  const canSubmit = useMemo(() => {
    const phone = /^\d{10}$/.test(form.mobile.trim())
    const whatsapp = /^\d{10}$/.test((form.sameWhatsapp ? form.mobile : form.whatsapp).trim())
    const pin = /^\d{6}$/.test(form.pinCode.trim())
    return Boolean(
      form.fullName.trim() &&
      phone &&
      whatsapp &&
      form.address.trim() &&
      form.city.trim() &&
      form.state.trim() &&
      pin &&
      !unavailable &&
      Number.isInteger(quantity) &&
      quantity >= 1 &&
      quantity <= maxQuantity
    )
  }, [form, unavailable, quantity, maxQuantity])

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const placeOrder = async (event) => {
    event.preventDefault()
    if (submitting) return
    setError('')

    if (coupon.trim() && !appliedQuote) { setError('Apply your coupon or remove it before placing the order.'); return }
    if (!canSubmit) {
      setError('Please check your details and make sure the requested quantity is available.')
      return
    }

    setSubmitting(true)
    const { data, error: rpcError } = await supabase.rpc('place_order', {
      p_product_id: selected.id,
      p_quantity: quantity,
      p_customer_name: form.fullName.trim(),
      p_mobile: form.mobile.trim(),
      p_whatsapp: (form.sameWhatsapp ? form.mobile : form.whatsapp).trim(),
      p_address: form.address.trim(),
      p_city: form.city.trim(),
      p_state: form.state.trim(),
      p_pin_code: form.pinCode.trim(),
      p_coupon_code: appliedQuote?.coupon_code || null,
    })

    if (rpcError) {
      setSubmitting(false)
      setError(rpcError.message)
      await loadStore().catch(() => {})
      return
    }

    // The receipt travels in browser history state, never in a public invoice URL.
    navigate('/order/success', { replace: true, state: { receipt: data } })

  }

  if (loading) return <Loader label="Loading honey options..." />

  return (
    <div className="customer-page storefront">
      <header className="customer-header">
        <div className="brand-lockup">
          <div className="brand-mark large">H</div>
          <div>
            <strong>{settings?.business_name || 'Pure Honey'}</strong>
            <span>Simple • Pure • Direct</span>
          </div>
        </div>
        <a href="/admin/login" className="admin-link">Admin</a>
      </header>

      <main className="order-container">
        <section className="hero-card">
          <div className="eyebrow">PURE HONEY</div>
          <h1>A little sweetness.<br />Delivered to your door.</h1>
          <p>Pick your jar, add your delivery details, and we’ll take it from there.</p>
          <div className="store-promises"><span>01 · Choose your jar</span><span>02 · Add your details</span><span>03 · Get your invoice</span></div>
        </section>

        {error && <div className="alert error">{error}</div>}

        <div className="order-grid">
          <section className="panel">
            <div className="section-heading">
              <span>1</span>
              <div><h2>Select size</h2><p>Choose one honey bottle size.</p></div>
            </div>
            <div className="product-options">
              {products.map((product) => {
                const stock = Number(product.available_quantity || 0)
                const out = !product.active || stock <= 0
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={out}
                    aria-pressed={selectedId === product.id}
                    className={`product-card ${selectedId === product.id ? 'selected' : ''} ${out ? 'out' : ''}`}
                    onClick={() => {
                      setSelectedId(product.id)
                      setQuantity(1)
                    }}
                  >
                    <div className="jar-art" aria-hidden="true"><span>H</span></div>
                    <div>
                      <strong>{product.size_label}</strong>
                      <span>Pure Honey</span>
                    </div>
                    <div className="product-price">{currency(product.price)}</div>
                    <div className={`availability ${out ? 'no' : 'yes'}`}>
                      {out ? 'Out of Stock' : `${stock} available`}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="quantity-row">
              <div><strong>Quantity</strong><span>{unavailable ? 'This size is unavailable' : `Maximum ${maxQuantity} bottle${maxQuantity === 1 ? '' : 's'}`}</span></div>
              <div className="qty-control">
                <button type="button" aria-label="Decrease quantity" disabled={unavailable || quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
                <input
                  aria-label="Number of jars"
                  value={quantity}
                  onChange={(e) => {
                    const raw = Number(e.target.value) || 1
                    setQuantity(Math.min(Math.max(1, raw), Math.max(1, maxQuantity)))
                  }}
                  type="number"
                  min="1"
                  max={Math.max(1, maxQuantity)}
                  disabled={unavailable}
                />
                <button type="button" aria-label="Increase quantity" disabled={unavailable || quantity >= maxQuantity} onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}>+</button>
              </div>
            </div>
          </section>

          <aside className="summary-card">
            <h2>Order summary</h2>
            <div className="summary-line"><span>Product</span><strong>Pure Honey</strong></div>
            <div className="summary-line"><span>Size</span><strong>{selected?.size_label || '-'}</strong></div>
            <div className="summary-line"><span>Quantity</span><strong>{quantity}</strong></div>
            <div className="summary-line"><span>Subtotal</span><strong>{currency(subtotal)}</strong></div>
            <div className="summary-line"><span>Delivery</span><strong>{delivery ? currency(delivery) : 'Free'}</strong></div>
            <div className="coupon-entry">
              <label className="field"><span>Coupon code</span><input maxLength={24} value={coupon} onChange={e=>setCoupon(e.target.value.toUpperCase())} placeholder="Have a coupon?" /></label>
              <button type="button" className="secondary-btn" disabled={!coupon.trim() || couponBusy || submitting} onClick={applyCoupon}>{couponBusy?'Checking…':'Apply'}</button>
            </div>
            {couponError && <p role="alert" className="alert error">{couponError}</p>}
            {appliedQuote && <p className="alert success">Coupon applied. You save {currency(discount)}.</p>}
            {discount > 0 && <div className="summary-line"><span>Discount</span><strong>−{currency(discount)}</strong></div>}
            <div className="summary-total"><span>Total</span><strong>{currency(total)}</strong></div>
            <p className="summary-note">Payment can be collected separately. No online payment is processed here.</p>
          </aside>
        </div>

        <form className="panel customer-form" onSubmit={placeOrder}>
          <div className="section-heading">
            <span>2</span>
            <div><h2>Delivery details</h2><p>Tell us where the order should go.</p></div>
          </div>

          <div className="form-grid">
            <label className="field full"><span>Full Name *</span><input autoComplete="name" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} required /></label>
            <label className="field"><span>Mobile Number *</span><input autoComplete="tel-national" inputMode="tel" maxLength="10" value={form.mobile} onChange={(e) => update('mobile', e.target.value.replace(/\D/g, ''))} required /></label>
            <label className="field"><span>WhatsApp Number *</span><input inputMode="numeric" maxLength="10" value={form.sameWhatsapp ? form.mobile : form.whatsapp} onChange={(e) => update('whatsapp', e.target.value.replace(/\D/g, ''))} disabled={form.sameWhatsapp} required /></label>
            <label className="check-row full"><input type="checkbox" checked={form.sameWhatsapp} onChange={(e) => update('sameWhatsapp', e.target.checked)} /><span>WhatsApp number is same as mobile number</span></label>
            <label className="field full"><span>Address *</span><textarea autoComplete="street-address" rows="3" value={form.address} onChange={(e) => update('address', e.target.value)} required /></label>
            <label className="field"><span>City *</span><input autoComplete="address-level2" value={form.city} onChange={(e) => update('city', e.target.value)} required /></label>
            <label className="field"><span>State *</span><input autoComplete="address-level1" value={form.state} onChange={(e) => update('state', e.target.value)} required /></label>
            <label className="field"><span>PIN Code *</span><input autoComplete="postal-code" inputMode="numeric" maxLength="6" value={form.pinCode} onChange={(e) => update('pinCode', e.target.value.replace(/\D/g, ''))} required /></label>
          </div>

          <button className="primary-btn place-order" type="submit" disabled={submitting || !canSubmit}>
            {submitting ? 'Placing your order…' : `Place order · ${currency(total)}`}
          </button>
          <p className="checkout-note">No payment taken now. Your invoice is ready immediately after ordering.</p>
        </form>
      </main>

      <footer className="customer-footer">{settings?.business_name || 'Pure Honey'} • A little sweetness, simply ordered</footer>
    </div>
  )
}
