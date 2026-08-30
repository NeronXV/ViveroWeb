import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  determineNewComandasNotice,
  determinePollingLimit,
  CASHIER_COORDINATOR_TIMEOUT_MS,
  CashierSalesCoordinator,
} from './useCashierSales'
import type { CashierCursor, CashierSale } from './cashier-types'

type FetchResult = {
  items: CashierSale[]
  page: { nextCursor: CashierCursor | null; hasMore: boolean }
}

describe('Pruebas del Coordinador de Polling de Caja', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('1. Pruebas Funcionales de Comandas y Polling', () => {
    it('bandeja inicial vacía seguida por primera comanda', () => {
      const seenIds = new Set<string>()
      // Primera carga vacía
      let result = determineNewComandasNotice([], seenIds, false)
      expect(result.notice).toBeNull()

      // Segunda carga con comanda
      result = determineNewComandasNotice([{ id: 's1' }], seenIds, true)
      expect(result.notice).toBe('Nueva comanda recibida')
    })

    it('carga inicial con datos sin aviso', () => {
      const seenIds = new Set<string>()
      const result = determineNewComandasNotice([{ id: 's1' }, { id: 's2' }], seenIds, false)
      expect(result.notice).toBeNull()
      expect(seenIds.size).toBe(2)
    })

    it('aviso único para IDs nuevos', () => {
      const seenIds = new Set<string>(['s1'])
      const result = determineNewComandasNotice([{ id: 's1' }, { id: 's2' }], seenIds, true)
      expect(result.notice).toBe('Nueva comanda recibida')
      expect(seenIds.has('s2')).toBe(true)

      // Repetición
      const repeat = determineNewComandasNotice([{ id: 's1' }, { id: 's2' }], seenIds, true)
      expect(repeat.notice).toBeNull()
    })

    it('límite del RPC nunca excede el máximo contractual', () => {
      expect(determinePollingLimit(15, 10)).toBe(15)
      expect(determinePollingLimit(15, 45)).toBe(45)
      expect(determinePollingLimit(15, 60)).toBe(50) // Capped at 50
    })
  })

  describe('2. Pruebas de Pausa y Temporizadores Falsos (CashierSalesCoordinator)', () => {
    it('1. montaje inicial con pestaña oculta no consulta ni programa polling', async () => {
      let fetchCount = 0
      const coord = new CashierSalesCoordinator({
        limit: 15,
        fetchCall: async () => {
          fetchCount++
          return { items: [], page: { nextCursor: null, hasMore: false } }
        },
        onStateChange: () => {},
        isTabVisible: false,
        isOnline: true,
      })

      coord.resetScope('u1', 'b1')
      expect(fetchCount).toBe(0)

      // Avanzar 30 segundos
      vi.advanceTimersByTime(30000)
      expect(fetchCount).toBe(0)
    })

    it('2. montaje inicial offline no consulta ni programa polling', async () => {
      let fetchCount = 0
      const coord = new CashierSalesCoordinator({
        limit: 15,
        fetchCall: async () => {
          fetchCount++
          return { items: [], page: { nextCursor: null, hasMore: false } }
        },
        onStateChange: () => {},
        isTabVisible: true,
        isOnline: false,
      })

      coord.resetScope('u1', 'b1')
      expect(fetchCount).toBe(0)

      // Avanzar 30 segundos
      vi.advanceTimersByTime(30000)
      expect(fetchCount).toBe(0)
    })

    it('3. ocultar cancela el timer existente', async () => {
      let fetchCount = 0
      let resolveFetch: (value: FetchResult) => void = () => {}
      const coord = new CashierSalesCoordinator({
        limit: 15,
        fetchCall: () => {
          fetchCount++
          return new Promise((resolve) => { resolveFetch = resolve })
        },
        onStateChange: () => {},
        isTabVisible: true,
        isOnline: true,
      })

      coord.resetScope('u1', 'b1')
      expect(fetchCount).toBe(1)

      // Resuelve primera carga -> programa polling
      resolveFetch({ items: [], page: { nextCursor: null, hasMore: false } })
      await vi.dynamicImportSettled()

      // Ocultar pestaña
      coord.updateVisibility(false)

      // Avanzar 30 segundos
      vi.advanceTimersByTime(30000)
      expect(fetchCount).toBe(1) // No debe haberse gatillado segunda consulta
    })

    it('4. quedar offline cancela el timer existente', async () => {
      let fetchCount = 0
      let resolveFetch: (value: FetchResult) => void = () => {}
      const coord = new CashierSalesCoordinator({
        limit: 15,
        fetchCall: () => {
          fetchCount++
          return new Promise((resolve) => { resolveFetch = resolve })
        },
        onStateChange: () => {},
        isTabVisible: true,
        isOnline: true,
      })

      coord.resetScope('u1', 'b1')
      expect(fetchCount).toBe(1)

      resolveFetch({ items: [], page: { nextCursor: null, hasMore: false } })
      await vi.dynamicImportSettled()

      // Quedar offline
      coord.updateOnline(false)

      // Avanzar 30 segundos
      vi.advanceTimersByTime(30000)
      expect(fetchCount).toBe(1)
    })

    it('5. pago crítico cancela el timer existente', async () => {
      let fetchCount = 0
      let resolveFetch: (value: FetchResult) => void = () => {}
      const coord = new CashierSalesCoordinator({
        limit: 15,
        fetchCall: () => {
          fetchCount++
          return new Promise((resolve) => { resolveFetch = resolve })
        },
        onStateChange: () => {},
        isTabVisible: true,
        isOnline: true,
      })

      coord.resetScope('u1', 'b1')
      expect(fetchCount).toBe(1)

      resolveFetch({ items: [], page: { nextCursor: null, hasMore: false } })
      await vi.dynamicImportSettled()

      // Inicia pago crítico
      coord.updateCriticalPayment(true)

      // Avanzar 30 segundos
      vi.advanceTimersByTime(30000)
      expect(fetchCount).toBe(1)
    })

    it('6. avanzar 30 segundos pausado no produce consultas', async () => {
      let fetchCount = 0
      const coord = new CashierSalesCoordinator({
        limit: 15,
        fetchCall: async () => {
          fetchCount++
          return { items: [], page: { nextCursor: null, hasMore: false } }
        },
        onStateChange: () => {},
        isTabVisible: false, // Pausado
      })

      coord.resetScope('u1', 'b1')
      vi.advanceTimersByTime(30000)
      expect(fetchCount).toBe(0)
    })

    it('7. visible estando offline no consulta', async () => {
      let fetchCount = 0
      const coord = new CashierSalesCoordinator({
        limit: 15,
        fetchCall: async () => {
          fetchCount++
          return { items: [], page: { nextCursor: null, hasMore: false } }
        },
        onStateChange: () => {},
        isTabVisible: false,
        isOnline: false, // Offline
      })

      coord.resetScope('u1', 'b1')
      expect(fetchCount).toBe(0)

      // Cambiar visibilidad a true, pero sigue offline
      coord.updateVisibility(true)
      expect(fetchCount).toBe(0)
    })

    it('8. recuperar conexión estando hidden no consulta', async () => {
      let fetchCount = 0
      const coord = new CashierSalesCoordinator({
        limit: 15,
        fetchCall: async () => {
          fetchCount++
          return { items: [], page: { nextCursor: null, hasMore: false } }
        },
        onStateChange: () => {},
        isTabVisible: false, // Hidden
        isOnline: false,
      })

      coord.resetScope('u1', 'b1')
      expect(fetchCount).toBe(0)

      // Recuperar red
      coord.updateOnline(true)
      expect(fetchCount).toBe(0)
    })

    it('9. terminar pago estando offline no consulta', async () => {
      let fetchCount = 0
      const coord = new CashierSalesCoordinator({
        limit: 15,
        fetchCall: async () => {
          fetchCount++
          return { items: [], page: { nextCursor: null, hasMore: false } }
        },
        onStateChange: () => {},
        isTabVisible: true,
        isOnline: false, // Offline
        isCriticalPaymentActive: true,
      })

      coord.resetScope('u1', 'b1')
      expect(fetchCount).toBe(0)

      // Terminar pago crítico
      coord.updateCriticalPayment(false)
      expect(fetchCount).toBe(0)
    })

    it('10. reanudar con las tres condiciones válidas consulta exactamente una vez', async () => {
      let fetchCount = 0
      const coord = new CashierSalesCoordinator({
        limit: 15,
        fetchCall: async () => {
          fetchCount++
          return { items: [], page: { nextCursor: null, hasMore: false } }
        },
        onStateChange: () => {},
        isTabVisible: false,
        isOnline: true,
        isCriticalPaymentActive: false,
      })

      coord.resetScope('u1', 'b1')
      expect(fetchCount).toBe(0)

      // Activar visibilidad (se cumplen todas las condiciones)
      coord.updateVisibility(true)
      await vi.dynamicImportSettled()
      expect(fetchCount).toBe(1)
    })

    it('11. una petición que termina después de ocultar no programa polling', async () => {
      let fetchCount = 0
      let resolveFetch: (value: FetchResult) => void = () => {}
      const coord = new CashierSalesCoordinator({
        limit: 15,
        fetchCall: () => {
          fetchCount++
          return new Promise((resolve) => { resolveFetch = resolve })
        },
        onStateChange: () => {},
        isTabVisible: true,
        isOnline: true,
      })

      coord.resetScope('u1', 'b1')
      expect(fetchCount).toBe(1)

      // Ocultar pestaña mientras la petición de carga inicial está en vuelo
      coord.updateVisibility(false)

      // Resolver petición
      resolveFetch({ items: [], page: { nextCursor: null, hasMore: false } })
      await vi.dynamicImportSettled()

      // Avanzar 30 segundos
      vi.advanceTimersByTime(30000)
      expect(fetchCount).toBe(1) // No debe haberse iniciado el polling de segundo plano
    })

    it('12. pollingStatus coincide con cada estado', async () => {
      const coord = new CashierSalesCoordinator({
        limit: 15,
        fetchCall: async () => ({ items: [], page: { nextCursor: null, hasMore: false } }),
        onStateChange: () => {},
        isTabVisible: true,
        isOnline: true,
      })

      coord.resetScope('u1', 'b1')
      await vi.dynamicImportSettled()
      expect(coord.state.pollingStatus).toBe('active')

      // Quedar offline
      coord.updateOnline(false)
      expect(coord.state.pollingStatus).toBe('offline')

      // Ocultar
      coord.updateOnline(true)
      coord.updateVisibility(false)
      expect(coord.state.pollingStatus).toBe('idle')

      // Pago crítico
      coord.updateVisibility(true)
      coord.updateCriticalPayment(true)
      expect(coord.state.pollingStatus).toBe('idle')
    })

    it('13. una petición que nunca responde sale de carga y muestra timeout', async () => {
      let requestWasAborted = false
      const coord = new CashierSalesCoordinator({
        limit: 15,
        fetchCall: (_params, signal) => {
          signal.addEventListener('abort', () => { requestWasAborted = true })
          return new Promise(() => {})
        },
        onStateChange: () => {},
        isTabVisible: true,
        isOnline: true,
      })

      coord.resetScope('u1', 'b1')
      expect(coord.state.status).toBe('loading')

      await vi.advanceTimersByTimeAsync(CASHIER_COORDINATOR_TIMEOUT_MS)

      expect(coord.state.status).toBe('error')
      expect(coord.state.errorMsg).toBe('Tiempo de espera agotado al cargar las ventas.')
      expect(coord.state.pollingStatus).toBe('error')
      expect(coord.state.lastUpdatedAt).not.toBeNull()
      expect(requestWasAborted).toBe(true)
      coord.destroy()
    })

    it('14. vuelve a cargar tras el ciclo de efectos de React StrictMode', async () => {
      let fetchCount = 0
      const coord = new CashierSalesCoordinator({
        limit: 15,
        fetchCall: (_params, signal) => {
          fetchCount += 1
          if (fetchCount === 1) {
            return new Promise((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
            })
          }
          return Promise.resolve({
            items: [],
            page: { nextCursor: null, hasMore: false },
          })
        },
        onStateChange: () => {},
      })

      coord.resetScope('u1', 'b1')
      expect(fetchCount).toBe(1)

      coord.destroy()
      expect(coord.isMounted()).toBe(false)

      coord.activate()
      coord.resetScope('u1', 'b1')
      await vi.dynamicImportSettled()

      expect(fetchCount).toBe(2)
      expect(coord.isMounted()).toBe(true)
      expect(coord.state.status).toBe('ready')
      expect(coord.state.lastUpdatedAt).not.toBeNull()
      coord.destroy()
    })
  })
})
