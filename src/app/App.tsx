import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

export function App() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    document.title = pathname.startsWith('/admin') ? 'Administración demo | Vivero Dulcinea' : pathname.startsWith('/caja') ? 'Caja demo | Vivero Dulcinea' : 'Vivero Dulcinea | Plantas y cuidado botánico'
    window.requestAnimationFrame(() => hash ? document.querySelector(hash)?.scrollIntoView() : window.scrollTo({ top: 0 }))
  }, [hash, pathname])
  return <Outlet />
}
