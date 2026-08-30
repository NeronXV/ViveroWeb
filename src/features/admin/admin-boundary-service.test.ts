import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAdminCategories, fetchAdminProducts } from './admin-catalog-service'
import { searchCustomers } from './admin-customers-service'
import { AdminServiceError, fetchAdminInventoryBalances } from './admin-service'

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
})
