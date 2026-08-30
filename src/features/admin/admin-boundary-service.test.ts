import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAdminCategories, fetchAdminProducts } from './admin-catalog-service'
import { searchCustomers } from './admin-customers-service'
import {
  AdminServiceError,
  fetchAdminInventoryBalances,
  fetchInventoryHistory,
  reconcileInventoryCount,
  recordInventoryReception,
} from './admin-service'

type ServiceResult = {
  data: unknown
  error: { message: string; code?: string } | null
}

let result: ServiceResult = { data: [], error: null }
let selectedColumns: string | null = null
let lastSignal: AbortSignal | null = null
let lastRpc: { name: string; parameters: Record<string, unknown> } | null = null
let keepRequestPending = false

function finishWithSignal(signal: AbortSignal): Promise<ServiceResult> {
  lastSignal = signal
  if (!keepRequestPending) return Promise.resolve(result)
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
}

function queryBuilder() {
  const query = {
    or: () => query,
    eq: () => query,
    order: () => query,
    abortSignal: (signal: AbortSignal) => finishWithSignal(signal),
  }
  return query
}

vi.mock('../../lib/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: (columns: string) => {
        selectedColumns = columns
        return queryBuilder()
      },
    }),
    rpc: (name: string, parameters: Record<string, unknown>) => {
      lastRpc = { name, parameters }
      return { abortSignal: (signal: AbortSignal) => finishWithSignal(signal) }
    },
  }),
}))

describe('límites de los servicios administrativos de Supabase', () => {
  beforeEach(() => {
    vi.useRealTimers()
    result = { data: [], error: null }
    selectedColumns = null
    lastSignal = null
    lastRpc = null
    keepRequestPending = false
  })

  it('consulta productos con una proyección explícita y aplica la señal combinada', async () => {
    const callerController = new AbortController()

    await fetchAdminProducts({}, callerController.signal)

    expect(selectedColumns).not.toContain('*')
    expect(selectedColumns).toContain('categories(name)')
    expect(lastSignal).not.toBe(callerController.signal)
    expect(lastSignal?.aborted).toBe(false)
    callerController.abort()
    expect(lastSignal?.aborted).toBe(true)
  })

  it('consulta categorías con una proyección explícita', async () => {
    await fetchAdminCategories()

    expect(selectedColumns).toBe('id,name,description,is_active,created_at,updated_at')
  })

  it('propaga el timeout interno a la consulta efectiva', async () => {
    vi.useFakeTimers()
    keepRequestPending = true

    const request = fetchAdminCategories()
    const rejection = expect(request).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(8_000)

    await rejection
    expect(lastSignal?.aborted).toBe(true)
  })

  it('envía el contrato exacto de search_customers', async () => {
    await searchCustomers('  ana  ', 25)

    expect(lastRpc).toEqual({
      name: 'search_customers',
      parameters: { p_query: 'ana', p_limit: 25 },
    })
  })

  it('rechaza límites fuera del rango backend antes de consultar', () => {
    expect(() => searchCustomers('ana', 51)).toThrow(AdminServiceError)
    expect(lastRpc).toBeNull()
  })

  it('no expone mensajes desconocidos del backend', async () => {
    result = { data: null, error: { message: 'sensitive database detail', code: 'XX999' } }

    await expect(searchCustomers('ana')).rejects.toMatchObject({
      message: 'No fue posible completar la operación de clientes en el servidor.',
      code: 'XX999',
    })
  })

  it('consulta el dashboard de inventario con el contrato piloto vigente', async () => {
    result = {
      data: {
        schemaVersion: 1,
        branchId: '11111111-1111-4111-8111-111111111111',
        items: [],
        hasMore: false,
        nextProductId: null,
      },
      error: null,
    }

    await fetchAdminInventoryBalances()

    expect(lastRpc).toEqual({
      name: 'get_my_inventory_dashboard',
      parameters: { p_limit: 100, p_after_product_id: null },
    })
  })

  it('explica de forma segura cuando falta el contrato de inventario', async () => {
    result = {
      data: null,
      error: { message: 'Could not find the function', code: 'PGRST202' },
    }

    await expect(fetchAdminInventoryBalances()).rejects.toMatchObject({
      message: 'El flujo de inventario todavía no está disponible en este entorno. Falta aplicar su contrato de servidor.',
      code: 'INVENTORY_CONTRACT_UNAVAILABLE',
    })
  })

  it('envía el contrato exacto de record_inventory_reception', async () => {
    result = {
      data: {
        schemaVersion: 1,
        idempotentReplay: false,
        movementId: '22222222-2222-4222-8222-222222222222',
        productId: '33333333-3333-4333-8333-333333333333',
        quantity: 15,
        totalQuantity: 35,
      },
      error: null,
    }

    const response = await recordInventoryReception({
      productId: '33333333-3333-4333-8333-333333333333',
      quantity: 15,
      notes: 'Lote de invernadero',
      idempotencyKey: '44444444-4444-4444-8444-444444444444',
    })

    expect(lastRpc).toEqual({
      name: 'record_inventory_reception',
      parameters: {
        p_product_id: '33333333-3333-4333-8333-333333333333',
        p_quantity: 15,
        p_notes: 'Lote de invernadero',
        p_idempotency_key: '44444444-4444-4444-8444-444444444444',
      },
    })
    expect(response.totalQuantity).toBe(35)
  })

  it('envía el contrato exacto de reconcile_inventory_count', async () => {
    result = {
      data: {
        schemaVersion: 1,
        idempotentReplay: false,
        countId: '55555555-5555-4555-8555-555555555555',
        productId: '33333333-3333-4333-8333-333333333333',
        previousQuantity: 35,
        countedQuantity: 28,
        adjustmentQuantity: -7,
        totalQuantity: 28,
      },
      error: null,
    }

    const response = await reconcileInventoryCount({
      productId: '33333333-3333-4333-8333-333333333333',
      countedQuantity: 28,
      reason: 'Conteo físico fin de mes',
      idempotencyKey: '66666666-6666-4666-8666-666666666666',
    })

    expect(lastRpc).toEqual({
      name: 'reconcile_inventory_count',
      parameters: {
        p_product_id: '33333333-3333-4333-8333-333333333333',
        p_counted_quantity: 28,
        p_reason: 'Conteo físico fin de mes',
        p_idempotency_key: '66666666-6666-4666-8666-666666666666',
        p_location_id: null,
      },
    })
    expect(response.adjustmentQuantity).toBe(-7)
  })

  it('envía el contrato exacto de get_my_inventory_history', async () => {
    result = {
      data: {
        schemaVersion: 1,
        branchId: '11111111-1111-4111-8111-111111111111',
        items: [],
        hasMore: false,
        nextCursor: null,
      },
      error: null,
    }

    await fetchInventoryHistory('33333333-3333-4333-8333-333333333333')

    expect(lastRpc).toEqual({
      name: 'get_my_inventory_history',
      parameters: {
        p_product_id: '33333333-3333-4333-8333-333333333333',
        p_limit: 50,
        p_after_created_at: null,
        p_after_id: null,
      },
    })
  })
})
