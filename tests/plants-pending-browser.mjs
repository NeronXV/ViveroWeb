// Built Web with synthetic HTTP responses. No real accounts or database writes.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, join, extname, sep } from 'node:path'
import { createRequire } from 'node:module'

if (!process.env.BROWSER_TEST_MODULES) throw new Error('Set BROWSER_TEST_MODULES to the existing bundled runtime.')
const require = createRequire(join(process.env.BROWSER_TEST_MODULES, 'package.json'))
const { chromium } = require('playwright')
const timestamp = '2026-10-17T12:00:00Z'
const fields = () => ({ approved_name: '', presentation: '', category_id: null, internal_code: '', scientific_name: '', description: '', barcode: '' })
const draft = id => ({ id, original_name: `Planta de ensayo ${id}`, fields: fields(), status: 'DRAFT', revision: 1, product_id: null, has_image: false, updated_by: 1, updated_at: timestamp, source_evidence: null })
const drafts = Array.from({ length: 177 }, (_, i) => draft(i + 1))
const writes = [], failures = []
let failCataloging = false
const product = { id: 1, common_name: 'Producto de ensayo', internal_code: 'ENS-001', barcode: null, scientific_name: null, description: '', category_id: 1,
  price_cents: 0, wholesale_price_cents: null, minimum_stock: '0.000', unit: 'pieza', watering_advice: '', light_type: '', recommended_climate: '', is_active: false,
  created_at: timestamp, updated_at: timestamp, image: null, effective_price_cents: 0, active_promotion: null }
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)) }
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'), path = url.pathname
    if (path.startsWith('/api/')) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk)
      const bytes = Buffer.concat(chunks), body = bytes.length ? JSON.parse(bytes) : {}
      if (req.method !== 'GET' && path !== '/api/v1/auth/login') writes.push({ path, body })
      if (path === '/api/v1/auth/login') return json(res, { token_type: 'Bearer', access_token: 'm'.repeat(43), expires_in: 3600 })
      if (path === '/api/v1/auth/me') return json(res, { schema_version: 1,
        user: { id: 1, email: 'manager@example.invalid', full_name: 'Gerente de ensayo' }, access_state: 'ACTIVE',
        role: { id: 4, name: 'MANAGER', display_name: 'Gerente' }, branch: { id: 1, code: 'ENSAYO', name: 'Sucursal de ensayo', is_active: true },
        capabilities: ['MANAGE_PRODUCTS', 'MANAGE_PRICES'] })
      if (path === '/api/v1/categories') return json(res, { items: [{ id: 1, name: 'Ensayo', description: '', is_active: true, created_at: timestamp, updated_at: timestamp }], next_after_id: null })
      if (path === '/api/v1/products') return json(res, { items: [product], next_after_id: null })
      if (path.startsWith('/api/v1/reports/')) return json(res, { items: [] })
      if (path === '/api/v1/products/1/preparation') return json(res, { schema_version: 1, product_id: 1, branch_id: 1, commercial_state: 'PENDING', ready: false,
        price_confirmed: false, initial_count_confirmed: false, activated: false, legacy_compatibility: false, reasons: ['PRICE_PENDING', 'INITIAL_COUNT_PENDING'] })
      if (path === '/api/v1/cataloging' && req.method === 'POST') {
        const created = { ...draft(drafts.length + 1), original_name: body.original_name, fields: body.fields }
        drafts.push(created); return json(res, created, 201)
      }
      if (path === '/api/v1/cataloging') {
        if (failCataloging) return json(res, { error: 'SERVICE_UNAVAILABLE' }, 503)
        const after = Number(url.searchParams.get('after_id') || 0), items = drafts.filter(d => d.id > after).slice(0, 100)
        return json(res, { items, next_after_id: drafts.some(d => d.id > items.at(-1)?.id) ? items.at(-1).id : null })
      }
      const match = /^\/api\/v1\/cataloging\/(\d+)$/.exec(path)
      if (match) return json(res, drafts.find(d => d.id === Number(match[1])))
      failures.push(`Unexpected request: ${req.method} ${path}`); return json(res, { error: 'NOT_FOUND' }, 404)
    }
    const file = extname(path) ? resolve('dist', '.' + path) : resolve('dist/index.html')
    if (!file.startsWith(resolve('dist') + sep)) return res.end()
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] ?? 'application/octet-stream' })
    res.end(await readFile(file))
  } catch (error) { failures.push(String(error)); json(res, { error: 'FIXTURE_ERROR' }, 500) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort())
  page.on('pageerror', error => failures.push(String(error)))
  await page.goto(origin + '/login?returnTo=/admin')
  await page.getByLabel('Correo electrónico').fill('manager@example.invalid')
  await page.getByLabel('Contraseña', { exact: true }).fill('Synthetic-only-password')
  await page.getByRole('button', { name: /Iniciar sesión/i }).click()
  await page.getByRole('button', { name: 'Completar plantas pendientes (178) →', exact: true }).waitFor()
  assert.equal(await page.locator('.plant-card').count(), 178)
  await page.getByRole('button', { name: 'Completar plantas pendientes (178) →', exact: true }).click()
  await page.waitForURL(url => url.searchParams.get('pending') === '1')
  assert.equal(new URL(page.url()).searchParams.get('pending'), '1')
  assert.equal(await page.locator('.cataloging-wizard').count(), 0)
  assert.equal(writes.length, 0, 'Browsing pending plants must not create a draft')
  await page.getByRole('button', { name: 'Completar planta Planta de ensayo 130', exact: true }).click()
  await page.getByRole('heading', { name: 'Completar identificación', exact: true }).waitFor()
  assert.equal(await page.getByLabel('Nombre comercial o común *', { exact: true }).inputValue(), 'Planta de ensayo 130')
  await page.getByRole('button', { name: '✕ Guardar y salir', exact: true }).click()
  await page.getByRole('searchbox').fill('Planta de ensayo 177')
  await page.getByRole('button', { name: 'Completar planta Planta de ensayo 177', exact: true }).waitFor()
  assert.equal(await page.locator('.plant-card').count(), 1)
  await page.getByRole('button', { name: 'Completar plantas pendientes (178) →', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('input[type="search"]')?.value === '')
  assert.equal(await page.getByRole('searchbox').inputValue(), '')
  assert.equal(await page.locator('.plant-card').count(), 178)
  await page.getByRole('button', { name: '+ Nueva planta', exact: true }).click()
  await page.getByRole('heading', { name: 'Registrar una nueva planta', exact: true }).waitFor()
  assert.equal(writes.length, 1)
  assert.equal(writes[0].path, '/api/v1/cataloging')
  assert.equal(new URL(page.url()).searchParams.get('cataloging'), '178')
  await page.getByRole('button', { name: '✕ Guardar y salir', exact: true }).click()
  await page.getByRole('button', { name: 'Completar plantas pendientes (179) →', exact: true }).waitFor()
  failCataloging = true
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await page.getByRole('button', { name: 'Reintentar pendientes', exact: true }).waitFor()
  assert.equal(await page.getByText('No hay plantas en esta selección', { exact: true }).count(), 0)
  failCataloging = false
  await page.getByRole('button', { name: 'Reintentar pendientes', exact: true }).click()
  await page.getByRole('button', { name: 'Completar plantas pendientes (179) →', exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'Mobile overflow')
  await mkdir('artifacts/plants-pending-review', { recursive: true })
  await page.screenshot({ path: 'artifacts/plants-pending-review/mobile.png', fullPage: false })
  assert.deepEqual(failures, [])
  console.log('PASS: 178 visible pending records, pagination, selection, search, distinct creation, recovery and mobile layout; no inventory writes.')
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
