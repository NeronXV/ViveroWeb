import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

// Usage: node scripts/verify-backend-cashier-operations.mjs APP_ROOT ENV_FILE PROJECT API_PORT
// Requires the caller to start an isolated local Compose API first. No real data.
const [appRootArg, envArg, project, portArg] = process.argv.slice(2)
if (!appRootArg || !envArg || !/^vivero-fresh-[a-z0-9]+$/.test(project ?? '') || !/^\d{4,5}$/.test(portArg ?? '')) throw new Error('Explicit isolated local arguments required')
const port = Number(portArg)
assert.ok(port > 1024 && port < 65536)
const appRoot = path.resolve(appRootArg), envFile = path.resolve(envArg)
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))
const helper = path.join(appRoot, 'backend/test/web-cashier-operations-fixture.js')
function fixtureCommand(mode, fixture) {
  const result = spawnSync('docker', ['compose', '--env-file', envFile, '-p', project, '-f', path.join(appRoot, 'infra/docker/compose.yaml'), '--profile', 'test', 'run', '-T', '--no-deps', '--rm', '-v', `${helper}:/app/test/web-cashier-operations-fixture.js:ro`, 'tests', 'node', 'test/web-cashier-operations-fixture.js', mode], { encoding: 'utf8', input: fixture ? JSON.stringify(fixture) : undefined, timeout: 60000 })
  // stdout may contain the synthetic session token: don't echo command output.
  if (result.error || result.status !== 0) throw new Error(`Local fixture ${mode} failed; exit ${result.status}`)
  return mode === 'create' ? JSON.parse(result.stdout.trim()) : null
}
function storageFrom(values = new Map()) {
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}
let fixture, server
try {
  fixture = fixtureCommand('create')
  process.env.BACKEND_PROXY_TARGET = `http://127.0.0.1:${port}`
  server = await createServer({ server: { port: 5173, strictPort: true } })
  await server.listen()
  const request = (url, options) => fetch(`http://localhost:5173${url}`, { ...options, headers: { ...options.headers, Origin: 'http://localhost:5173', 'Sec-Fetch-Site': 'same-origin' } })
  const module = await server.ssrLoadModule('/src/features/cashier/backend-cashier-operations-service.ts')
  let tail = Promise.resolve()
  const exclusive = (_name, action) => { const result = tail.then(action); tail = result.then(() => undefined, () => undefined); return result }
  const service = module.createBackendCashierOperationsService(request, exclusive)
  const identity = { userId: fixture.userId, branchId: fixture.branchId }, values = new Map(), storage = storageFrom(values)
  const preview = await service.refundPreview(fixture.token, identity, fixture.saleId)
  assert.equal(preview.amount_cents, 900); assert.equal(preview.already_refunded, false)
  const refund = module.createBackendCashierOperationAttempt(identity, 'refund', { reason: 'Devolucion demo contrato Web', method: 'CASH', restock: false, money_returned: true }, fixture.saleId)
  const cashier = (await server.ssrLoadModule('/src/features/cashier/backend-cashier-service.ts')).createBackendCashierService(request)
  const history = await cashier.receipts(fixture.token, { limit: 1 })
  assert.equal(history.items[0].id, fixture.paymentId)
  const original = await cashier.receipt(fixture.token, fixture.paymentId, identity)
  assert.equal(original.payment.change_cents, 100); assert.equal(original.refund, null)
  const located = await service.refundLookup(fixture.token, identity, `WOPS-${fixture.suffix}`)
  assert.equal(located.sale_id, fixture.saleId)
  let lost = false
  const loseResponse = async (url, options) => { const response = await request(url, options); if (!lost && url.endsWith('/refunds') && options.method === 'POST') { assert.equal(response.status, 201); lost = true; throw new TypeError('Synthetic lost response') } return response }
  await assert.rejects(module.createBackendCashierOperationsService(loseResponse, exclusive).submit(fixture.token, refund, storage), error => error.resultUncertain === true)
  const restored = module.readBackendCashierOperationAttempt(storageFrom(values), identity)
  assert.equal(restored.key, refund.key); assert.equal(restored.body, refund.body)
  const refunded = await service.submit(fixture.token, restored, storage)
  assert.equal(refunded.refund.amount_cents, 900); assert.equal(refunded.idempotent_replay, true)
  const closing = module.createBackendCashierOperationAttempt(identity, 'closing', { opening_cash_cents: 100, counted_cash_cents: 90 })
  await assert.rejects(service.submit(fixture.token, closing, storage), error => error.code === 'PENDING_ATTEMPT')
  await module.finishBackendCashierOperationAttempt(storage, refund, exclusive)
  const pending = await service.closingPreview(fixture.token, identity)
  assert.equal(pending.payment_count, 1); assert.equal(pending.refund_count, 1)
  const closed = await service.submit(fixture.token, closing, storage)
  assert.equal(closed.closing.expected_cash_cents, 100); assert.equal(closed.closing.difference_cents, -10)
  assert.deepEqual(closed.payment_ids, [fixture.paymentId]); assert.deepEqual(closed.refund_ids, [refunded.refund.id])
  const restoredClosing = module.readBackendCashierOperationAttempt(storageFrom(values), identity)
  const recovered = await service.recoverClosing(fixture.token, restoredClosing)
  const replay = await service.submit(fixture.token, restoredClosing, storage)
  assert.equal(recovered.closing.id, closed.closing.id); assert.equal(recovered.idempotent_replay, true)
  assert.equal(replay.closing.id, closed.closing.id); assert.equal(replay.idempotent_replay, true)
  const detail = await service.closingDetail(fixture.token, identity, closed.closing.id)
  assert.deepEqual(detail.refund_ids, closed.refund_ids)
  const after = await service.closingPreview(fixture.token, identity)
  assert.equal(after.payment_count, 0); assert.equal(after.refund_count, 0)
  const historical = await cashier.receipt(fixture.token, fixture.paymentId, identity)
  assert.equal(historical.refund.id, refunded.refund.id)
  assert.equal(historical.refund.amount_cents, 900)
  assert.equal((await service.refundLookup(fixture.token, identity, `WOPS-${fixture.suffix}`)).already_refunded, true)
  fixtureCommand('verify', fixture)
  await module.finishBackendCashierOperationAttempt(storage, closing, exclusive)
  assert.equal(module.readBackendCashierOperationAttempt(storage, identity), null)
  console.log('Web → Vite proxy → API → MariaDB: refund lost-response/replay, pending guard, closing/detail/recovery, receipt history/lookup, exact cents and SQL uniqueness passed.')
} finally {
  try { if (server) await server.close() } finally { if (fixture) { fixtureCommand('cleanup', fixture); console.log('Synthetic fixtures cleaned; existing data preserved.') } }
}
