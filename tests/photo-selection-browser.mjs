// Real browser regression, synthetic HTTP fixture only. Never reaches a VPS/DB.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join, extname } from 'node:path'
import { createRequire } from 'node:module'
if (!process.env.BROWSER_TEST_MODULES) throw Error('Use the existing bundled browser runtime; do not install dependencies.')
const require = createRequire(join(process.env.BROWSER_TEST_MODULES, 'package.json'))
const { chromium } = require('playwright'), sharp = require('sharp')
const output = resolve('artifacts/photo-selection-20261010', process.env.PHOTO_TEST_PHASE ?? 'after')
await mkdir(output, { recursive: true })
const timestamp = '2026-10-10T12:00:00.000000Z', photos = new Map(), failures = [], checks = [], writes = []
let revision = 1, imageId = null, holdAccess = false, releaseAccess = null, failUpload = false, accessAllowed = true
const access = () => ({ schema_version: 1, user: { id: 2, email: 'manager@example.invalid', full_name: 'Gerente de ensayo' },
  access_state: 'ACTIVE', role: { id: 4, name: 'MANAGER', display_name: 'Gerente' }, branch: { id: 1, code: 'ENSAYO', name: 'Sucursal de ensayo', is_active: true },
  capabilities: accessAllowed ? ['MANAGE_PRODUCTS', 'MANAGE_INVENTORY', 'MANAGE_PRICES'] : [] })
const product = () => ({ id: 1, internal_code: 'TEST-PHOTO-001', barcode: null, common_name: 'Planta sintética', scientific_name: null,
  description: '', category_id: 1, price_cents: 0, effective_price_cents: 0, active_promotion: null, unit: 'pieza', is_active: false,
  watering_advice: '', light_type: '', recommended_climate: '', wholesale_price_cents: null, minimum_stock: '0.000',
  image: imageId ? { id: imageId, url: '/api/v1/images/'+imageId, alt_text: 'Planta sintética' } : null, created_at: timestamp, updated_at: timestamp })
const prep = { schema_version: 1, product_id: 1, branch_id: 1, commercial_state: 'PENDING', preparation_mode: 'PENDING',
  price_confirmed: false, initial_count_confirmed: false, activated: false, ready: false, legacy_compatibility: false,
  reasons: ['PRODUCT_PENDING', 'PRICE_PENDING', 'INITIAL_COUNT_PENDING', 'ACTIVATION_PENDING'] }
