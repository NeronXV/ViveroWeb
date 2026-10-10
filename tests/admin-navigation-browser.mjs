// Real browser + built application, synthetic in-memory HTTP contract double.
// Never connects to MariaDB, the VPS, or production. No runtime demo mode.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join, extname } from 'node:path'
import { createRequire } from 'node:module'

const modules = process.env.BROWSER_TEST_MODULES
if (!modules) throw new Error('Provide BROWSER_TEST_MODULES pointing to the existing bundled runtime; do not install dependencies.')
const require = createRequire(join(modules, 'package.json'))
const { chromium } = require('playwright'), sharp = require('sharp')
const bundleRoot = resolve(process.env.BROWSER_TEST_DIST ?? 'dist')
const originHost = '127.0.0.1', output = resolve(process.env.BROWSER_TEST_OUTPUT ?? 'artifacts/admin-navigation-release/browser'), timestamp = '2026-10-10T12:00:00.000000Z'
await mkdir(output, { recursive: true })
const categories = ['Follaje', 'Floral', 'Arbolado', 'Arbustos y setos'].map((name, i) => ({ id: i + 1, name, description: '', is_active: true, created_at: timestamp, updated_at: timestamp }))
const photos = new Map()
photos.set(1, await sharp(await readFile('src/assets/monstera.png')).resize(700, 700, { fit: 'inside' }).webp().toBuffer())
photos.set(2, await sharp(await readFile('src/assets/snake_plant.png')).resize(700, 700, { fit: 'inside' }).webp().toBuffer())
photos.set(4, await sharp(await readFile('src/assets/succulent_garden.png')).resize(700, 700, { fit: 'inside' }).webp().toBuffer())
const products = [
  { id: 1, common_name: 'Monstera deliciosa', internal_code: 'FL-0001', category_id: 1, price_cents: 12550, imageId: 1, ready: true, stock: 12 },
  { id: 2, common_name: 'Sansevieria', internal_code: 'FL-0002', category_id: 1, price_cents: 0, imageId: 2, ready: false, stock: 0 },
  { id: 3, common_name: 'Lavanda', internal_code: 'FR-0003', category_id: 2, price_cents: 0, imageId: null, ready: false, stock: 2 },
  { id: 4, common_name: 'Jardín de suculentas', internal_code: 'FL-0004', category_id: 1, price_cents: 28000, imageId: 4, ready: true, stock: 8 },
  { id: 5, common_name: 'Olivo', internal_code: 'AR-0005', category_id: 3, price_cents: 0, imageId: null, ready: false, stock: 0 },
  { id: 6, common_name: 'Ficus benjamina', internal_code: 'AS-0006', category_id: 4, price_cents: 16500, imageId: null, ready: false, disabled: true, stock: 6 },
].map(p => ({ barcode: null, scientific_name: null, description: '', unit: 'pieza', watering_advice: '', light_type: '', recommended_climate: '',
  wholesale_price_cents: null, minimum_stock: '2.000', is_active: !p.disabled, created_at: timestamp, updated_at: timestamp, initialCount: p.ready, activated: p.ready, ...p }))
const observations = [], writes = [], requests = [], failures = [], checks = []
let failPhoto = false, loseCountResponse = false, imageSequence = 10, observationSequence = 1
const prep = p => {
  const reasons = [p.disabled && 'DISABLED', p.price_cents <= 0 && 'PRICE_PENDING', !p.initialCount && 'INITIAL_COUNT_PENDING', !p.activated && 'ACTIVATION_PENDING'].filter(Boolean)
  return { schema_version: 1, product_id: p.id, branch_id: 1, commercial_state: p.disabled ? 'DISABLED' : reasons.length ? 'IMPORTED_PENDING' : 'READY',
    preparation_mode: p.ready ? 'LEGACY' : 'PENDING', price_confirmed: p.price_cents > 0, initial_count_confirmed: !!p.initialCount,
    activated: !!p.activated, ready: !reasons.length, legacy_compatibility: !!p.ready, reasons }
}
const row = p => Object.fromEntries(Object.entries({ ...p, image: p.imageId ? { id: p.imageId, url: `/api/v1/images/${p.imageId}`, alt_text: p.common_name } : null,
  effective_price_cents: p.price_cents, active_promotion: null }).filter(([k]) => !['imageId', 'ready', 'stock', 'disabled', 'initialCount', 'activated'].includes(k)))
