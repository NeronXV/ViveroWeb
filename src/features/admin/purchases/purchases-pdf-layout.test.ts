import { describe, expect, it } from 'vitest'
import { parseReceiptPages, pdfRows, type PdfTextCell } from './purchases-pdf-layout'
import { parseLineTokens, parseFreeTextList } from './purchases-extractor'

const cell = (str: string, x: number, y: number, width = 20): PdfTextCell => ({ str, width, transform: [8, 0, 0, 8, x, y] })
const header = [cell('Cant', 10, 800, 18), cell('Descripción', 34, 800, 45), cell('Total', 196, 800)]
// Synthetic supplier codes and plants; content stream deliberately writes total first.
const first = [cell('3', 18, 780), cell('$75.00', 186, 780), cell('1001 X01 PLANTA DEMO B4', 34, 780), cell('($ 25.00)', 34, 768)]
const second = [cell('2', 18, 750), cell('$90.00', 186, 750), cell('1002 2A-3 PLANTA', 34, 750), cell('DE ENSAYO B6 ($', 34, 738), cell('45.00)', 34, 726)]
const footer = [cell('TOTAL:', 100, 700), cell('$165.00', 186, 700), cell('Cliente: persona sintética', 34, 680)]

describe('receipt columns', () => {
  it('sorts coordinates, joins wrapped descriptions and unit prices, ignores watermark and footer', () => {
    const watermark = { ...cell('REIMPRESION', 30, 770), transform: [14, 14, -14, 14, 30, 770] }
    const result = parseReceiptPages([[watermark, ...header, ...first, ...second, ...footer]])!
    expect(result.items).toEqual([
      { lineNumber: 1, rawDescription: '1001 X01 PLANTA DEMO B4', suggestedCommonName: 'PLANTA DEMO', containerCode: 'B4', suggestedPresentation: 'B4', quantity: 3, unitCostCents: 2500 },
      { lineNumber: 2, rawDescription: '1002 2A-3 PLANTA DE ENSAYO B6', suggestedCommonName: 'PLANTA DE ENSAYO', containerCode: 'B6', suggestedPresentation: 'B6', quantity: 2, unitCostCents: 4500 },
    ])
    expect(result.documentTotalCents).toBe(16500)
    expect(result.warning).not.toContain('no se pudieron')
  })
  it('reads repeated headers on multiple pages without importing them as plants', () => {
    const result = parseReceiptPages([[...header, ...first], [...header, ...second, ...footer]])!
    expect(result.items).toHaveLength(2)
    expect(result.items.reduce((s, i) => s + i.quantity * i.unitCostCents, 0)).toBe(result.documentTotalCents)
  })
  it('keeps an incomplete row visible with a warning, never uses the line total as unit cost', () => {
    const result = parseReceiptPages([[...header, ...first.slice(0, 3), ...footer]])!
    expect(result.items[0].unitCostCents).toBe(0)
    expect(result.warning).toContain('partidas 1')
  })
  it('reports conflicting line totals even when the description and unit price are present', () => {
    const result = parseReceiptPages([[...header, ...first.map(c => c.str === '$75.00' ? { ...c, str: '$76.00' } : c), ...footer]])!
    expect(result.warning).toContain('partidas 1')
  })
  it('leaves other formats to the generic reader, using physical reading order', () => {
    expect(parseReceiptPages([first])).toBeNull()
    expect(pdfRows(first)[0].map(c => c.text)).toEqual(['3', '1001 X01 PLANTA DEMO B4', '$75.00'])
    expect(parseFreeTextList('3 Ficus M6 $25.00').items[0].unitCostCents).toBe(2500)
  })
  it('never interprets a header or an amount as a plant or supplier digits as money', () => {
    expect(parseLineTokens(['Cant', 'Descripción', 'Total'])).toBeNull()
    expect(parseLineTokens(['3', '$75.00', '1001 X01 PLANTA DEMO B4'])).toBeNull()
    expect(parseLineTokens(['3', 'Planta demo', '1001 X01 B4'])?.unitCostCents).toBe(0)
  })
})
