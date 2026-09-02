import {
  WEB_ORDER_STATUSES,
  type AdminWebOrder,
  type AdminWebOrderItem,
  type AdminWebOrdersResponse,
  type PublicOrderBranch,
  type PublicOrderOptions,
  type SubmitWebOrderResult,
  type WebOrderStatus,
  type WebOrderStatusResult,
} from './web-order-types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${field} no es válido.`)
  return value as Record<string, unknown>
}

function string(value: unknown, field: string, nullable = false): string | null {
  if (nullable && value === null) return null
  if (typeof value !== 'string' || value === '') throw new Error(`${field} no es válido.`)
  return value
}

function uuid(value: unknown, field: string): string {
  const parsed = string(value, field)
  if (parsed === null || !UUID_PATTERN.test(parsed)) throw new Error(`${field} no es válido.`)
  return parsed
}

function integer(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${field} no es válido.`)
  return value as number
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} no es válido.`)
  return value
}

function status(value: unknown): WebOrderStatus {
  if (typeof value !== 'string' || !WEB_ORDER_STATUSES.includes(value as WebOrderStatus)) throw new Error('El estado del pedido no es válido.')
  return value as WebOrderStatus
}

function branch(value: unknown): PublicOrderBranch {
  const row = record(value, 'La sucursal')
  return { id: uuid(row.id, 'La sucursal'), code: string(row.code, 'El código')!, name: string(row.name, 'El nombre')! }
}

export function parsePublicOrderOptions(value: unknown): PublicOrderOptions {
  const root = record(value, 'Las opciones de pedido')
  if (root.schemaVersion !== 1 || !Array.isArray(root.branches)) throw new Error('Las opciones de pedido no son compatibles.')
  return { schemaVersion: 1, branches: root.branches.map(branch) }
}

export function parseSubmitWebOrderResult(value: unknown): SubmitWebOrderResult {
  const root = record(value, 'El pedido')
  if (root.schemaVersion !== 1) throw new Error('La confirmación del pedido no es compatible.')
  return {
    schemaVersion: 1,
    orderId: uuid(root.orderId, 'El identificador'),
    orderNumber: string(root.orderNumber, 'El número de pedido')!,
    status: status(root.status),
    totalCents: integer(root.totalCents, 'El total'),
    createdAt: string(root.createdAt, 'La fecha')!,
    idempotentReplay: boolean(root.idempotentReplay, 'La confirmación segura'),
  }
}

function adminItem(value: unknown): AdminWebOrderItem {
  const row = record(value, 'La partida')
  return {
    productId: uuid(row.productId, 'El producto'),
    name: string(row.name, 'El nombre')!,
    code: string(row.code, 'El código')!,
    quantity: integer(row.quantity, 'La cantidad'),
    listPriceCents: integer(row.listPriceCents, 'El precio de lista'),
    unitPriceCents: integer(row.unitPriceCents, 'El precio unitario'),
    promotionName: string(row.promotionName, 'La promoción', true),
    lineTotalCents: integer(row.lineTotalCents, 'El total de partida'),
  }
}

function adminOrder(value: unknown): AdminWebOrder {
  const row = record(value, 'El pedido')
  const customer = record(row.customer, 'El cliente')
  if (!Array.isArray(row.items)) throw new Error('Las partidas del pedido no son válidas.')
  return {
    id: uuid(row.id, 'El pedido'),
    orderNumber: string(row.orderNumber, 'El número')!,
    branch: branch(row.branch),
    customer: {
      name: string(customer.name, 'El cliente')!,
      phone: string(customer.phone, 'El teléfono', true),
      email: string(customer.email, 'El correo', true),
    },
    notes: string(row.notes, 'Las notas', true),
    subtotalCents: integer(row.subtotalCents, 'El subtotal'),
    discountCents: integer(row.discountCents, 'El descuento'),
    totalCents: integer(row.totalCents, 'El total'),
    status: status(row.status),
    createdAt: string(row.createdAt, 'La fecha de creación')!,
    updatedAt: string(row.updatedAt, 'La fecha de actualización')!,
    items: row.items.map(adminItem),
  }
}

export function parseAdminWebOrders(value: unknown): AdminWebOrdersResponse {
  const root = record(value, 'Los pedidos')
  const page = record(root.page, 'La página')
  if (root.schemaVersion !== 1 || !Array.isArray(root.items)) throw new Error('La respuesta de pedidos no es compatible.')
  const cursor = page.nextCursor === null ? null : record(page.nextCursor, 'El cursor')
  return {
    schemaVersion: 1,
    items: root.items.map(adminOrder),
    page: {
      limit: integer(page.limit, 'El límite'),
      hasMore: boolean(page.hasMore, 'La paginación'),
      nextCursor: cursor ? { createdAt: string(cursor.createdAt, 'La fecha del cursor')!, id: uuid(cursor.id, 'El cursor') } : null,
    },
    serverTime: string(root.serverTime, 'La hora del servidor')!,
  }
}

export function parseWebOrderStatusResult(value: unknown): WebOrderStatusResult {
  const root = record(value, 'El cambio de estado')
  if (root.schemaVersion !== 1) throw new Error('La respuesta del cambio de estado no es compatible.')
  return {
    schemaVersion: 1,
    orderId: uuid(root.orderId, 'El pedido'),
    status: status(root.status),
    updatedAt: string(root.updatedAt, 'La actualización')!,
    idempotentReplay: boolean(root.idempotentReplay, 'La confirmación segura'),
  }
}
