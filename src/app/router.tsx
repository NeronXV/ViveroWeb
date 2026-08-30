import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { App } from './App'
import { PublicLayout } from '../components/layout/PublicLayout'
import { RequireAccessContext, RequireAdminAccess, RequireCashierAccess, RequireSession } from '../features/access/AccessGuards'

const AdminPage = lazy(() => import('../features/admin/AdminPage').then((module) => ({ default: module.AdminPage })))
const LoginPage = lazy(() => import('../features/auth/LoginPage').then((module) => ({ default: module.LoginPage })))
const CashierPage = lazy(() => import('../features/cashier/CashierPage').then((module) => ({ default: module.CashierPage })))
const CatalogPage = lazy(() => import('../features/public-catalog/CatalogPage').then((module) => ({ default: module.CatalogPage })))
const HomePage = lazy(() => import('../features/public-catalog/HomePage').then((module) => ({ default: module.HomePage })))
const PanelPage = lazy(() => import('../features/internal-home/PanelPage').then((module) => ({ default: module.PanelPage })))

function RouteLoading() {
  return <main className="internal-page access-boundary-page"><section className="login-card" aria-busy="true"><p role="status" aria-live="polite">Cargando página…</p></section></main>
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteLoading />}>{children}</Suspense>
}

function NotFound() { return <main className="internal-page"><section className="login-card"><h1>Página no encontrada</h1><a className="back-link" href="/">Volver al inicio</a></section></main> }

function ProtectedCashierRoute() {
  return <RequireSession returnTo="/caja"><RequireAccessContext><RequireCashierAccess><LazyRoute><CashierPage /></LazyRoute></RequireCashierAccess></RequireAccessContext></RequireSession>
}

function ProtectedAdminRoute() {
  return <RequireSession returnTo="/admin"><RequireAccessContext><RequireAdminAccess><LazyRoute><AdminPage /></LazyRoute></RequireAdminAccess></RequireAccessContext></RequireSession>
}

function ProtectedPanelRoute() {
  return <RequireSession returnTo="/panel"><LazyRoute><PanelPage /></LazyRoute></RequireSession>
}

export const router = createBrowserRouter([{ element: <App />, children: [{ element: <PublicLayout />, children: [{ index: true, element: <LazyRoute><HomePage /></LazyRoute> }, { path: 'catalogo', element: <LazyRoute><CatalogPage /></LazyRoute> }] }, { path: 'login', element: <LazyRoute><LoginPage /></LazyRoute> }, { path: 'caja', element: <ProtectedCashierRoute /> }, { path: 'admin', element: <ProtectedAdminRoute /> }, { path: 'panel', element: <ProtectedPanelRoute /> }, { path: '*', element: <NotFound /> }] }])
