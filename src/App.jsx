import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedAdmin from './components/ProtectedAdmin.jsx'
import AdminLayout from './components/AdminLayout.jsx'
import OrdersPage from './pages/OrdersPage.jsx'
import OrderDetailPage from './pages/OrderDetailPage.jsx'
import ProductsPage from './pages/ProductsPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
const NewSalePage=lazy(()=>import('./pages/NewSalePage.jsx'))
const CustomersPage=lazy(()=>import('./pages/CustomersPage.jsx'))
const RecordsPage=lazy(()=>import('./pages/RecordsPage.jsx'))
const SalesReportPage=lazy(()=>import('./pages/SalesReportPage.jsx'))
const InvoiceDetailPage=lazy(()=>import('./pages/InvoiceDetailPage.jsx'))
import CouponsPage from './pages/CouponsPage.jsx'
import { AuthProvider, Login, CustomerLayout, Shop, MyOrders } from './pages/Store.jsx'
export default function App(){return <AuthProvider><Routes>
<Route path="/login" element={<Login/>}/><Route path="/admin/login" element={<Navigate to="/login" replace/>}/>
<Route element={<CustomerLayout/>}><Route index element={<Navigate to="/shop" replace/>}/><Route path="/shop" element={<Shop/>}/><Route path="/orders" element={<MyOrders/>}/></Route>
<Route element={<ProtectedAdmin/>}><Route path="/admin" element={<AdminLayout/>}><Route index element={<DashboardPage/>}/><Route path="new-sale" element={<Suspense fallback={<p>Loading…</p>}><NewSalePage/></Suspense>}/><Route path="customers" element={<Suspense fallback={<p>Loading…</p>}><CustomersPage/></Suspense>}/><Route path="expenses" element={<Suspense fallback={<p>Loading…</p>}><RecordsPage kind="expense"/></Suspense>}/><Route path="purchases" element={<Suspense fallback={<p>Loading…</p>}><RecordsPage kind="purchase"/></Suspense>}/><Route path="backup" element={<Suspense fallback={<p>Loading…</p>}><RecordsPage kind="backup"/></Suspense>}/><Route path="sales-report" element={<Suspense fallback={<p>Loading sales report…</p>}><SalesReportPage/></Suspense>}/><Route path="orders" element={<OrdersPage/>}/><Route path="orders/:orderId" element={<OrderDetailPage/>}/><Route path="products" element={<ProductsPage/>}/><Route path="coupons" element={<CouponsPage/>}/><Route path="invoices/:invoiceId" element={<Suspense fallback={<p>Loading invoice…</p>}><InvoiceDetailPage/></Suspense>}/></Route></Route>
<Route path="*" element={<Navigate to="/" replace/>}/></Routes></AuthProvider>}
