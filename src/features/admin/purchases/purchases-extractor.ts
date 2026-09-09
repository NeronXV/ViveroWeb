import type { PurchaseSourceItem } from './purchases-types'
import { pesosToCents } from './purchases-parser'

export interface ExtractorResult {
  items: PurchaseSourceItem[]
  warning?: string | null
}

export function parseManualOrPasteJson(jsonText: string): ExtractorResult {
  const trimmed = jsonText.trim()
  if (!trimmed) {
    throw new Error('El texto proporcionado está vacío.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('El contenido no es un JSON válido.')
  }

  const array = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && 'items' in parsed && Array.isArray((parsed as { items: unknown }).items)
      ? (parsed as { items: unknown[] }).items
      : null

  if (!array) {
    throw new Error('El JSON debe ser un arreglo de renglones o un objeto con la propiedad "items".')
  }

  const items: PurchaseSourceItem[] = []

  array.forEach((row, index) => {
    if (typeof row !== 'object' || row === null) return

    const r = row as Record<string, unknown>
    const rawDescription = String(r.rawDescription ?? r.raw_description ?? r.description ?? r.descripcion ?? '').trim()
    const containerCode = String(r.containerCode ?? r.container_code ?? r.presentation ?? r.codigo ?? r.contenedor ?? 'GEN').trim().toUpperCase()
    const suggestedCommonName = (r.suggestedCommonName ?? r.suggested_common_name ?? r.commonName ?? r.nombre) ? String(r.suggestedCommonName ?? r.suggested_common_name ?? r.commonName ?? r.nombre).trim() : null
    const suggestedPresentation = (r.suggestedPresentation ?? r.suggested_presentation ?? r.presentacion) ? String(r.suggestedPresentation ?? r.suggested_presentation ?? r.presentacion).trim() : null

    const rawQty = Number(r.quantity ?? r.cantidad ?? 1)
    const quantity = Math.max(1, Math.round(Number.isFinite(rawQty) ? rawQty : 1))

    let unitCostCents = 0
    if (r.unitCostCents !== undefined) {
      unitCostCents = Math.round(Number(r.unitCostCents))
    } else if (r.unit_cost_cents !== undefined) {
      unitCostCents = Math.round(Number(r.unit_cost_cents))
    } else if (r.unitCost !== undefined || r.costo_unitario !== undefined || r.costo !== undefined || r.precio !== undefined) {
      const p = r.unitCost ?? r.costo_unitario ?? r.costo ?? r.precio
      unitCostCents = pesosToCents(typeof p === 'number' || typeof p === 'string' ? p : 0)
    }

    if (rawDescription) {
      items.push({
        lineNumber: index + 1,
        rawDescription,
        containerCode: containerCode || 'GEN',
        suggestedCommonName,
        suggestedPresentation,
        quantity,
        unitCostCents: Math.max(0, unitCostCents),
      })
    }
  })

  if (items.length === 0) {
    throw new Error('No se encontraron renglones utilizables en el JSON.')
  }

  return { items }
}

export function parseCsv(csvText: string): ExtractorResult {
  const trimmed = csvText.trim()
  if (!trimmed) {
    throw new Error('El contenido CSV está vacío.')
  }

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0)
  if (lines.length < 1) {
    throw new Error('El archivo CSV no contiene líneas de datos.')
  }

  // Detect delimiter
  const firstLine = lines[0]
  let delimiter = ','
  if (firstLine.includes('\t')) delimiter = '\t'
  else if (firstLine.includes(';')) delimiter = ';'

  const parseLine = (line: string): string[] => {
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === delimiter && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim())
    return values
  }

  const headerCells = parseLine(firstLine).map((h) => h.toLowerCase())
  const hasHeader = headerCells.some((h) =>
    h.includes('desc') || h.includes('cant') || h.includes('cost') || h.includes('nom') || h.includes('prod')
  )

  const dataLines = hasHeader ? lines.slice(1) : lines
  const descIndex = headerCells.findIndex((h) => h.includes('desc') || h.includes('prod') || h.includes('articulo') || h.includes('concepto'))
  const qtyIndex = headerCells.findIndex((h) => h.includes('cant') || h.includes('qty') || h.includes('unidades'))
  const costIndex = headerCells.findIndex((h) => h.includes('cost') || h.includes('unit') || h.includes('precio') || h.includes('importe'))
  const codeIndex = headerCells.findIndex((h) => h.includes('codigo') || h.includes('code') || h.includes('cont') || h.includes('medida'))

  const items: PurchaseSourceItem[] = []

  dataLines.forEach((line) => {
    const cells = parseLine(line)
    if (cells.length === 0 || cells.every((c) => !c)) return

    let rawDescription = ''
    let containerCode = 'GEN'
    let quantity = 1
    let unitCostCents = 0

    if (hasHeader && descIndex !== -1) {
      rawDescription = cells[descIndex] || ''
      if (qtyIndex !== -1 && cells[qtyIndex]) {
        quantity = Math.max(1, Math.round(Number(cells[qtyIndex].replace(/[^0-9.-]+/g, '')) || 1))
      }
      if (costIndex !== -1 && cells[costIndex]) {
        unitCostCents = pesosToCents(cells[costIndex])
      }
      if (codeIndex !== -1 && cells[codeIndex]) {
        containerCode = cells[codeIndex].toUpperCase()
      }
    } else {
      // Positional fallback: Description, Container, Quantity, UnitCost
      rawDescription = cells[0] || ''
      if (cells[1]) {
        const maybeQty = Number(cells[1].replace(/[^0-9.-]+/g, ''))
        if (!isNaN(maybeQty) && maybeQty > 0) {
          quantity = Math.round(maybeQty)
          if (cells[2]) unitCostCents = pesosToCents(cells[2])
        } else {
          containerCode = cells[1].toUpperCase()
          if (cells[2]) quantity = Math.max(1, Math.round(Number(cells[2].replace(/[^0-9.-]+/g, '')) || 1))
          if (cells[3]) unitCostCents = pesosToCents(cells[3])
        }
      }
    }

    if (rawDescription.trim()) {
      items.push({
        lineNumber: items.length + 1,
        rawDescription: rawDescription.trim(),
        containerCode: containerCode || 'GEN',
        suggestedCommonName: null,
        suggestedPresentation: null,
        quantity,
        unitCostCents: Math.max(0, unitCostCents),
      })
    }
  })

  if (items.length === 0) {
    throw new Error('No se encontraron renglones válidos en el archivo CSV.')
  }

  return { items }
}

