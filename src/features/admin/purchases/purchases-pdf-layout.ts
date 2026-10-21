import type { ExtractorResult } from './purchases-extractor'
import { isPlantDescription, readMoney } from './reception-review'

export interface PdfTextCell { str: string; transform: number[]; width: number }
type Cell = { text: string; x: number; y: number; width: number }

export function pdfRows(items: PdfTextCell[]): Cell[][] {
  // PDF content-stream order is not reading order. Ignore rotated watermarks.
  const cells = items.filter(i => i.str.trim() && i.transform.length >= 6 && Math.abs(i.transform[1]) < 0.1 && Math.abs(i.transform[2]) < 0.1)
    .map(i => ({ text: i.str.trim(), x: i.transform[4], y: i.transform[5], width: i.width }))
    .sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: Cell[][] = []
  for (const cell of cells) {
    const previous = rows.at(-1)
    if (previous && Math.abs(previous[0].y - cell.y) <= 2) previous.push(cell)
    else rows.push([cell])
  }
  return rows.map(row => row.sort((a, b) => a.x - b.x))
}

// Thermal tickets with Cant / Descripción / Total and ($ unit cost) in description.
// A null result leaves other existing PDF formats to the generic reader.
export function parseReceiptPages(pages: PdfTextCell[][]): ExtractorResult | null {
  const items: ExtractorResult['items'] = []
  const issues: number[] = []
  let columns: { description: number; total: number } | null = null
  let recognized = false, ended = false
  let documentTotalCents: number | undefined
  let pending: { quantity: number; description: string[]; total: number | null } | null = null
  const finish = () => {
    if (!pending) return
    const text = pending.description.join(' ').replace(/\s+/g, ' ').trim()
    const price = text.match(/\(\s*\$\s*([\d,.]+)\s*\)\s*$/)
    const unitCostCents = price ? readMoney(price[1]) : null
    const rawDescription = text.replace(/\(\s*\$.*$/, '').trim()
    const withoutCodes = rawDescription.replace(/^\d+\s+(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]+\s+/i, '')
    const container = withoutCodes.match(/\s+([BMG]\d+[A-Z]?)$/i)
    const name = container ? withoutCodes.slice(0, container.index).trim() : withoutCodes
    const lineNumber = items.length + 1
    if (!isPlantDescription(name) || unitCostCents === null || pending.total === null || pending.quantity * unitCostCents !== pending.total) issues.push(lineNumber)
    items.push({ lineNumber, rawDescription: rawDescription || 'Descripción por revisar', containerCode: container?.[1].toUpperCase() ?? 'GEN', suggestedCommonName: isPlantDescription(name) ? name : null,
      suggestedPresentation: container?.[1].toUpperCase() ?? null, quantity: pending.quantity, unitCostCents: unitCostCents ?? 0 })
    pending = null
  }
  for (const page of pages) {
    for (const row of pdfRows(page)) {
      const qtyHeader = row.find(c => /^cant(?:idad)?\.?$/i.test(c.text))
      const descHeader = row.find(c => /^descripci[oó]n$/i.test(c.text))
      const totalHeader = row.find(c => /^total$/i.test(c.text))
      if (qtyHeader && descHeader && totalHeader && row.length === 3 && qtyHeader.x < descHeader.x && descHeader.x < totalHeader.x) {
        recognized = true
        columns = { description: (qtyHeader.x + qtyHeader.width + descHeader.x) / 2, total: (descHeader.x + totalHeader.x) / 2 }
        continue
      }
      if (!columns || ended) continue
      const text = row.map(c => c.text).join(' ')
      const total = text.match(/^TOTAL\s*:\s*(\$?\s*[\d,.]+)$/i)
      if (total) { finish(); documentTotalCents = readMoney(total[1]) ?? undefined; ended = true; continue }
      if (/^(?:su pago|cliente|m[eé]todo|folio|atendi[oó]|favor de)\b/i.test(text)) { finish(); ended = true; continue }
      if (/^[-_\s]+$/.test(text)) continue
      const qty = row.filter(c => c.x < columns!.description).map(c => c.text).join('')
      const totalCell = row.find(c => c.x > columns!.total && readMoney(c.text) !== null)
      const description = row.filter(c => c.x >= columns!.description && c !== totalCell).map(c => c.text).join(' ')
      if (/^\d+$/.test(qty)) {
        finish()
        pending = { quantity: Number(qty), description: [description], total: totalCell ? readMoney(totalCell.text) : null }
      } else if (!qty && pending && description) pending.description.push(description)
    }
  }
  finish()
  if (!recognized) return null
  const warning = issues.length ? `Revisa las partidas ${issues.join(', ')}: no se pudieron comprobar sus descripciones o importes. Corrige los datos con el documento antes de guardar.`
    : 'Compara las plantas y cantidades con el documento; las coincidencias del catálogo requieren tu selección.'
  return { items, documentTotalCents, warning }
}
