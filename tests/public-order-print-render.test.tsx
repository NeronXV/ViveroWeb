import { it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { PublicOrderTicketContent } from '../src/features/public-orders/PublicOrderTicket'
import type { BackendOrderTicket } from '../src/features/public-orders/backend-order-service'
import { CashierPrintableTicket } from '../src/features/cashier/CashierPrintableTicket'
import { ProductQrLabelCard } from '../src/features/admin/ProductQrLabelCard'

const shortFormat = process.env.PUBLIC_TICKET_FOLIO_FORMAT === 'short-v1'
const order = { schema_version: 1 as const, id: 4, order_number: shortFormat ? 'VW-0004' : 'VW-4', status: 'PENDING' as const, total_cents: 240,
  created_at: '2026-10-09T18:00:00.000000Z', idempotent_replay: true }
const ticket: BackendOrderTicket = { schema_version: 1, order, branch: { id: 1, code: 'TEST', name: 'Sucursal de prueba' },
  subtotal_cents: 300, discount_cents: 60, items: [{ product_id: 2, product_name: 'Nombre al confirmar', quantity: 3,
    list_price_cents: 100, unit_price_cents: 80, line_total_cents: 240 }] }
it('can render reproducible short/long PDF and thermal fixtures with the actual component and full application CSS', () => {
  const directory = process.env.PUBLIC_TICKET_RENDER_DIR
  if (!directory) return
  mkdirSync(directory, { recursive: true })
  const css = readFileSync(resolve('src/styles/app.css'), 'utf8')
  const longItems = Array.from({ length: 25 }, (_, i) => ({ ...ticket.items[0], product_id: i + 1,
    product_name: (`Producto ${i + 1}: ` + 'Descripción histórica de la planta y su presentación '.repeat(3)).slice(0, 160) }))
  const long: BackendOrderTicket = { ...ticket, order: { ...order, total_cents: 6000 }, subtotal_cents: 7500, discount_cents: 1500, items: longItems }
  for (const [name, data, paper] of [['short', ticket, 'pdf'], ['long', long, 'pdf'], ['thermal', ticket, 'thermal'], ['thermal58', ticket, 'thermal58']] as const) {
    const content = renderToStaticMarkup(<PublicOrderTicketContent ticket={data} portal />).replace('public-order-ticket-portal', 'public-order-ticket-portal public-order-ticket-selected')
    writeFileSync(resolve(directory, `${name}.html`), `<!doctype html><html lang="es"><meta charset="utf-8"><style>${css}</style><body class="print-public-order print-public-order-${paper}"><div id="root"><h1>CATALOGO_AJENO_NO_IMPRIMIR</h1>${'<p>Contenido de catálogo ajeno</p>'.repeat(600)}</div>${content}</body></html>`)
  }
  const cashier = renderToStaticMarkup(<CashierPrintableTicket result={{ schemaVersion: 1, status: 'SUCCEEDED',
    sale: { id: '1', folio: shortFormat ? 'VD-0042' : 'VD-REGRESSION', createdAt: '2026-10-09T18:00:00Z', totalCents: 240, createdByLabel: 'Operador de prueba' },
    items: [{ id: '1', productName: 'Planta para Caja', quantity: 3, unitPriceCents: 80, lineTotalCents: 240 }],
    branch: { name: 'Sucursal de prueba' }, payment: { method: 'CASH', amountReceivedCents: 300, changeCents: 60,
      reference: null, createdAt: '2026-10-09T18:01:00Z' }, serverTime: '2026-10-09T18:01:01Z' }} />)
    .match(/<article[\s\S]*?<\/article>/)![0].replace('cashier-print-ticket', 'cashier-print-ticket cashier-ticket-selected')
  const label = renderToStaticMarkup(<ProductQrLabelCard label={{ commonName: 'Planta para etiqueta', internalCode: 'QR-REGRESSION', qrContent: 'QR-REGRESSION' }} />)
  const previousCss = execFileSync('git', ['show', 'HEAD:src/styles/app.css'], { encoding: 'utf8' })
  const hiddenPublicTicket = renderToStaticMarkup(<PublicOrderTicketContent ticket={ticket} portal />)
  for (const [revision, styles] of [['before', previousCss], ['after', css]]) {
    writeFileSync(resolve(directory, `cashier-${revision}.html`), `<!doctype html><meta charset="utf-8"><style>${styles}</style><body class="print-cashier-ticket"><div id="root">CATALOGO_AJENO_NO_IMPRIMIR</div>${cashier}${hiddenPublicTicket}</body>`)
    writeFileSync(resolve(directory, `labels-${revision}.html`), `<!doctype html><meta charset="utf-8"><style>${styles}</style><body class="print-product-labels"><div id="root">CATALOGO_AJENO_NO_IMPRIMIR</div><div class="product-label-dialog"><div class="product-label-dialog-content"><div class="product-label-print-root">${label}</div></div></div>${hiddenPublicTicket}</body>`)
  }
})
