import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import Loader from '../components/Loader.jsx'

export default function SettingsPage() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data, error: queryError } = await supabase.from('business_settings').select('*').eq('id', 1).single()
      if (queryError) setError(queryError.message)
      else setSettings(data)
      setLoading(false)
    }
    load()
  }, [])

  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }))

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    const { error: updateError } = await supabase.from('business_settings').update({
      business_name: settings.business_name,
      phone: settings.phone,
      email: settings.email,
      address: settings.address,
      delivery_charge: Math.max(0, Number(settings.delivery_charge) || 0),
    }).eq('id', 1)
    setSaving(false)
    if (updateError) setError(updateError.message)
    else setMessage('Business settings saved.')
  }

  if (loading) return <Loader label="Loading settings..." />

  return (
    <div className="admin-page">
      <div className="page-header"><div><h1>Settings</h1><p>Basic business details used on the customer page and invoices.</p></div></div>
      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}
      <form className="admin-card settings-form" onSubmit={save}>
        <label className="field"><span>Business Name</span><input value={settings?.business_name || ''} onChange={(e) => update('business_name', e.target.value)} /></label>
        <div className="form-grid"><label className="field"><span>Phone</span><input value={settings?.phone || ''} onChange={(e) => update('phone', e.target.value)} /></label><label className="field"><span>Email</span><input type="email" value={settings?.email || ''} onChange={(e) => update('email', e.target.value)} /></label></div>
        <label className="field"><span>Address</span><textarea rows="3" value={settings?.address || ''} onChange={(e) => update('address', e.target.value)} /></label>
        <label className="field"><span>Default Delivery Charge (₹)</span><input type="number" min="0" step="0.01" value={settings?.delivery_charge ?? 0} onChange={(e) => update('delivery_charge', e.target.value)} /></label>
        <button className="primary-btn" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
      </form>
    </div>
  )
}
