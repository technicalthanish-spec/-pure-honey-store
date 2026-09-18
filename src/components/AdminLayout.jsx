import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

const links = [
  ['Dashboard', '/admin'],
  ['Orders', '/admin/orders'],
  ['Coupons', '/admin/coupons'],
  ['Products / Stock', '/admin/products'],
]

export default function AdminLayout() {
  const navigate = useNavigate()

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">H</div>
          <div>
            <strong>Honey Admin</strong>
            <span>Order management</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {links.map(([label, href]) => (
            <NavLink key={href} to={href} end={href === '/admin'} className={({ isActive }) => (isActive ? 'active' : '')}>
              {label}
            </NavLink>
          ))}
        </nav>

        <button className="sidebar-logout" onClick={logout}>Logout</button>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