const json = (res, body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
const server = createServer(async(req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'), path = url.pathname
    if (path.startsWith('/api/')) {
      if (path === '/api/v1/auth/login') return json(res, { token_type: 'Bearer', access_token: 'm'.repeat(43), expires_in: 3600 })
      if (path === '/api/v1/auth/me') {
        if (holdAccess) { releaseAccess = () => { holdAccess = false; json(res, access()) }; return }
        return json(res, access())
      }
      if (path === '/api/v1/auth/logout') return json(res, { signed_out: true })
      if (path === '/api/v1/categories') return json(res, { items: [{ id: 1, name: 'Follaje sintético', description: '', is_active: true, created_at: timestamp, updated_at: timestamp }], next_after_id: null })
      if (path === '/api/v1/products') return json(res, { items: [product()], next_after_id: null })
      if (path === '/api/v1/products/1/edit-version') return json(res, { id: 1, revision })
      if (path === '/api/v1/products/1/preparation') return json(res, prep)
      if (path === '/api/v1/cataloging') return json(res, { items: [], next_after_id: null })
      if (path === '/api/v1/inventory/permissions') return json(res, { schema_version: 1, branch_id: 1, permissions: { can_record_count: true, can_receive: false, can_approve_counts: false } })
      if (path === '/api/v1/inventory/count-observations') return json(res, { schema_version: 1, branch_id: 1, permissions: { can_record_count: true, can_receive: false, can_approve_counts: false }, items: [], next_after_id: null })
      if (path === '/api/v1/inventory/dashboard') return json(res, { schema_version: 1, branch_id: 1, has_more: false, next_product_id: null, items: [] })
      if (path.startsWith('/api/v1/reports/')) return json(res, { items: [] })
      if (path === '/api/v1/admin/newsletter/campaigns') return json(res, { items: [] })
      if (path === '/api/v1/products/1/catalog-photo' && req.method === 'PUT') {
        const chunks = []; for await (const c of req) chunks.push(c)
        writes.push({ path, type: req.headers['content-type'] })
        if (failUpload) { failUpload = false; return json(res, { error: 'IMAGE_STORAGE_UNAVAILABLE' }, 503) }
        if (req.headers['if-match'] !== '"'+revision+'"') return json(res, { error: 'CATALOGING_EDIT_CONFLICT' }, 409)
        imageId = (imageId ?? 0)+1; photos.set(imageId, await sharp(Buffer.concat(chunks)).webp().toBuffer()); revision++
        return json(res, { id: 1 })
      }
      const photo = /^\/api\/v1\/images\/(\d+)$/.exec(path)
      if (photo && photos.has(Number(photo[1]))) { res.writeHead(200, { 'Content-Type': 'image/webp' }); return res.end(photos.get(Number(photo[1]))) }
      failures.push('Unexpected synthetic request: '+req.method+' '+path); return json(res, { error: 'NOT_FOUND' }, 404)
    }
    const dist = resolve('dist'), extension = extname(url.pathname), file = extension ? resolve(dist, '.'+decodeURIComponent(url.pathname)) : join(dist,'index.html')
    if (!file.startsWith(dist+String.fromCharCode(92)) && !file.startsWith(dist+'/')) throw Error('Unsafe static path')
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(file)] ?? 'application/octet-stream' }); res.end(await readFile(file))
  } catch { failures.push('Synthetic fixture failed'); json(res, { error: 'TEST_FIXTURE_ERROR' }, 500) }
})
await new Promise(r => server.listen(0,'127.0.0.1',r))
const origin = 'http://127.0.0.1:'+server.address().port
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await context.route('**/*', r => r.request().url().startsWith(origin+'/') || r.request().url().startsWith('blob:') ? r.continue() : r.abort())
  const page = await context.newPage(); page.on('pageerror', e => failures.push(String(e)))
  await page.goto(origin+'/login?returnTo=/admin')
  await page.getByLabel('Correo electrónico').fill('manager@example.invalid')
  await page.getByLabel('Contraseña', { exact: true }).fill('Synthetic-photo-only')
  await page.getByRole('button', { name: /Iniciar sesión/ }).click()
  await page.getByRole('button', { name: 'Abrir ficha de Planta sintética', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar ficha', exact: true }).waitFor()
  await page.waitForFunction(() => !document.querySelector('.plant-edit-form button[value=save]')?.disabled)
  await page.getByLabel('Nombre', { exact: true }).fill('Nombre editado sin guardar')
  const png = await sharp({create:{width:80,height:80,channels:3,background:'#476f4a'}}).png().toBuffer()
  const gallery = page.getByText('Elegir fotografía', { exact: true }).locator('input')
  await gallery.setInputFiles({ name: 'foto-sintetica.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('button', { name: 'Guardar fotografía', exact: true }).waitFor()
  assert.ok(await page.locator('.plant-photo-hero img').evaluate(img=>img.complete && img.naturalWidth>0))
  holdAccess = true
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await page.waitForResponse(r=>false, {timeout:100}).catch(()=>{})
  assert.ok(releaseAccess, 'focus must still trigger permission revalidation')
  assert.equal(await page.locator('.plant-photo-hero img').count(),1,'returning from picker must not unmount the selected photo')
  assert.equal(await page.getByLabel('Nombre', {exact:true}).inputValue(),'Nombre editado sin guardar')
  assert.ok(await page.getByRole('button',{name:'Guardar fotografía',exact:true}).evaluate(el=>!!el.closest('[inert]')),'actions must be inert while revalidating')
  releaseAccess()
  await page.waitForFunction(()=>!document.querySelector('[inert]'))
  assert.equal(await page.getByLabel('Nombre',{exact:true}).inputValue(),'Nombre editado sin guardar')
  checks.push('picker selection and unsaved form survive focus while permissions are revalidated; actions blocked')
  holdAccess = true; releaseAccess = null; await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await page.waitForFunction(()=>!!document.querySelector('[inert]'))
  await gallery.setInputFiles({name:'seleccion-al-volver.png',mimeType:'image/png',buffer:png})
  assert.ok((await page.locator('.plant-photo-pending').innerText()).includes('seleccion-al-volver.png'))
  releaseAccess();await page.waitForFunction(()=>!document.querySelector('[inert]'))
  await gallery.setInputFiles([])
  assert.equal(await page.getByRole('button',{name:'Guardar fotografía',exact:true}).count(),1)
  checks.push('focus before change also processes selection; picker cancel retains the previous photo')
  const snapshot = async name => { await page.evaluate(()=>{if(!document.getElementById('test-banner')){const p=document.createElement('p');p.id='test-banner';p.textContent='ENSAYO LOCAL · DATOS SINTÉTICOS';document.body.prepend(p)}});await page.screenshot({path:join(output,name),fullPage:true}) }
  await snapshot('preview-mobile.png')
  failUpload = true
  await page.getByRole('button',{name:'Guardar fotografía',exact:true}).click()
  await page.locator('.plant-photo-panel [role=alert]').waitFor()
  assert.equal(await page.locator('.plant-photo-hero img').count(),1)
  assert.equal(await page.getByLabel('Nombre',{exact:true}).inputValue(),'Nombre editado sin guardar')
  await page.getByRole('button',{name:'Guardar fotografía',exact:true}).click()
  await page.getByText('Fotografía guardada en el servidor.',{exact:true}).waitFor()
  await page.waitForFunction(()=>{const img=document.querySelector('.plant-photo-hero img');return img?.complete && img.naturalWidth>0})
  assert.equal(await page.getByRole('button',{name:'Guardar fotografía',exact:true}).count(),0)
  assert.ok(await page.locator('.plant-photo-panel').getByText('Fotografía guardada en el servidor.',{exact:true}).isVisible())
  await snapshot('saved-mobile.png')
  checks.push('upload failure is visible and preserves preview; success confirms server save and retrieves stored photo')
  await gallery.setInputFiles({name:'no-compatible.heic',mimeType:'image/heic',buffer:Buffer.from('synthetic')})
  await page.locator('.plant-photo-panel [role=alert]').waitFor()
  holdAccess = true; releaseAccess = null; await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await page.waitForFunction(()=>!!document.querySelector('[inert]'));releaseAccess()
  await page.waitForFunction(()=>!document.querySelector('[inert]'))
  assert.ok((await page.locator('.plant-photo-panel [role=alert]').innerText()).includes('JPEG'))
  assert.equal(writes.length,2)
  checks.push('invalid-file error survives picker focus and sends no upload')
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'mobile horizontal overflow')
  accessAllowed=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await page.getByText('No tienes permiso para acceder a Administración.',{exact:true}).waitFor()
  assert.equal(await page.locator('.plant-detail-page').count(),0)
  checks.push('revoked permissions remove the protected editor')
  assert.deepEqual(failures,[])
  await writeFile(join(output,'result.json'),JSON.stringify({status:'PASS',checks,productionAccess:false,writes},null,2))
  console.log(JSON.stringify({status:'PASS',checks}))
} catch(e) { if(browser){const page=browser.contexts()[0]?.pages()[0];if(page)await page.screenshot({path:join(output,'failure.png'),fullPage:true})}console.error(e);process.exitCode=1 }
finally{await browser?.close();await new Promise(r=>server.close(r))}