const json = (res, data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)) }
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'), path = url.pathname, method = req.method
    if (path.startsWith('/api/')) {
      requests.push({ path, method })
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      const bytes = Buffer.concat(chunks), body = req.headers['content-type']?.startsWith('application/json') && bytes.length ? JSON.parse(bytes) : {}
      const owner = req.headers.authorization === 'Bearer ' + 'o'.repeat(43), key = req.headers['idempotency-key']
      const permissions = { can_record_count: true, can_receive: owner, can_approve_counts: owner }
      if (path === '/api/v1/auth/login') return json(res, { token_type: 'Bearer', access_token: (body.email.startsWith('owner') ? 'o' : 'm').repeat(43), expires_in: 3600 })
      if (path === '/api/v1/auth/me') return json(res, { schema_version: 1, user: { id: owner ? 1 : 2, email: owner ? 'owner@example.invalid' : 'manager@example.invalid', full_name: owner ? 'Propietario de ensayo' : 'Gerente de ensayo' },
        access_state: 'ACTIVE', role: { id: owner ? 1 : 4, name: owner ? 'OWNER' : 'MANAGER', display_name: owner ? 'Propietario' : 'Gerente' },
        branch: { id: 1, code: 'ENSAYO', name: 'Vivero de ensayo', is_active: true }, capabilities: ['MANAGE_PRODUCTS', 'MANAGE_PRICES', 'MANAGE_INVENTORY', ...(owner ? ['VIEW_BRANCH_SALES', 'MANAGE_DISCOUNTS', 'MANAGE_SETTINGS', 'MANAGE_USERS', 'MANAGE_BRANCHES', 'ASSIGN_ROLES', 'OPERATE_CASHIER'] : [])] })
      if (path === '/api/v1/admin/branches') return json(res, { items: [{ id: 1, code: 'ENSAYO', name: 'Vivero de ensayo', is_active: true, active_staff_count: '3', pending_sale_count: '1', updated_at: timestamp }], next_after_id: null })
      if (path === '/api/v1/admin/staff') return json(res, { items: [], next_after_id: null })
      if (path === '/api/v1/admin/roles') return json(res, { schema_version: 1, actor_role: 'OWNER', items: [] })
      if (path === '/api/v1/auth/logout') return json(res, { signed_out: true })
      if (path === '/api/v1/suppliers') return json(res, { items: [], next_after_id: null })
      if (path === '/api/v1/supplier-purchases') return json(res, { branch_id: 1, items: [] })
      if (path === '/api/v1/cataloging') return json(res, { items: [], next_after_id: null })
      if (path === '/api/v1/inventory/activation') return json(res, { schema_version: 1, branch_id: 1, enabled: true })
      if (path === '/api/v1/categories') return json(res, { items: categories, next_after_id: null })
      if (path === '/api/v1/products') return json(res, { items: products.map(row), next_after_id: null })
      if (path === '/api/v1/admin/newsletter/campaigns' && method === 'GET') return json(res, { items: [] })
      if (path.startsWith('/api/v1/reports/')) return json(res, { items: [] })
      if (path === '/api/v1/inventory/permissions') return json(res, { schema_version: 1, branch_id: 1, permissions })
      if (path === '/api/v1/inventory/dashboard') return json(res, { schema_version: 1, branch_id: 1, has_more: false, next_product_id: null, items: products.map(p => ({
        product_id: p.id, product_name: p.common_name, product_code: p.internal_code, product_unit: p.unit,
        total_quantity: String(p.stock) + '.000', minimum_stock: p.minimum_stock, is_low_stock: p.stock <= Number(p.minimum_stock), balance_updated_at: timestamp,
      })) })
      if (path === '/api/v1/inventory/history') return json(res, { schema_version: 1, branch_id: 1, has_more: false, next_before_id: null, items: [] })
      if (path === '/api/v1/inventory/count-baseline') { const p = products.find(p => p.id === Number(url.searchParams.get('product_id'))); return json(res, { schema_version: 1, product_id: p.id, branch_id: 1, quantity: String(p.stock) + '.000', movement_id: 0 }) }
      if (path === '/api/v1/inventory/count-observations' && method === 'GET') return json(res, { schema_version: 1, branch_id: 1, permissions, items: observations.filter(o => o.status === 'PENDING'), next_after_id: null })
      if (path === '/api/v1/inventory/count-observations/result') {
        const found = observations.find(o => o.key === key)
        return found ? json(res, { ...found, idempotent_replay: true }) : json(res, { error: 'INVENTORY_OPERATION_NOT_FOUND' }, 404)
      }
      if (path === '/api/v1/inventory/count-observations' && method === 'POST') {
        const existing = observations.find(o => o.key === key)
        if (existing) return json(res, { ...existing, idempotent_replay: true })
        writes.push({ path, method, body, key })
        const result = { schema_version: 1, observation_id: observationSequence++, product_id: body.product_id, branch_id: 1,
          observed_quantity: body.counted_quantity, baseline_quantity: body.baseline_quantity, status: 'PENDING', reason: body.reason, idempotent_replay: false, key }
        observations.push(result)
        // Simulate an unusable/truncated response after committing the fixture.
        // Destroying a reused socket may trigger Chromium's transport retry.
        if (loseCountResponse) { loseCountResponse = false; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"truncated":'); return }
        return json(res, result, 201)
      }
      const decision = /^\/api\/v1\/inventory\/count-observations\/(\d+)$/.exec(path)
      if (decision) {
        if (!owner) return json(res, { error: 'INVENTORY_OWNER_REQUIRED' }, 403)
        const o = observations.find(o => o.observation_id === Number(decision[1])), p = products.find(p => p.id === o.product_id)
        if (o.status !== 'PENDING') return json(res, { ...o, idempotent_replay: true })
        writes.push({ path, method, body, key }); o.status = body.decision === 'REJECT' ? 'REJECTED' : 'APPLIED'
        if (body.decision === 'APPROVE') { p.stock = Number(o.observed_quantity); p.initialCount = true }
        return json(res, o, 201)
      }
      const productMatch = /^\/api\/v1\/products\/(\d+)(.*)$/.exec(path)
      if (productMatch) {
        const p = products.find(p => p.id === Number(productMatch[1])), tail = productMatch[2]
        if (tail === '/edit-version') return json(res, { id: p.id, revision: 1 })
        if (tail === '/preparation') return json(res, prep(p))
        if (tail === '/preparation/activate') { p.activated = true; p.is_active = true; return json(res, { ...prep(p), idempotent_replay: false }) }
        if (!tail && method === 'PATCH') { writes.push({ path, method, body }); Object.assign(p, body); return json(res, { id: p.id }) }
        if (tail === '/images' && method === 'POST') {
          if (failPhoto) { failPhoto = false; return json(res, { error: 'IMAGE_STORAGE_UNAVAILABLE' }, 503) }
          const id = imageSequence++; photos.set(id, bytes); writes.push({ path, method, image: true }); return json(res, { id, url: `/api/v1/images/${id}` }, 201)
        }
        const image = /^\/images\/(\d+)$/.exec(tail)
        if (image && method === 'PATCH') { p.imageId = Number(image[1]); return json(res, { id: p.imageId }) }
        if (image && method === 'DELETE') return json(res, { id: Number(image[1]) })
      }
      const image = /^\/api\/v1\/images\/(\d+)$/.exec(path)
      if (image && photos.has(Number(image[1]))) { res.writeHead(200, { 'Content-Type': 'image/webp' }); return res.end(photos.get(Number(image[1]))) }
      failures.push(`Unimplemented synthetic contract: ${method} ${path}`); return json(res, { error: 'NOT_FOUND' }, 404)
    }
    const extension = extname(path), file = extension ? resolve(bundleRoot, '.' + path) : resolve(bundleRoot, 'index.html')
    if (!file.startsWith(bundleRoot + '\\') && file !== resolve(bundleRoot, 'index.html')) return res.end()
    const data = await readFile(file)
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpeg': 'image/jpeg' })[extname(file)] ?? 'application/octet-stream' }); res.end(data)
  } catch (e) { failures.push(String(e)); json(res, { error: 'TEST_FIXTURE_ERROR' }, 500) }
})
await new Promise(resolve => server.listen(0, originHost, resolve))
const origin = `http://${originHost}:${server.address().port}`

