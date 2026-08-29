import { describe, expect, it, vi } from 'vitest'
import { formatCents, parsePesosToCents } from './cashier-money'
import {
  attachSucceededResult,
  createPaymentAttempt,
  getPaymentAttemptStorageKey,
  isNavigationLocked,
  loadPaymentAttempt,
  parseStoredPaymentAttempt,
  restoreInterruptedAttempt,
  savePaymentAttempt,
  withPaymentAttemptLock,
} from './cashier-payment-state'
import type { CashierPaymentResultResponse } from './cashier-types'

const USER_ID = '22000000-0000-0000-0000-000000000001'
const OTHER_USER_ID = '22000000-0000-0000-0000-000000000002'
const SALE_ID = '52000000-0000-0000-0000-000000000001'
const IDEMPOTENCY_KEY = '73000000-0000-0000-0000-000000000001'
const CLAIM_TOKEN = '83000000-0000-0000-0000-000000000001'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

function canonicalResult(): CashierPaymentResultResponse {
  return {
    schemaVersion: 1,
    status: 'SUCCEEDED',
    sale: {
      id: SALE_ID,
      folio: 'VD-001',
      createdAt: '2026-08-28T09:00:00Z',
      totalCents: 15050,
      createdByLabel: 'Ana Ventas',
    },
    items: [{
      id: '53000000-0000-0000-0000-000000000001',
      productName: 'Producto capturado',
      quantity: 1,
      unitPriceCents: 15050,
      lineTotalCents: 15050,
    }],
    branch: { name: 'Web Centro' },
    payment: {
      method: 'CASH',
      amountReceivedCents: 20000,
      changeCents: 4950,
      reference: null,
      createdAt: '2026-08-28T09:03:00Z',
    },
    serverTime: '2026-08-28T09:05:00Z',
  }
}

describe('dinero de Caja', () => {
  it('convierte pesos decimales a centavos sin punto flotante', () => {
    expect(parsePesosToCents('150')).toBe(15000)
    expect(parsePesosToCents('150.5')).toBe(15050)
    expect(parsePesosToCents('150.50')).toBe(15050)
    expect(formatCents(4950)).toBe('49.50')
  })

  it.each(['', '0', '-1', '+1', '1,00', '1.001', '1e3', '.50', ' 1.00'])('rechaza el formato ambiguo o inválido %s', (value) => {
    expect(() => parsePesosToCents(value)).toThrow()
  })

  it('rechaza importes fuera del entero seguro', () => {
    expect(() => parsePesosToCents('90071992547410.00')).toThrow()
  })
})

describe('persistencia de intentos de pago', () => {
  it('persiste una sola idempotencyKey por usuario y venta', () => {
    const storage = createStorage()
    const attempt = createPaymentAttempt(USER_ID, SALE_ID, IDEMPOTENCY_KEY)
    savePaymentAttempt(storage, attempt)

    expect(loadPaymentAttempt(storage, USER_ID, SALE_ID)).toEqual(attempt)
    expect(getPaymentAttemptStorageKey(USER_ID, SALE_ID)).not.toBe(
      getPaymentAttemptStorageKey(OTHER_USER_ID, SALE_ID),
    )
    expect(loadPaymentAttempt(storage, OTHER_USER_ID, SALE_ID)).toBeNull()
  })

  it('rechaza versiones antiguas, identidades distintas y JSON malformado', () => {
    const attempt = createPaymentAttempt(USER_ID, SALE_ID, IDEMPOTENCY_KEY)
    expect(() => parseStoredPaymentAttempt(JSON.stringify({ ...attempt, version: 1 }), USER_ID, SALE_ID)).toThrow()
    expect(() => parseStoredPaymentAttempt(JSON.stringify(attempt), OTHER_USER_ID, SALE_ID)).toThrow()
    expect(() => parseStoredPaymentAttempt('{', USER_ID, SALE_ID)).toThrow()
  })

  it('restaura CONFIRMING como UNCERTAIN sin reemplazar la clave ni el payload', () => {
    const interrupted = {
      ...createPaymentAttempt(USER_ID, SALE_ID, IDEMPOTENCY_KEY),
      status: 'CONFIRMING' as const,
      claimToken: CLAIM_TOKEN,
      claimExpiresAt: '2026-08-28T09:05:00Z',
      method: 'CASH' as const,
      amountReceivedCents: 20000,
    }
    const restored = restoreInterruptedAttempt(interrupted)
    expect(restored.status).toBe('UNCERTAIN')
    expect(restored.idempotencyKey).toBe(IDEMPOTENCY_KEY)
    expect(restored.amountReceivedCents).toBe(20000)
    expect(isNavigationLocked(restored.status)).toBe(true)
  })

  it('solo marca SUCCEEDED con el comprobante canónico completo', () => {
    const confirming = {
      ...createPaymentAttempt(USER_ID, SALE_ID, IDEMPOTENCY_KEY),
      status: 'CONFIRMING' as const,
      claimToken: CLAIM_TOKEN,
      method: 'CASH' as const,
      amountReceivedCents: 20000,
    }
    const succeeded = attachSucceededResult(confirming, canonicalResult())
    expect(succeeded.status).toBe('SUCCEEDED')
    expect(succeeded.paymentResult?.items?.[0].productName).toBe('Producto capturado')
    expect(isNavigationLocked(succeeded.status)).toBe(false)
  })

  it('rechaza un comprobante canónico perteneciente a otra venta', () => {
    const confirming = {
      ...createPaymentAttempt(USER_ID, SALE_ID, IDEMPOTENCY_KEY),
      status: 'CONFIRMING' as const,
      claimToken: CLAIM_TOKEN,
    }
    const otherSaleResult = canonicalResult()
    otherSaleResult.sale = { ...otherSaleResult.sale!, id: '52000000-0000-0000-0000-000000000002' }

    expect(() => attachSucceededResult(confirming, otherSaleResult)).toThrow('otra venta')
  })
})

describe('bloqueo entre pestañas', () => {
  it('rechaza una segunda operación cuando el lock no está disponible', async () => {
    const callback = vi.fn(async () => true)
    const busyManager = {
      request: async <T,>(
        _name: string,
        _options: { mode: 'exclusive'; ifAvailable: true },
        lockCallback: (lock: unknown | null) => Promise<T | undefined>,
      ) => lockCallback(null),
    }
    await expect(withPaymentAttemptLock(USER_ID, SALE_ID, callback, busyManager)).rejects.toThrow('otra pestaña')
    expect(callback).not.toHaveBeenCalled()
  })

  it('ejecuta una sola vez dentro de un lock exclusivo adquirido', async () => {
    const callback = vi.fn(async () => 'ok')
    const availableManager = {
      request: async <T,>(
        _name: string,
        _options: { mode: 'exclusive'; ifAvailable: true },
        lockCallback: (lock: unknown | null) => Promise<T | undefined>,
      ) => lockCallback({}),
    }
    await expect(withPaymentAttemptLock(USER_ID, SALE_ID, callback, availableManager)).resolves.toBe('ok')
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
