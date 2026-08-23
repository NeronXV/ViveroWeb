export type PlantCategory = 'interior' | 'exterior' | 'suculentas'
export type CareLevel = 'alta' | 'media' | 'baja'
export type DemoRole = 'administracion' | 'gerencia' | 'caja'

export interface Plant { id: number; name: string; category: PlantCategory; price: number; light: CareLevel; water: Exclude<CareLevel, 'media'>; pets: boolean; image: string; lightDesc: string; waterDesc: string; petDesc: string; description: string; stock: number; discount: number }
export interface CartItem { plantId: number; quantity: number }
export interface DemoOrder { id: string; createdAt: string; items: Array<{ plantId: number; name: string; quantity: number; unitPrice: number }>; total: number; status: 'Completado (demo)' }
export interface StaffMember { id: number; name: string; specialty: string; shift: string; active: boolean }
export interface EditorialContent { title: string; description: string; announcement: string }
