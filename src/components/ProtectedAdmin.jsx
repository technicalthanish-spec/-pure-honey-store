import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import Loader from './Loader.jsx'

export default function ProtectedAdmin() {
  const [state, setState] = useState({ loading: true, allowed: false })
  const location = useLocation()

  useEffect(() => {
    let active = true

    const verify = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        if (active) setState({ loading: false, allowed: false })
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if (active) setState({ loading: false, allowed: !error && data?.role === 'admin' })
    }

    verify()
    const { data: listener } = supabase.auth.onAuthStateChange(() => { setTimeout(verify, 0) })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (state.loading) return <Loader label="Checking admin access..." />
  if (!state.allowed) return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  return <Outlet />
}
