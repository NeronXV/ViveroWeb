import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PublicCatalogProduct } from '../public-catalog/catalog-types'
import type { PublicCartItem } from './web-order-types'

const STORAGE_KEY = 'viveroweb_public_cart_v1'

function readCart(): PublicCartItem[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((entry): entry is PublicCartItem => {
      if (typeof entry !== 'object' || entry === null) return false
      const candidate = entry as Partial<PublicCartItem>
      return Number.isInteger(candidate.quantity)
        && (candidate.quantity ?? 0) > 0
        && (candidate.quantity ?? 0) <= 100
        && typeof candidate.product?.id === 'string'
        && typeof candidate.product?.name === 'string'
        && Number.isSafeInteger(candidate.product?.price?.amountCents)
    })
  } catch {
    return []
  }
}

interface PublicCartValue {
  items: PublicCartItem[]
  itemCount: number
  estimatedTotalCents: number
  addProduct: (product: PublicCatalogProduct) => void
  changeQuantity: (productId: string, change: number) => void
  removeProduct: (productId: string) => void
  clearCart: () => void
}

const PublicCartContext = createContext<PublicCartValue | null>(null)

export function PublicCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PublicCartItem[]>(readCart)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const value = useMemo<PublicCartValue>(() => ({
    items,
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    estimatedTotalCents: items.reduce((total, item) => total + item.product.price.amountCents * item.quantity, 0),
    addProduct: (product) => setItems((current) => {
      const existing = current.find((item) => item.product.id === product.id)
      return existing
        ? current.map((item) => item.product.id === product.id ? { ...item, product, quantity: Math.min(100, item.quantity + 1) } : item)
        : [...current, { product, quantity: 1 }]
    }),
    changeQuantity: (productId, change) => setItems((current) => current
      .map((item) => item.product.id === productId ? { ...item, quantity: Math.min(100, item.quantity + change) } : item)
      .filter((item) => item.quantity > 0)),
    removeProduct: (productId) => setItems((current) => current.filter((item) => item.product.id !== productId)),
    clearCart: () => setItems([]),
  }), [items])

  return <PublicCartContext.Provider value={value}>{children}</PublicCartContext.Provider>
}

export function usePublicCart(): PublicCartValue {
  const value = useContext(PublicCartContext)
  if (!value) throw new Error('usePublicCart debe usarse dentro de PublicCartProvider')
  return value
}
