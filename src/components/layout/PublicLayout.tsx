import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { CartDrawer } from '../../features/public-catalog/CartDrawer'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'

export function PublicLayout() {
  const [cartOpen, setCartOpen] = useState(false)
  return <><SiteHeader onOpenCart={() => setCartOpen(true)} /><Outlet context={{ openCart: () => setCartOpen(true) }} /><SiteFooter /><CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} /></>
}
