import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setLoading(false)
      setError(signInError.message)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    setLoading(false)
    if (profileError || profile?.role !== 'admin') {
      await supabase.auth.signOut()
      setError('This account does not have admin access.')
      return
    }

    navigate('/admin', { replace: true })
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <a href="/" className="back-link">← Customer order page</a>
        <div className="brand-mark large">H</div>
        <h1>Admin Login</h1>
        <p>Sign in to manage orders, products and invoices.</p>
        {error && <div className="alert error">{error}</div>}
        <label className="field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field"><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button className="primary-btn" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Login'}</button>
      </form>
    </div>
  )
}
