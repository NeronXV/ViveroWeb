// Built Web app against a loopback-only, in-memory order contract double.
// No MariaDB, production requests, real customers, or dependency installation.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, join, extname, sep } from 'node:path'
import { createRequire } from 'node:module'

if (!process.env.BROWSER_TEST_MODULES) throw new Error('Provide the existing bundled BROWSER_TEST_MODULES runtime.')
const { chromium } = createRequire(join(process.env.BROWSER_TEST_MODULES, 'package.json'))('playwright')
const stamp = '2026-10-12T12:00:00.000000Z', attemptKey = 'viveroweb_backend_order_attempt_v1'
const products = [1, 2].map(id => ({ id, internal_code: `TEST-${id}`, barcode: null,
  common_name: id === 1 ? 'Planta sintética' : 'Planta alternativa', scientific_name: null, description: '', category_id: 1,
  price_cents: 100, effective_price_cents: 100, unit: 'pieza', is_active: true, watering_advice: '', light_type: '',
  recommended_climate: '', image: null, active_promotion: null }))
let state
function reset() { state = { price: 100, removed: false, ticketMissing: false, busy: false, orders: new Map(), posts: [] } }
reset()
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)) }
const quote = input => ({ schema_version: 1, branch_id: input.branch_id, subtotal_cents: state.price * input.items.reduce((n, i) => n + i.quantity, 0),
  discount_cents: 0, total_cents: state.price * input.items.reduce((n, i) => n + i.quantity, 0),
  items: input.items.map(i => ({ ...i, product_name: products[i.product_id - 1].common_name, internal_code: `TEST-${i.product_id}`,
    list_price_cents: state.price, unit_price_cents: state.price, promotion_id: null, promotion_name: null, line_total_cents: state.price * i.quantity })) })
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname
    if (path.startsWith('/api/')) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      const input = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null
      const key = req.headers['idempotency-key']
      if (path === '/api/v1/products') return json(res, { items: products, next_after_id: null })
      if (path === '/api/v1/categories') return json(res, { items: [{ id: 1, name: 'Prueba', description: '', is_active: true }], next_after_id: null })
      if (path === '/api/v1/web-orders/options') return json(res, { schema_version: 1, branches: [{ id: 1, code: 'TEST', name: 'Sucursal sintética' }] })
      if (path === '/api/v1/web-orders/quote') {
        if (state.removed && input.items.some(i => i.product_id === 1)) return json(res, { error: 'WEB_ORDER_ITEMS_UNAVAILABLE' }, 409)
        return json(res, quote(input))
      }
      if (path === '/api/v1/web-orders/recover' || path === '/api/v1/web-orders/ticket') {
        const saved = state.orders.get(key)
        if (!saved || (path.endsWith('/ticket') && state.ticketMissing)) return json(res, { error: 'WEB_ORDER_NOT_FOUND' }, 404)
        return json(res, path.endsWith('/ticket') ? saved.ticket : { ...saved.receipt, idempotent_replay: true })
      }
      if (path === '/api/v1/web-orders' && req.method === 'POST') {
        state.posts.push({ key, body: JSON.stringify(input) })
        if (state.busy) return json(res, { error: 'WEB_ORDER_BUSY' }, 503)
        const previous = state.orders.get(key)
        if (previous) return json(res, { ...previous.receipt, idempotent_replay: true })
        if (input.customer_phone === 'abc') return json(res, { error: 'WEB_ORDER_CUSTOMER_INVALID' }, 400)
        if (state.removed && input.items.some(i => i.product_id === 1)) return json(res, { error: 'WEB_ORDER_ITEMS_UNAVAILABLE' }, 409)
        const priced = quote(input)
        if (input.expected_total_cents !== priced.total_cents) return json(res, { error: 'WEB_ORDER_PRICE_CHANGED' }, 409)
        const id = state.orders.size + 1, receipt = { schema_version: 1, id, order_number: `VW-${id}`, status: 'PENDING',
          total_cents: priced.total_cents, created_at: stamp, idempotent_replay: false }
        const ticket = { schema_version: 1, order: receipt, branch: { id: 1, code: 'TEST', name: 'Sucursal sintética' },
          subtotal_cents: priced.subtotal_cents, discount_cents: 0, items: priced.items.map(({ internal_code, promotion_id, promotion_name, ...item }) => item) }
        state.orders.set(key, { receipt, ticket })
        return json(res, receipt, 201)
      }
      return json(res, { error: 'NOT_FOUND' }, 404)
    }
    const dist = resolve('dist'), extension = extname(path)
    const file = extension ? resolve(dist, '.' + decodeURIComponent(path)) : join(dist, 'index.html')
    if (!file.startsWith(dist + sep)) throw new Error('Invalid static path')
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(file)] ?? 'application/octet-stream' })
    res.end(await readFile(file))
  } catch { json(res, { error: 'SYNTHETIC_FIXTURE_FAILED' }, 500) }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${server.address().port}`, checks = [], failures = []
let browser, context
async function pageWithCart(phone = '55555555') {
  const page = await context.newPage()
  page.on('pageerror', error => failures.push(error.message))
  await page.goto(origin + '/catalogo')
  await page.locator('article').filter({ has: page.getByRole('heading', { name: 'Planta sintética', exact: true }) }).getByRole('button', { name: /Agregar/ }).click()
  await page.getByLabel('Nombre completo').fill('Cliente sintético')
  await page.getByLabel('Teléfono', { exact: true }).fill(phone)
  await page.getByRole('button', { name: 'Cotizar pedido', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar pedido con total cotizado', exact: true }).waitFor()
  return page
}
async function isolated(name, run) {
  reset()
  context = await browser.newContext()
  context.setDefaultTimeout(10000)
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') || route.request().url().startsWith('blob:') ? route.continue() : route.abort())
  try { await run(); checks.push(name); console.log(`PASS: ${name}`) } finally { await context.close() }
}
const pending = page => page.evaluate(key => localStorage.getItem(key), attemptKey)
const confirm = page => page.getByRole('button', { name: 'Confirmar pedido con total cotizado', exact: true }).click()
const recovered = page => page.getByRole('button', { name: 'Recuperar o reenviar pedido original', exact: true }).click()
const confirmed = page => page.locator('.cart-panel .public-order-receipt').waitFor()
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  await isolated('invalid phone can be corrected and quoted again', async () => {
    const page = await pageWithCart('abc'); await confirm(page)
    await page.getByRole('button', { name: 'Cotizar pedido', exact: true }).waitFor()
    assert.equal(await pending(page), null); assert.equal(await page.getByLabel('Teléfono', { exact: true }).inputValue(), 'abc')
    await page.getByLabel('Teléfono', { exact: true }).fill('55555555')
    await page.getByRole('button', { name: 'Cotizar pedido', exact: true }).click(); await confirm(page); await confirmed(page)
    assert.equal(state.orders.size, 1); assert.notEqual(state.posts[0].key, state.posts[1].key)
  })
  await isolated('price rejection invalidates the quotation', async () => {
    const page = await pageWithCart(); state.price = 125; await confirm(page)
    await page.getByRole('button', { name: 'Cotizar pedido', exact: true }).waitFor()
    assert.equal(await pending(page), null)
    await page.getByRole('button', { name: 'Cotizar pedido', exact: true }).click(); await confirm(page); await confirmed(page)
    assert.equal(state.orders.size, 1); assert.equal(JSON.parse(state.posts[1].body).expected_total_cents, 125)
  })
  await isolated('legacy invalid attempt restores contact after reload and can be corrected', async () => {
    const original = { key: 'a'.repeat(64), body: JSON.stringify({ branch_id: 1, items: [{ product_id: 1, quantity: 1 }],
      customer_name: 'Cliente sintético', customer_phone: 'abc', customer_email: null, notes: 'Nota conservada', expected_total_cents: 100 }) }
    await context.addInitScript(({ key, attempt }) => {
      localStorage.setItem(key, JSON.stringify({ schema_version: 1, authority: 'backend-api', attempt }))
      localStorage.setItem('viveroweb_public_cart_backend_v1', JSON.stringify([{ quantity: 1, product: { id: '1', name: 'Planta sintética', image: null, price: { amountCents: 100 } } }]))
    }, { key: attemptKey, attempt: original })
    const page = await context.newPage(); await page.goto(origin + '/catalogo')
    await page.getByRole('button', { name: /Ver carrito/ }).click(); await recovered(page)
    await page.getByRole('button', { name: 'Cotizar pedido', exact: true }).waitFor()
    assert.equal(await page.getByLabel('Teléfono', { exact: true }).inputValue(), 'abc')
    assert.equal(await page.getByLabel('Notas', { exact: false }).inputValue(), 'Nota conservada')
    assert.equal(await pending(page), null); assert.equal(state.posts[0].key, original.key)
    await page.getByLabel('Teléfono', { exact: true }).fill('55555555')
    await page.getByRole('button', { name: 'Cotizar pedido', exact: true }).click(); await confirm(page); await confirmed(page)
    assert.equal(state.orders.size, 1); assert.notEqual(state.posts[1].key, original.key)
  })
  await isolated('withdrawn product can be replaced after rejection', async () => {
    const page = await pageWithCart(); state.removed = true; await confirm(page)
    await page.getByRole('button', { name: 'Cotizar pedido', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Eliminar Planta sintética', exact: true }).click()
    await page.locator('.cart-panel').getByRole('button', { name: 'Cerrar carrito', exact: true }).click()
    await page.locator('article').filter({ has: page.getByRole('heading', { name: 'Planta alternativa', exact: true }) }).getByRole('button', { name: /Agregar/ }).click()
    await page.getByRole('button', { name: 'Cotizar pedido', exact: true }).click(); await confirm(page); await confirmed(page)
    assert.equal(state.orders.size, 1); assert.equal(JSON.parse(state.posts[1].body).items[0].product_id, 2)
  })
  await isolated('lost accepted response survives reload without another order', async () => {
    const page = await pageWithCart()
    let loseNext = true
    await page.route('**/api/v1/web-orders', async route => {
      if (!loseNext) return route.continue()
      loseNext = false
      await route.fetch() // The synthetic server commits, but the page loses the response.
      await route.abort('failed')
    })
    await confirm(page)
    await page.getByRole('button', { name: 'Recuperar o reenviar pedido original', exact: true }).waitFor()
    const original = await pending(page); assert.ok(original)
    await page.reload(); await page.getByRole('button', { name: /Ver carrito/ }).click()
    assert.equal(await pending(page), original); await recovered(page); await confirmed(page)
    assert.equal(state.orders.size, 1); assert.equal(state.posts.length, 1); assert.equal(await pending(page), null)
  })
  await isolated('confirmed order with missing ticket remains recoverable', async () => {
    const page = await pageWithCart(); state.ticketMissing = true; await confirm(page)
    await page.getByRole('button', { name: 'Recuperar comprobante', exact: true }).waitFor()
    const original = await pending(page); assert.ok(original)
    state.ticketMissing = false; await page.getByRole('button', { name: 'Recuperar comprobante', exact: true }).click(); await confirmed(page)
    assert.equal(state.orders.size, 1); assert.equal(state.posts.length, 1)
  })
  await isolated('not-found followed by unavailable submit preserves the original', async () => {
    const page = await pageWithCart()
    let loseNext = true
    await page.route('**/api/v1/web-orders', route => {
      if (!loseNext) return route.continue()
      loseNext = false; return route.abort('failed')
    })
    await confirm(page)
    await page.getByRole('button', { name: 'Recuperar o reenviar pedido original', exact: true }).waitFor()
    const original = await pending(page); state.busy = true; await recovered(page)
    await page.getByText('La tienda está procesando pedidos.', { exact: false }).waitFor()
    assert.equal(await pending(page), original); assert.equal(state.orders.size, 0)
    state.busy = false; await recovered(page); await confirmed(page)
    assert.equal(state.orders.size, 1); assert.ok(state.posts.every(post => post.key === state.posts[0].key && post.body === state.posts[0].body))
  })
  await isolated('two prepared tabs create one order', async () => {
    const first = await pageWithCart(), second = await pageWithCart()
    // Both confirmations were prepared before either tab persisted its attempt.
    await Promise.all([first, second].map(page => page.evaluate(() => document.querySelector('.web-order-form button[type=submit]')?.click())))
    await first.waitForFunction(() => localStorage.getItem('viveroweb_confirmed_order_ticket_v1') !== null)
    assert.equal(state.orders.size, 1); assert.equal(state.posts.length, 1)
  })
  assert.deepEqual(failures, [])
  console.log(`Public cart browser: ${checks.length} synthetic scenarios passed; external traffic blocked.`)
} finally {
  if (context) await context.close()
  if (browser) await browser.close()
  await new Promise(done => server.close(done))
}
