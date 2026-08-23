import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { defaultEditorial, initialStaff } from '../../data/mock/content'
import { initialPlants } from '../../data/mock/plants'
import type { CartItem, DemoOrder, EditorialContent, Plant, StaffMember } from '../../types/domain'

const storageKeys = {
  plants: 'viveroweb_react_plants', cart: 'viveroweb_react_cart', orders: 'viveroweb_react_orders',
  editorial: 'viveroweb_react_editorial', staff: 'viveroweb_react_staff', theme: 'viveroweb_theme',
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

interface DemoStoreValue {
  plants: Plant[]
  cart: CartItem[]
  orders: DemoOrder[]
  editorial: EditorialContent
  staff: StaffMember[]
  darkTheme: boolean
  cartCount: number
  cartTotal: number
  addToCart: (plantId: number) => void
  changeQuantity: (plantId: number, change: number) => void
  removeFromCart: (plantId: number) => void
  checkoutDemo: () => DemoOrder | null
  addPlant: (plant: Omit<Plant, 'id' | 'discount'>) => void
  setDiscount: (plantId: number, discount: number) => void
  restock: (plantId: number, quantity: number) => void
  setEditorial: (content: EditorialContent) => void
  toggleStaff: (id: number) => void
  toggleTheme: () => void
}

const DemoStoreContext = createContext<DemoStoreValue | null>(null)

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [plants, setPlants] = useState(() => readStored(storageKeys.plants, initialPlants))
  const [cart, setCart] = useState(() => readStored<CartItem[]>(storageKeys.cart, []))
  const [orders, setOrders] = useState(() => readStored<DemoOrder[]>(storageKeys.orders, []))
  const [editorial, setEditorial] = useState(() => readStored(storageKeys.editorial, defaultEditorial))
  const [staff, setStaff] = useState(() => readStored(storageKeys.staff, initialStaff))
  const [darkTheme, setDarkTheme] = useState(() => localStorage.getItem(storageKeys.theme) === 'dark')

  useEffect(() => { localStorage.setItem(storageKeys.plants, JSON.stringify(plants)) }, [plants])
  useEffect(() => { localStorage.setItem(storageKeys.cart, JSON.stringify(cart)) }, [cart])
  useEffect(() => { localStorage.setItem(storageKeys.orders, JSON.stringify(orders)) }, [orders])
  useEffect(() => { localStorage.setItem(storageKeys.editorial, JSON.stringify(editorial)) }, [editorial])
  useEffect(() => { localStorage.setItem(storageKeys.staff, JSON.stringify(staff)) }, [staff])
  useEffect(() => {
    document.body.classList.toggle('dark-theme', darkTheme)
    localStorage.setItem(storageKeys.theme, darkTheme ? 'dark' : 'light')
  }, [darkTheme])

  const value = useMemo<DemoStoreValue>(() => {
    const priceFor = (plant: Plant) => plant.price * (1 - plant.discount / 100)
    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
    const cartTotal = cart.reduce((sum, item) => {
      const plant = plants.find((candidate) => candidate.id === item.plantId)
      return sum + (plant ? priceFor(plant) * item.quantity : 0)
    }, 0)

    return {
      plants, cart, orders, editorial, staff, darkTheme, cartCount, cartTotal,
      addToCart: (plantId) => setCart((current) => {
        const item = current.find((candidate) => candidate.plantId === plantId)
        return item ? current.map((candidate) => candidate.plantId === plantId ? { ...candidate, quantity: candidate.quantity + 1 } : candidate) : [...current, { plantId, quantity: 1 }]
      }),
      changeQuantity: (plantId, change) => setCart((current) => current.map((item) => item.plantId === plantId ? { ...item, quantity: item.quantity + change } : item).filter((item) => item.quantity > 0)),
      removeFromCart: (plantId) => setCart((current) => current.filter((item) => item.plantId !== plantId)),
      checkoutDemo: () => {
        if (cart.length === 0) return null
        const orderItems = cart.flatMap((item) => {
          const plant = plants.find((candidate) => candidate.id === item.plantId)
          return plant ? [{ plantId: plant.id, name: plant.name, quantity: item.quantity, unitPrice: priceFor(plant) }] : []
        })
        const order: DemoOrder = { id: `VW-${Date.now().toString().slice(-6)}`, createdAt: new Date().toLocaleString('es-MX'), items: orderItems, total: cartTotal, status: 'Completado (demo)' }
        setOrders((current) => [order, ...current])
        setPlants((current) => current.map((plant) => {
          const item = cart.find((candidate) => candidate.plantId === plant.id)
          return item ? { ...plant, stock: Math.max(0, plant.stock - item.quantity) } : plant
        }))
        setCart([])
        return order
      },
      addPlant: (plant) => setPlants((current) => [...current, { ...plant, id: Math.max(0, ...current.map(({ id }) => id)) + 1, discount: 0 }]),
      setDiscount: (plantId, discount) => setPlants((current) => current.map((plant) => plant.id === plantId ? { ...plant, discount } : plant)),
      restock: (plantId, quantity) => setPlants((current) => current.map((plant) => plant.id === plantId ? { ...plant, stock: plant.stock + quantity } : plant)),
      setEditorial,
      toggleStaff: (id) => setStaff((current) => current.map((member) => member.id === id ? { ...member, active: !member.active } : member)),
      toggleTheme: () => setDarkTheme((current) => !current),
    }
  }, [cart, darkTheme, editorial, orders, plants, staff])

  return <DemoStoreContext.Provider value={value}>{children}</DemoStoreContext.Provider>
}

export function useDemoStore() {
  const context = useContext(DemoStoreContext)
  if (!context) throw new Error('useDemoStore debe usarse dentro de DemoStoreProvider')
  return context
}
