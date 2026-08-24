import { createBrowserRouter } from 'react-router-dom'
import { App } from './App'
import { PublicLayout } from '../components/layout/PublicLayout'
import { AdminPage } from '../features/admin/AdminPage'
import { LoginPage } from '../features/auth/LoginPage'
import { CashierPage } from '../features/cashier/CashierPage'
import { CatalogPage } from '../features/public-catalog/CatalogPage'
import { HomePage } from '../features/public-catalog/HomePage'
import { RequireAccessContext, RequireAdminAccess, RequireCashierAccess, RequireSession } from '../features/access/AccessGuards'

function NotFound() { return <main className="internal-page"><section className="login-card"><h1>Página no encontrada</h1><a className="back-link" href="/">Volver al inicio</a></section></main> }

function ProtectedCashierRoute() {
  return <RequireSession returnTo="/caja"><RequireAccessContext><RequireCashierAccess><CashierPage /></RequireCashierAccess></RequireAccessContext></RequireSession>
}

function ProtectedAdminRoute() {
  return <RequireSession returnTo="/admin"><RequireAccessContext><RequireAdminAccess><AdminPage /></RequireAdminAccess></RequireAccessContext></RequireSession>
}

export const router = createBrowserRouter([{ element: <App />, children: [{ element: <PublicLayout />, children: [{ index: true, element: <HomePage /> }, { path: 'catalogo', element: <CatalogPage /> }] }, { path: 'login', element: <LoginPage /> }, { path: 'caja', element: <ProtectedCashierRoute /> }, { path: 'admin', element: <ProtectedAdminRoute /> }, { path: '*', element: <NotFound /> }] }])
