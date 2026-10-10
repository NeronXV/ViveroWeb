import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { createBackendAuthService } from '../src/features/auth/backend-auth-service'
import { bindBackendSession } from '../src/features/auth/backend-runtime'
import { createBackendCounterAttempt, createBackendCounterSaleService, readBackendCounterAttempt } from '../src/features/cashier/backend-counter-sale-service'
import { createBackendCashierService, createBackendPaymentAttempt, readBackendPaymentAttempt, saveBackendPaymentAttempt } from '../src/features/cashier/backend-cashier-service'
import { createBackendCashierOperationAttempt, createBackendCashierOperationsService, finishBackendCashierOperationAttempt } from '../src/features/cashier/backend-cashier-operations-service'
import { createSupplierPurchaseDraft, readPendingSupplierPurchaseDraft, retireSupplierPurchaseDraft, resolveSupplierPurchaseItem, confirmSupplierPurchase } from '../src/features/admin/purchases/purchases-service'

const fixturePath = process.env.VIVERO_WEB_HTTP_FIXTURE

// Opt-in: a fresh synthetic fixture, never an operational account or remote API.
it.skipIf(!fixturePath)('local HTTP: login, scan, lost sale/payment responses, purchases, refund and closing', async () => {
  const origin = process.env.VIVERO_WEB_HTTP_ORIGIN
  if (origin !== 'http://127.0.0.1:33003') throw new Error('Only the isolated local Compose is allowed')
  const fixture = JSON.parse(readFileSync(fixturePath!, 'utf8')) as {
    email: string; password: string; userId: number; branchId: number; productId: number; code: string
  }
  const network = fetch
  let dropResponseFor: string | null = null
  const request: typeof fetch = async (input, init) => {
    const path = String(input)
    if (!path.startsWith('/api/v1/')) throw new Error('Unexpected request destination')
    const response = await network(origin + path, init)
    if (path === dropResponseFor && response.ok) {
      dropResponseFor = null
      throw new Error('Synthetic response loss after server commit')
    }
    return response
  }
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const exclusive = async <T,>(_name: string, action: () => Promise<T>) => action()
  vi.stubGlobal('fetch', request)
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('navigator', { locks: { request: exclusive } })
  const auth = createBackendAuthService(request)
  let token: string | null = null
  let unbind = () => {}
  try {
    const session = await auth.login(fixture.email, fixture.password)
    token = session.accessToken
    const context = await auth.context(token, fixture.userId)
    expect(context.branch?.id).toBe(fixture.branchId)
    expect(context.capabilities).toContain('OPERATE_CASHIER')
    unbind = bindBackendSession(() => ({ session: { ...session, userId: context.user.id, expiresAt: Date.now() + 3600000 },
      context, status: 'authenticated', accessStatus: 'ready', busy: false, error: null }))
    const identity = { userId: fixture.userId, branchId: fixture.branchId }
    const counter = createBackendCounterSaleService(request, exclusive)
    expect((await counter.scan(token, fixture.code))?.id).toBe(fixture.productId)
    const items = [{ product_id: fixture.productId, quantity: 2 }]
    expect((await counter.quote(token, identity.branchId, items)).total_cents).toBe(1000)
    const attempt = createBackendCounterAttempt(identity.userId, identity.branchId, { items, expected_total_cents: 1000 })
    dropResponseFor = '/api/v1/sales'
    await expect(counter.submit(token, attempt, storage)).rejects.toMatchObject({ resultUncertain: true })
    const pending = readBackendCounterAttempt(storage, identity.userId, identity.branchId)!
    expect(pending.key).toBe(attempt.key)
    const sale = await createBackendCounterSaleService(request, exclusive).recover(token, pending)
    expect((await counter.submit(token, pending, storage)).id).toBe(sale.id)
    const cashier = createBackendCashierService(request)
    const claim = await cashier.claim(token, sale.id)
    const paymentAttempt = createBackendPaymentAttempt(sale.id, identity.userId, identity.branchId,
      { claim_token: claim.claim_token, method: 'CASH', amount_received_cents: 1200, reference: null })
    saveBackendPaymentAttempt(storage, paymentAttempt)
    dropResponseFor = `/api/v1/cashier/sales/${sale.id}/payments`
    await expect(cashier.pay(token, paymentAttempt)).rejects.toMatchObject({ resultUncertain: true })
    const payment = await createBackendCashierService(request).recover(token, readBackendPaymentAttempt(storage, identity.userId, identity.branchId)!)
    expect(payment.payment.change_cents).toBe(200)
    expect((await cashier.pay(token, paymentAttempt)).payment.id).toBe(payment.payment.id)
    expect((await cashier.receipt(token, payment.payment.id, identity)).payment.id).toBe(payment.payment.id)

    // A rejected draft must be fenced, retain source lines, and admit corrected data.
    const supplierResponse = await request('/api/v1/suppliers', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: `HTTP-${fixture.userId}`, name: 'Proveedor sintético HTTP', is_active: true }) })
    expect(supplierResponse.status).toBe(201)
    const supplierId = (await supplierResponse.json()).supplier.id as number
    const draft = { supplierId: String(supplierId), documentDate: '2026-10-09', externalReference: null, paymentTerms: 'CASH' as const,
      expectedTotalCents: 100, sourceFileName: 'synthetic.csv', idempotencyKey: crypto.randomUUID(),
      items: [{ lineNumber: 1, rawDescription: 'Planta sintética HTTP', containerCode: 'M1', suggestedCommonName: null, suggestedPresentation: null, quantity: 1, unitCostCents: 100 }] }
    const updateSupplier = async (active: boolean) => {
      const response = await request(`/api/v1/suppliers/${supplierId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: `HTTP-${fixture.userId}`, name: 'Proveedor sintético HTTP', is_active: active }) })
      expect(response.ok).toBe(true)
    }
    await updateSupplier(false)
    await expect(createSupplierPurchaseDraft(draft)).rejects.toThrow()
    expect(readPendingSupplierPurchaseDraft()).toEqual(draft)
    expect(await retireSupplierPurchaseDraft(undefined, draft.idempotencyKey)).toBeNull()
    await updateSupplier(true)
    const purchase = await createSupplierPurchaseDraft({ ...draft, idempotencyKey: crypto.randomUUID() })
    await resolveSupplierPurchaseItem({ purchaseId: purchase.id, itemId: purchase.items[0].id, resolution: 'MATCHED', productId: String(fixture.productId), normalizedName: null, presentation: null })
    const confirmation = { purchaseId: purchase.id, confirmationKey: crypto.randomUUID() }
    expect((await confirmSupplierPurchase(confirmation)).status).toBe('RECEIVED')
    expect((await confirmSupplierPurchase(confirmation)).status).toBe('RECEIVED')

    const operations = createBackendCashierOperationsService(request, exclusive)
    const refundAttempt = createBackendCashierOperationAttempt(identity, 'refund', { reason: 'Devolución sintética HTTP', method: 'CASH', restock: true, money_returned: true }, sale.id)
    const refund = await operations.submit(token, refundAttempt, storage)
    const replayedRefund = await operations.submit(token, refundAttempt, storage)
    if (!('refund' in refund) || !('refund' in replayedRefund)) throw new Error('Expected refund receipts')
    expect(replayedRefund.refund).toEqual(refund.refund)
    // Retain operation journals until the validated receipt has been checked.
    await finishBackendCashierOperationAttempt(storage, refundAttempt, exclusive)
    const closingAttempt = createBackendCashierOperationAttempt(identity, 'closing', { opening_cash_cents: 0, counted_cash_cents: 0 })
    const closing = await operations.submit(token, closingAttempt, storage)
    if (!('closing' in closing)) throw new Error('Expected closing receipt')
    expect((await operations.recoverClosing(token, closingAttempt)).closing).toEqual(closing.closing)
    expect(closing.payment_ids).toEqual([payment.payment.id])
    expect(closing.refund_ids).toHaveLength(1)
  } finally {
    if (token) await auth.logout(token)
    unbind()
    vi.unstubAllGlobals()
  }
}, 60000)
