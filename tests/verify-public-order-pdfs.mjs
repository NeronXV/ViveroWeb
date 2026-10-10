// Run after rendering the fixtures in public-order-print-render.test.tsx with
// Chrome --headless --no-pdf-header-footer --print-to-pdf=<absolute output>.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const directory = process.argv[2];
const orderFolio = process.argv[3] ?? 'VW-4';
if (!directory) throw new Error('Provide the synthetic PDF fixture directory');
async function inspect(name) {
  const pdf = await getDocument({ data: new Uint8Array(await readFile(resolve(directory, `${name}.pdf`))), useSystemFonts: true }).promise;
  let text = '';
  for (let n = 1; n <= pdf.numPages; n++) text += ' ' + (await (await pdf.getPage(n)).getTextContent()).items.map(item => item.str ?? '').join(' ');
  assert.ok(!text.includes('CATALOGO_AJENO') && !text.includes('Contenido de catálogo'), `${name}: foreign catalog content`);
  return { pages: pdf.numPages, dimensions: (await pdf.getPage(1)).view, text };
}
for (const name of ['short', 'long', 'thermal', 'thermal58']) {
  const result = await inspect(name);
  assert.equal(result.pages, name === 'long' ? 3 : 1);
  for (const value of [orderFolio, 'Sucursal de prueba', 'Pendiente de pago en sucursal', name === 'long' ? '60.00' : '2.40']) assert.ok(result.text.includes(value), `${name}: missing ${value}`);
  if (name === 'long') for (let i = 1; i <= 25; i++) assert.ok(result.text.includes(`Producto ${i}:`), `Missing product ${i}`);
  console.log(`${name}: ${result.pages} pages; receipt content verified; catalog excluded`);
}
for (const name of ['cashier', 'labels']) {
  const before = await inspect(`${name}-before`), after = await inspect(`${name}-after`);
  assert.deepEqual(after, before, `${name}: print regression`);
  assert.ok(!after.text.includes(orderFolio), `${name}: public receipt leaked`);
  console.log(`${name}: same page count, paper dimensions and text as HEAD CSS; public receipt excluded`);
}
