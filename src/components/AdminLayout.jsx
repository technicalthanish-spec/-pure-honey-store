import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
const groups = [
 ['Daily work', [['Overview','/admin','01'],['Orders & payments','/admin/orders','02'],['Customers / Khata','/admin/customers','03']]],
 ['Inventory', [['Products & stock','/admin/products','04'],['Stock purchases','/admin/purchases','05'],['Free honey','/admin/giveaways','06']]],
 ['Accounts', [['Sales statement','/admin/sales-report','07'],['Expenses','/admin/expenses','08'],['Financial summary','/admin/finances','09']]],
 ['Manage', [['Coupons','/admin/coupons','10'],['Backup','/admin/backup','11']]],
]
export default function AdminLayout(){
 const [open,setOpen]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const location=useLocation(),navigate=useNavigate()
 useEffect(()=>{setOpen(false)},[location.pathname])
 useEffect(()=>{const close=e=>{if(e.key==='Escape')setOpen(false)};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[])
 const title=groups.flatMap(g=>g[1]).find(x=>x[1]===location.pathname)?.[0] || (location.pathname.includes('new-sale')?'New sale':location.pathname.includes('invoices')?'Invoice':'Order details')
 async function logout(){setBusy(true);setError('');try{const {error}=await supabase.auth.signOut();if(error)throw error;navigate('/login',{replace:true})}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <div className="admin-shell workspace-shell">
  <a className="skip-link" href="#admin-content">Skip to content</a>
  <aside className={'sidebar workspace-nav '+(open?'is-open':'')} id="admin-navigation">
   <Link className="workspace-brand" to="/admin"><span className="brand-mark">H</span><span><strong>Honey Business</strong><small>Your daily workspace</small></span></Link>
   <Link className="nav-new-sale" to="/admin/new-sale">＋ New sale</Link>
   <nav aria-label="Admin navigation" className="workspace-nav-groups">{groups.map(([group,links])=><div className="nav-group" key={group}><h2>{group}</h2>{links.map(([label,path,icon])=><NavLink key={path} to={path} end={path==='/admin'} className={({isActive})=>isActive?'active':''}><span aria-hidden="true">{icon}</span>{label}</NavLink>)}</div>)}</nav>
   <div className="workspace-nav-footer"><Link to="/shop">Open customer shop ↗</Link><button onClick={logout} disabled={busy}>{busy?'Signing out…':'Sign out'}</button>{error&&<p role="alert">{error}</p>}</div>
  </aside>
  <div className="workspace-body"><header className="workspace-topbar"><button className="menu-toggle" aria-expanded={open} aria-controls="admin-navigation" onClick={()=>setOpen(!open)}>{open?'✕ Close':'☰ Menu'}</button><div><span>Workspace</span><strong>{title}</strong></div><Link className="primary-btn" to="/admin/new-sale">＋ New sale</Link></header>
   <main className="admin-main" id="admin-content"><Outlet/></main>
  </div>
 </div>
}