let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') || route.request().url().startsWith('blob:') ? route.continue() : route.abort())
  const page = await context.newPage()
  page.on('pageerror', e => failures.push(String(e)))
  await page.goto(origin + '/login?returnTo=/admin')
  await page.getByLabel('Correo electrónico').fill('owner@example.invalid')
  await page.getByLabel('Contraseña', { exact: true }).fill('Synthetic-only-123!')
  await page.getByRole('button', { name: /Iniciar sesión/i }).click()
  const nav = page.getByRole('navigation', { name: 'Tareas del vivero' })
  await nav.waitFor()
  const direct = async path => page.evaluate(path => { history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate")) }, path)
  await page.getByRole('button', { name: 'Abrir ficha de Monstera deliciosa' }).click()
  await page.getByLabel('Nombre', { exact: true }).fill('Monstera con borrador sin guardar')
  await nav.locator('#admin-tab-stock').click()
  await page.getByRole('alertdialog', { name: 'Cambios sin guardar' }).waitFor()
  await page.getByRole('button', { name: 'Seguir aquí' }).click()
  assert.equal(await nav.locator('#admin-tab-inventario').getAttribute('aria-current'), 'page')
  await nav.locator('#admin-tab-stock').click()
  await page.getByRole('button', { name: 'Descartar y salir' }).click()
  checks.push('navigation preserves unsaved plant draft guard')
  const expected = await nav.locator('button, a').allTextContents()
  assert.equal(expected.length, 11)
  for (const tab of ['inventario', 'stock', 'compras', 'ventas', 'sucursales', 'personal', 'boletin']) {
    await nav.locator(`#admin-tab-${tab}`).click()
    await page.waitForFunction(id => document.querySelector(`#admin-tab-${id}`)?.getAttribute('aria-current') === 'page', tab)
    assert.deepEqual(await nav.locator('button, a').allTextContents(), expected)
    assert.equal(await nav.locator('[aria-current=page]').count(), 1)
    assert.ok(page.url().includes(`tab=${tab}`))
    if (tab === 'sucursales') {
      await page.getByRole('cell', { name: 'Vivero de ensayo', exact: true }).waitFor()
      assert.equal(await page.getByText('items[0].activeStaffCount no contiene un entero válido.', { exact: true }).count(), 0)
    }
    checks.push(`stable navigation and active destination: ${tab}`)
  }
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const tab of ['sucursales', 'inventario', 'stock']) {
      await direct(`/admin?tab=${tab}`)
      await nav.locator(`#admin-tab-${tab}[aria-current=page]`).waitFor()
      if (tab === 'sucursales') await page.getByRole('cell', { name: 'Vivero de ensayo', exact: true }).waitFor()
      if (tab === 'inventario') await page.getByRole('button', { name: 'Abrir ficha de Monstera deliciosa' }).waitFor()
      const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
      assert.ok(size.scroll <= size.width + 1, `${width}/${tab} overflows: ${JSON.stringify(size)}`)
      assert.deepEqual(await nav.locator('button, a').allTextContents(), expected)
      for (const target of await nav.locator('button, a').all()) {
        assert.ok(await target.isVisible())
        assert.ok((await target.boundingBox()).height >= 48)
      }
      await page.screenshot({ path: join(output, `${width}-${tab}.png`), fullPage: true, animations: 'disabled' })
      checks.push(`direct URL, visible options, touch targets, no overflow: ${width}/${tab}`)
    }
  }
  await nav.getByRole('link', { name: 'Caja', exact: true }).click()
  await page.waitForURL('**/caja')
  checks.push('Caja retains /caja route')
  await direct('/admin?tab=stock')
  await nav.locator('#admin-tab-stock[aria-current=page]').waitFor()
  await page.locator('.admin-session-menu > summary').click()
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await page.goto(origin + '/admin?tab=sucursales')
  await page.waitForURL('**/login?returnTo=/admin')
  checks.push('full direct URL without in-memory session retains login protection')
  await page.getByLabel('Correo electrónico').fill('manager@example.invalid')
  await page.getByLabel('Contraseña', { exact: true }).fill('Synthetic-only-123!')
  await page.getByRole('button', { name: /Iniciar sesión/i }).click()
  await direct('/admin?tab=sucursales')
  await nav.locator('#admin-tab-inventario[aria-current=page]').waitFor()
  assert.equal(await nav.locator('#admin-tab-sucursales').count(), 0)
  assert.equal(await nav.getByRole('link', { name: 'Caja', exact: true }).count(), 0)
  assert.equal(await nav.locator('#admin-tab-compras').count(), 1)
  await nav.locator('#admin-tab-stock').click()
  await nav.locator('#admin-tab-stock[aria-current=page]').waitFor()
  assert.equal(await page.getByRole('button', { name: /Registrar entrada/ }).count(), 0)
  checks.push('restricted manager: unauthorized direct URL falls back; reception actions and Caja remain guarded')
  assert.ok(!writes.length, 'Navigation validation must not write commercial data')
  const allowedErrors = failures.filter(x => !x.includes('/api/v1/cashier/'))
  assert.deepEqual(allowedErrors, [])
  await writeFile(join(output, 'results.json'), JSON.stringify({ checks, requests, writes, failures, synthetic: true }, null, 2))
  console.log(JSON.stringify({ status: 'PASS', checks: checks.length, commercialWrites: writes.length }))
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
