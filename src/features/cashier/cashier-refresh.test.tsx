import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CashierPendingList } from './CashierPendingList'
import { CashierSalesCoordinator, CASHIER_COORDINATOR_TIMEOUT_MS } from './useCashierSales'
import type { CashierCursor, CashierSale } from './cashier-types'

type Params = { limit: number; cursor: CashierCursor | null; folio?: string }
const stamp = '2026-10-12T12:00:00Z'
function sales(count: number): CashierSale[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(count - index), folio: `TEST-${count - index}`, createdAt: stamp,
    totalCents: 100, itemCount: 1, status: 'SENT_TO_CASHIER', createdByLabel: null,
    claimState: 'AVAILABLE', claimExpiresAt: null, serverTime: stamp,
  }))
}
function page(rows: CashierSale[], { limit, cursor }: Params) {
  const remaining = rows.filter(row => !cursor || Number(row.id) < Number(cursor.id))
  const items = remaining.slice(0, limit)
  const hasMore = remaining.length > limit
  return { items, page: { hasMore, nextCursor: hasMore ? { id: items.at(-1)!.id, createdAt: stamp } : null } }
}

describe('Actualización de la ventana paginada de Caja (datos sintéticos)', () => {
  const coordinators: CashierSalesCoordinator[] = []
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    coordinators.splice(0).forEach(coordinator => coordinator.destroy())
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  async function loaded(count: number, total = count) {
    const source = { rows: sales(total) }
    const fetch = vi.fn(async (params: Params, signal: AbortSignal) => {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      return page(source.rows, params)
    })
    const changed = vi.fn()
    const coordinator = new CashierSalesCoordinator({ limit: count === 51 ? 17 : 25, fetchCall: fetch, onStateChange: changed })
    coordinators.push(coordinator)
    coordinator.resetScope('synthetic-user', 'synthetic-branch', ' TEST ')
    await vi.dynamicImportSettled()
    while (coordinator.state.items.length < count) await coordinator.runFetch('more')
    fetch.mockClear()
    changed.mockClear()
    return { coordinator, source, fetch, changed }
  }

  for (const count of [25, 50, 51, 100]) {
    for (const mode of ['manual', 'poll'] as const) {
      it(`${mode}: consulta y conserva ${count} ventas sin duplicados ni cambio de orden`, async () => {
        const { coordinator, fetch } = await loaded(count)
        const original = coordinator.state.items
        if (mode === 'manual') {
          coordinator.refresh()
          await vi.dynamicImportSettled()
        } else {
          await vi.advanceTimersByTimeAsync(10_000)
        }
        expect(fetch).toHaveBeenCalledTimes(Math.ceil(count / 50))
        expect(coordinator.state.items).toEqual(original)
        expect(new Set(coordinator.state.items.map(row => row.id)).size).toBe(count)
        expect(coordinator.state.isUpdating).toBe(false)
        expect(coordinator.state.pollingStatus).toBe('active')
        expect(fetch.mock.calls.every(([params]) => params.limit <= 50 && params.folio === 'TEST')).toBe(true)
        expect(fetch.mock.calls.map(([params]) => params.cursor?.id ?? null)).toEqual(count > 50 ? [null, String(count - 49)] : [null])
      })
    }
  }

  it('incorpora nuevas ventas sin expulsar la selección ni las páginas visibles; continúa desde el cursor correcto', async () => {
    const { coordinator, source, fetch } = await loaded(51, 160)
    const originalIds = coordinator.state.items.map(row => row.id)
    const selectedId = originalIds.at(-1)!
    source.rows = sales(163)
    await coordinator.runFetch('manual')
    expect(coordinator.state.items.map(row => row.id)).toEqual(['163', '162', '161', ...originalIds])
    expect(coordinator.state.nextCursor?.id).toBe(selectedId)
    expect(coordinator.state.hasMore).toBe(true)
    expect(coordinator.state.newComandasNotice).toBe('3 nuevas comandas recibidas')
    expect(fetch).toHaveBeenCalledTimes(2)
    const html = renderToStaticMarkup(<CashierPendingList compact sales={coordinator.state.items} selectedId={selectedId}
      locked={false} onCharge={() => {}} onDetail={() => {}} />)
    expect(html).toContain(`aria-label="Ver detalle TEST-${selectedId}" aria-pressed="true"`)
    await coordinator.runFetch('more')
    expect(coordinator.state.items.map(row => row.id)).toEqual(source.rows.slice(0, 71).map(row => row.id))
    expect(new Set(coordinator.state.items.map(row => row.id)).size).toBe(71)
  })

  it('más de una página nueva mantiene toda la ventana anterior', async () => {
    const { coordinator, source, fetch } = await loaded(100, 200)
    const original = coordinator.state.items.map(row => row.id)
    source.rows = sales(260)
    await coordinator.runFetch('manual')
    expect(coordinator.state.items.map(row => row.id)).toEqual(source.rows.slice(0, 160).map(row => row.id))
    expect(original.every(id => coordinator.state.items.some(row => row.id === id))).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(coordinator.state.nextCursor?.id).toBe('101')
  })

  it('con 50 visibles las ventas nuevas tampoco desplazan ventas pendientes ya cargadas', async () => {
    const { coordinator, source, fetch } = await loaded(50, 100)
    source.rows = sales(101)
    await coordinator.runFetch('manual')
    expect(coordinator.state.items.map(row => row.id)).toEqual(source.rows.slice(0, 51).map(row => row.id))
    expect(coordinator.state.nextCursor?.id).toBe('51')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('ventas nuevas durante el recorrido aparecen en el siguiente ciclo sin desplazar el cursor', async () => {
    const { coordinator, source, fetch } = await loaded(100, 150)
    fetch.mockImplementationOnce(async params => {
      const firstPage = page(source.rows, params)
      source.rows = sales(151)
      return firstPage
    })
    await coordinator.runFetch('manual')
    expect(coordinator.state.items.map(row => row.id)).toEqual(sales(150).slice(0, 100).map(row => row.id))
    expect(coordinator.state.nextCursor?.id).toBe('51')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(coordinator.state.items.map(row => row.id)).toEqual(source.rows.slice(0, 101).map(row => row.id))
    expect(coordinator.state.nextCursor?.id).toBe('51')
  })

  it('un cursor repetido no produce un ciclo ni reemplaza la lista anterior', async () => {
    const { coordinator, source, fetch } = await loaded(100)
    const original = coordinator.state.items
    fetch.mockImplementation(async () => page(source.rows, { limit: 50, cursor: null }))
    await coordinator.runFetch('manual')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(coordinator.state.items).toBe(original)
    expect(coordinator.state.pollingStatus).toBe('error')
  })

  it('retira cobrada/cancelada incluso en la última página y actualiza reservas sin perder otras ventas', async () => {
    const { coordinator, source } = await loaded(100, 150)
    // El listado autoritativo omite ventas que dejaron de estar pendientes.
    source.rows = source.rows.filter(row => !['140', '51'].includes(row.id))
    source.rows = source.rows.map(row => row.id === '75' ? { ...row, claimState: 'CLAIMED_BY_OTHER' as const } : row)
    await coordinator.runFetch('manual')
    expect(coordinator.state.items.map(row => row.id)).toEqual(source.rows.filter(row => Number(row.id) >= 51).map(row => row.id))
    expect(coordinator.state.items.find(row => row.id === '75')?.claimState).toBe('CLAIMED_BY_OTHER')
    expect(coordinator.state.nextCursor?.id).toBe('52')
    await coordinator.runFetch('more')
    expect(coordinator.state.items.some(row => row.id === '50')).toBe(true)
    expect(coordinator.state.items.some(row => ['140', '51'].includes(row.id))).toBe(false)
  })

  it('una bandeja vacía tras cobros/cancelaciones queda vacía', async () => {
    const { coordinator, source, fetch } = await loaded(100)
    source.rows = []
    await coordinator.runFetch('manual')
    expect(coordinator.state.items).toEqual([])
    expect(coordinator.state.hasMore).toBe(false)
    expect(coordinator.state.nextCursor).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('un fallo en la segunda página conserva toda la lista y cursor; el siguiente polling recupera', async () => {
    const { coordinator, source, fetch } = await loaded(100, 150)
    const { items, nextCursor } = coordinator.state
    source.rows = sales(151)
    fetch.mockImplementationOnce(async params => page(source.rows, params)).mockRejectedValueOnce(new Error('synthetic connection failure'))
    await coordinator.runFetch('manual')
    expect(coordinator.state.items).toBe(items)
    expect(coordinator.state.nextCursor).toBe(nextCursor)
    expect(coordinator.state.pollingStatus).toBe('error')
    expect(coordinator.state.isUpdating).toBe(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(coordinator.state.items.map(row => row.id)).toEqual(source.rows.slice(0, 101).map(row => row.id))
    expect(coordinator.state.pollingStatus).toBe('active')
  })

  it('no publica páginas parciales ni lanza consultas concurrentes por varios clics o polling', async () => {
    const { coordinator, source, fetch, changed } = await loaded(100)
    const original = coordinator.state.items
    let resolve!: (result: ReturnType<typeof page>) => void
    fetch.mockImplementationOnce(async params => page(source.rows, params))
      .mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const update = coordinator.runFetch('manual')
    await vi.dynamicImportSettled()
    coordinator.refresh()
    coordinator.loadMore()
    await coordinator.runFetch('poll')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(coordinator.state.items).toBe(original)
    expect(changed.mock.calls.every(([state]) => state.items === original)).toBe(true)
    resolve(page(source.rows, { limit: 50, cursor: { id: '51', createdAt: stamp } }))
    await update
    expect(coordinator.state.items).toEqual(original)
    fetch.mockClear()
    await vi.advanceTimersByTimeAsync(9_999)
    expect(fetch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('timeout y respuesta tardía en otra página no reemplazan la ventana recuperada', async () => {
    const { coordinator, source, fetch } = await loaded(100)
    const original = coordinator.state.items
    let resolve!: (result: ReturnType<typeof page>) => void
    let signal!: AbortSignal
    fetch.mockImplementationOnce(async params => page(source.rows, params)).mockImplementationOnce((_params, requestSignal) => {
      signal = requestSignal
      return new Promise(done => { resolve = done })
    })
    const update = coordinator.runFetch('manual')
    await vi.dynamicImportSettled()
    await vi.advanceTimersByTimeAsync(CASHIER_COORDINATOR_TIMEOUT_MS)
    await update
    expect(signal.aborted).toBe(true)
    expect(coordinator.state.items).toBe(original)
    source.rows = sales(101)
    await coordinator.runFetch('manual')
    const recovered = coordinator.state.items
    resolve(page([], { limit: 50, cursor: null }))
    await vi.dynamicImportSettled()
    expect(coordinator.state.items).toBe(recovered)
    expect(recovered).toHaveLength(101)
  })

  it('aplica el timeout por consulta, sin limitar la cantidad de páginas por su duración total', async () => {
    const { coordinator, source, fetch } = await loaded(100)
    const original = coordinator.state.items
    fetch.mockImplementation(params => new Promise(done => {
      setTimeout(() => done(page(source.rows, params)), 6_000)
    }))
    const update = coordinator.runFetch('manual')
    await vi.advanceTimersByTimeAsync(12_000)
    await update
    expect(coordinator.state.items).toEqual(original)
    expect(coordinator.state.pollingStatus).toBe('active')
    expect(coordinator.state.isUpdating).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  for (const scope of [['other-user', 'synthetic-branch'], ['synthetic-user', 'other-branch'], [null, null]] as const) {
    it(`descarta respuesta tardía al cambiar alcance: ${scope.join('/')}`, async () => {
      const { coordinator, source, fetch } = await loaded(100)
      let resolve!: (result: ReturnType<typeof page>) => void
      fetch.mockImplementationOnce(async params => page(source.rows, params)).mockImplementationOnce(() => new Promise(done => { resolve = done }))
      const update = coordinator.runFetch('manual')
      await vi.dynamicImportSettled()
      source.rows = []
      coordinator.resetScope(scope[0], scope[1])
      await vi.dynamicImportSettled()
      resolve(page(sales(100), { limit: 50, cursor: { id: '51', createdAt: stamp } }))
      await update
      expect(coordinator.state.items).toEqual([])
      expect(coordinator.state.nextCursor).toBeNull()
    })
  }

  for (const pause of ['critical', 'offline', 'hidden'] as const) {
    it(`pausa ${pause} antes de actualizar no consulta`, async () => {
      const { coordinator, fetch } = await loaded(100)
      if (pause === 'critical') coordinator.updateCriticalPayment(true)
      if (pause === 'offline') coordinator.updateOnline(false)
      if (pause === 'hidden') coordinator.updateVisibility(false)
      coordinator.refresh()
      await vi.advanceTimersByTimeAsync(30_000)
      expect(fetch).not.toHaveBeenCalled()
    })

    it(`pausa ${pause} durante actualización impide publicar o seguir consultando`, async () => {
      const { coordinator, source, fetch } = await loaded(100)
      const original = coordinator.state.items
      let resolve!: (result: ReturnType<typeof page>) => void
      fetch.mockImplementationOnce(() => new Promise(done => { resolve = done }))
      const update = coordinator.runFetch('manual')
      if (pause === 'critical') coordinator.updateCriticalPayment(true)
      if (pause === 'offline') coordinator.updateOnline(false)
      if (pause === 'hidden') coordinator.updateVisibility(false)
      resolve(page(source.rows, { limit: 50, cursor: null }))
      await update
      expect(coordinator.state.items).toBe(original)
      expect(coordinator.state.isUpdating).toBe(false)
      await vi.advanceTimersByTimeAsync(30_000)
      expect(fetch).toHaveBeenCalledTimes(1)
    })
  }
})