export async function extractFromLocalPdf(file: File): Promise<ExtractorResult> {
  try {
    const pdfjsLib = await import('pdfjs-dist')
    if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.mjs',
          import.meta.url
        ).toString()
      } catch {
        // fallback
      }
    }

    const arrayBuffer = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
    })

    const pdf = await loadingTask.promise
    const maxPages = Math.min(pdf.numPages, 10)
    const textLines: string[] = []

    for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum)
      const textContent = await page.getTextContent()
      const items = textContent.items as Array<{ str?: string }>
      let currentLine = ''

      for (const item of items) {
        if (typeof item.str === 'string') {
          currentLine += ' ' + item.str
        }
      }
      textLines.push(currentLine)
    }

    const fullText = textLines.join('\n')
    if (!fullText.trim()) {
      return {
        items: [],
        warning: 'No pudimos extraer los renglones automáticamente. Puedes capturarlos o pegarlos manualmente.',
      }
    }

    // Attempt simple heuristic extraction of invoice lines:
    // Looks for patterns like "10 CLOROFITO M10 $60.00" or similar
    const candidateLines = fullText
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 5)

    const items: PurchaseSourceItem[] = []

    for (const line of candidateLines) {
      // Regex looking for: Quantity (integer), Description, Optional Container, Price
      const match = line.match(/^(\d+)\s+([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ\s.-]+?)(?:\s+([A-Z0-9-]{2,6}))?\s+\$?([0-9]+(?:\.[0-9]{1,2})?)$/i)
      if (match) {
        const qty = parseInt(match[1], 10)
        const desc = match[2].trim()
        const container = match[3] ? match[3].toUpperCase() : 'GEN'
        const costPesos = match[4]

        if (desc && qty > 0) {
          items.push({
            lineNumber: items.length + 1,
            rawDescription: desc,
            containerCode: container,
            suggestedCommonName: desc,
            suggestedPresentation: container !== 'GEN' ? container : null,
            quantity: qty,
            unitCostCents: pesosToCents(costPesos),
          })
        }
      }
    }

    if (items.length === 0) {
      return {
        items: [],
        warning: 'No pudimos extraer los renglones automáticamente. Puedes capturarlos o pegarlos manualmente.',
      }
    }

    return { items }
  } catch {
    return {
      items: [],
      warning: 'No pudimos extraer los renglones automáticamente. Puedes capturarlos o pegarlos manualmente.',
    }
  }
}
