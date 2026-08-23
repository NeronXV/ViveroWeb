import { createBrowserRouter } from 'react-router-dom'
import { App } from './App'
import { PublicLayout } from '../components/layout/PublicLayout'
import { AdminPage } from '../features/admin/AdminPage'
import { LoginPage } from '../features/auth/LoginPage'
import { CashierPage } from '../features/cashier/CashierPage'
import { CatalogPage } from '../features/public-catalog/CatalogPage'
import { HomePage } from '../features/public-catalog/HomePage'

function NotFound() { return <main className="internal-page"><section className="login-card"><h1>Página no encontrada</h1><a className="back-link" href="/">Volver al inicio</a></section></main> }

export const router = createBrowserRouter([{ element: <App />, children: [{ element: <PublicLayout />, children: [{ index: true, element: <HomePage /> }, { path: 'catalogo', element: <CatalogPage /> }] }, { path: 'login', element: <LoginPage /> }, { path: 'caja', element: <CashierPage /> }, { path: 'admin', element: <AdminPage /> }, { path: '*', element: <NotFound /> }] }])
