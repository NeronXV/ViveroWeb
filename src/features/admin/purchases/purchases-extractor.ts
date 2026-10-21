import type { PurchaseSourceItem } from './purchases-types'
import { pesosToCents } from './purchases-parser'
import { isPlantDescription, readMoney } from './reception-review'
import { parseReceiptPages, pdfRows, type PdfTextCell } from './purchases-pdf-layout'

export interface ExtractorResult {
  items: PurchaseSourceItem[]
  documentTotalCents?: number
  warning?: string | null
}

const COMMON_CONTAINERS = new Set([
  'B2', 'B3', 'B4', 'B6', 'B10', 'B20', 'G5',
  'M4', 'M5', 'M6', 'M7', 'M8', 'M10', 'M12', 'M14', 'M16', 'M18', 'M20',
  'BOLSA', 'B3L', 'B5L', 'B10L', 'CHAROLA', 'COLGANTE', 'CANASTA', 'C10', 'C12',
  'CH72', 'CH128', 'CH200', 'TUBO', 'POTE', 'GAL', 'GEN',
])

export function parseLineTokens(cells: string[]): {
  rawDescription: string
  containerCode: string
  suggestedCommonName: string | null
  suggestedPresentation: string | null
  quantity: number
  unitCostCents: number
} | null {
  const cleanCells = cells.map(c => c.trim()).filter(Boolean)
  if (cleanCells.length === 0) return null

  let rawDescription = ''
  let containerCode = 'GEN'
  let quantity = 0
  let unitCostCents = 0

  if (cleanCells.length >= 3) {
    // Attempt 1: First is quantity, then description, then price
    const maybeFirstQty = Number(cleanCells[0].replace(/[^0-9]/g, ''))
    if (!Number.isNaN(maybeFirstQty) && maybeFirstQty > 0 && /^\d+$/.test(cleanCells[0])) {
      quantity = maybeFirstQty
      rawDescription = cleanCells[1]
      // Check if cell 2 is container
      if (cleanCells.length >= 4 && COMMON_CONTAINERS.has(cleanCells[2].toUpperCase())) {
        containerCode = cleanCells[2].toUpperCase()
        unitCostCents = (readMoney(cleanCells[3]) ?? 0)
      } else {
        unitCostCents = (readMoney(cleanCells[cleanCells.length - 1]) ?? 0)
      }
    } else {
      // Attempt 2: First is description, then container/quantity, then price
      rawDescription = cleanCells[0]
      const secondIsContainer = COMMON_CONTAINERS.has(cleanCells[1].toUpperCase())
      if (secondIsContainer) {
        containerCode = cleanCells[1].toUpperCase()
        if (cleanCells[2]) {
          const qty = /^\d+$/.test(cleanCells[2]) ? Number(cleanCells[2]) : NaN
          if (qty > 0) quantity = qty
        }
        if (cleanCells[3]) {
          unitCostCents = (readMoney(cleanCells[3]) ?? 0)
        }
      } else {
        const maybeQty = /^\d+$/.test(cleanCells[1]) ? Number(cleanCells[1]) : NaN
        if (maybeQty > 0) quantity = maybeQty
        if (cleanCells[2]) unitCostCents = (readMoney(cleanCells[2]) ?? 0)
      }
    }
  } else if (cleanCells.length === 2) {
    const firstIsQty = /^\d+$/.test(cleanCells[0])
    if (firstIsQty) {
      quantity = Number(cleanCells[0])
      rawDescription = cleanCells[1]
    } else {
      rawDescription = cleanCells[0]
      const secondIsQty = /^\d+$/.test(cleanCells[1])
      if (secondIsQty) quantity = Number(cleanCells[1])
      else unitCostCents = (readMoney(cleanCells[1]) ?? 0)
    }
  }

  if (!isPlantDescription(rawDescription)) return null

  // Extract container from description if still GEN
  if (containerCode === 'GEN') {
    const words = rawDescription.split(/\s+/)
    for (const w of words) {
      const up = w.toUpperCase()
      if (COMMON_CONTAINERS.has(up)) {
        containerCode = up
        break
      }
    }
  }

  return {
    rawDescription: rawDescription.trim(),
    containerCode,
    suggestedCommonName: rawDescription.trim(),
    suggestedPresentation: containerCode !== 'GEN' ? containerCode : null,
    quantity,
    unitCostCents: Math.max(0, unitCostCents),
  }
}

export function parseSingleLineText(line: string): {
  rawDescription: string
  containerCode: string
  suggestedCommonName: string | null
  suggestedPresentation: string | null
  quantity: number
  unitCostCents: number
} | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length < 3) return null

  // Check pipe or tab separated first
  if (trimmed.includes('|')) {
    return parseLineTokens(trimmed.split('|'))
  }
  if (trimmed.includes('\t')) {
    return parseLineTokens(trimmed.split('\t'))
  }

  // Regex pattern 1: "10 Ficus benjamina M6 $45.00" or "10 x Ficus benjamina $45"
  const m1 = trimmed.match(/^(\d+)\s*(?:x\s*)?([A-Za-z0-9ÁÉÍÓÚáéíóúñÑüÜ\s,.-]+?)(?:\s+([A-Za-z0-9-]{2,8}))?\s+(?:[$]\s*)?([0-9]+(?:\.[0-9]{1,2})?)$/i)
  if (m1) {
    const qty = parseInt(m1[1], 10)
    let desc = m1[2].trim()
    let container = m1[3] ? m1[3].toUpperCase() : 'GEN'
    const costPesos = m1[4]

    // If container isn't a known container, maybe it was part of the description
    if (container !== 'GEN' && !COMMON_CONTAINERS.has(container)) {
      desc = `${desc} ${container}`.trim()
      container = 'GEN'
    }

    if (isPlantDescription(desc) && qty > 0) {
      return {
        rawDescription: desc,
        containerCode: container,
        suggestedCommonName: desc,
        suggestedPresentation: container !== 'GEN' ? container : null,
        quantity: qty,
        unitCostCents: pesosToCents(costPesos),
      }
    }
  }

  // Regex pattern 2: "Ficus benjamina - 10 - $45.00"
  const m2 = trimmed.match(/^([A-Za-z0-9ÁÉÍÓÚáéíóúñÑüÜ\s,.-]+?)\s*[-:]\s*(\d+)\s*(?:pzas?|unid(?:ades)?)?\s*[-:]\s*(?:[$]\s*)?([0-9]+(?:\.[0-9]{1,2})?)$/i)
  if (m2) {
    const desc = m2[1].trim()
    const qty = parseInt(m2[2], 10)
    const costPesos = m2[3]

    if (isPlantDescription(desc) && qty > 0) {
      return {
        rawDescription: desc,
        containerCode: 'GEN',
        suggestedCommonName: desc,
        suggestedPresentation: null,
        quantity: qty,
        unitCostCents: pesosToCents(costPesos),
      }
    }
  }

  // Fallback: split by multiple spaces
  const parts = trimmed.split(/\s{2,}/)
  if (parts.length >= 2) {
    return parseLineTokens(parts)
  }

  return null
}

export function parseFreeTextList(text: string): ExtractorResult {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('El texto proporcionado está vacío.')
  }

  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const items: PurchaseSourceItem[] = []

  for (const line of lines) {
    const parsed = parseSingleLineText(line)
    if (parsed) {
      items.push({
        lineNumber: items.length + 1,
        ...parsed,
      })
    }
  }

  if (items.length === 0) {
    throw new Error('No pudimos detectar renglones en el texto. Revisa el formato (ejemplo: "10 Ficus M6 $45.00").')
  }

  return { items, warning: 'Revisa el documento completo: las líneas que no se interpretaron deben añadirse antes de confirmar.' }
}

export function parseManualOrPasteJson(jsonText: string): ExtractorResult {
  const trimmed = jsonText.trim()
  if (!trimmed) {
    throw new Error('El texto proporcionado está vacío.')
  }

  // If not starting with [ or {, try plain text parser
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
    return parseFreeTextList(trimmed)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // Fallback to plain text
    return parseFreeTextList(trimmed)
  }

  const array = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && 'items' in parsed && Array.isArray((parsed as { items: unknown }).items)
      ? (parsed as { items: unknown[] }).items
      : null

  if (!array) {
    return parseFreeTextList(trimmed)
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
  const descIndex = headerCells.findIndex((h) => h.includes('desc') || h === 'nombre' || h.includes('prod') || h.includes('articulo') || h.includes('concepto'))
  const qtyIndex = headerCells.findIndex((h) => h.includes('cant') || h.includes('qty') || h.includes('unidades'))
  const costIndex = headerCells.findIndex((h) => h.includes('cost') || h.includes('unitario') || h.includes('precio') || h.includes('price'))
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
        if (!/^\d+$/.test(cells[qtyIndex])) throw new Error('Revisa las cantidades del CSV: deben ser enteros sin texto adicional.')
        quantity = Number(cells[qtyIndex])
      }
      if (costIndex !== -1 && cells[costIndex]) {
        const cost = readMoney(cells[costIndex])
        if (cost === null) throw new Error('Revisa los costos del CSV: usa importes con máximo dos decimales.')
        unitCostCents = cost
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

async function extractDocxXml(arrayBuffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(arrayBuffer)
  const view = new DataView(arrayBuffer)

  let offset = 0
  while (offset + 30 < bytes.length) {
    const sig = view.getUint32(offset, true)
    if (sig !== 0x04034b50) {
      offset += 1
      continue
    }

    const compressionMethod = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const fileNameLen = view.getUint16(offset + 26, true)
    const extraFieldLen = view.getUint16(offset + 28, true)

    const fileNameBytes = bytes.slice(offset + 30, offset + 30 + fileNameLen)
    const fileName = new TextDecoder().decode(fileNameBytes)
    const dataStart = offset + 30 + fileNameLen + extraFieldLen

    if (fileName === 'word/document.xml') {
      const compressedData = bytes.slice(dataStart, dataStart + compressedSize)

      if (compressionMethod === 0) {
        return new TextDecoder().decode(compressedData)
      } else if (compressionMethod === 8) {
        if (typeof DecompressionStream !== 'undefined') {
          const ds = new DecompressionStream('deflate-raw')
          const writer = ds.writable.getWriter()
          writer.write(compressedData)
          writer.close()
          const response = new Response(ds.readable)
          return await response.text()
        }
      }
      throw new Error('No se pudo descomprimir el contenido de Word.')
    }

    offset = dataStart + compressedSize
  }

  throw new Error('No se encontró el contenido word/document.xml dentro del archivo .docx.')
}

export async function extractFromLocalDocx(file: File): Promise<ExtractorResult> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const xmlText = await extractDocxXml(arrayBuffer)

    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml')

    const items: PurchaseSourceItem[] = []

    // 1. Check for tables (<w:tbl>)
    const tables = xmlDoc.getElementsByTagName('w:tbl')
    for (let t = 0; t < tables.length; t += 1) {
      const table = tables[t]
      const rows = table.getElementsByTagName('w:tr')
      if (rows.length === 0) continue

      let startIndex = 0
      const firstRowCells = Array.from(rows[0].getElementsByTagName('w:tc')).map(tc => tc.textContent?.trim() || '')
      const hasHeader = firstRowCells.some(c => /^(descripci[oó]n|producto|art[ií]culo|cantidad|costo(?: unitario)?|precio(?: unitario)?|nombre)$/i.test(c))
      if (hasHeader) startIndex = 1

      for (let r = startIndex; r < rows.length; r += 1) {
        const cells = Array.from(rows[r].getElementsByTagName('w:tc')).map(tc => tc.textContent?.trim() || '')
        if (cells.length < 2) continue

        const parsed = parseLineTokens(cells)
        if (parsed) {
          items.push({
            lineNumber: items.length + 1,
            ...parsed,
          })
        }
      }
    }

    // 2. Fallback to paragraphs (<w:p>)
    if (items.length === 0) {
      const paragraphs = xmlDoc.getElementsByTagName('w:p')
      for (let p = 0; p < paragraphs.length; p += 1) {
        const text = paragraphs[p].textContent?.trim()
        if (text && text.length > 3) {
          const parsed = parseSingleLineText(text)
          if (parsed) {
            items.push({
              lineNumber: items.length + 1,
              ...parsed,
            })
          }
        }
      }
    }

    if (items.length === 0) {
      return {
        items: [],
        warning: 'No pudimos extraer renglones automáticamente del documento Word. Puedes capturarlos o pegar la lista.',
      }
    }

    return { items, warning:'Compara todas las páginas del documento: el lector puede omitir partidas o confundir columnas.' }
  } catch (err) {
    return {
      items: [],
      warning: err instanceof Error ? err.message : 'Error al procesar el archivo Word (.docx).',
    }
  }
}

export async function extractFromLocalPdf(file: File): Promise<ExtractorResult> {
  const pdfjsLib = await import('pdfjs-dist')
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()
  }
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const pdf = await loadingTask.promise
    if (pdf.numPages > 30) throw new Error('Divide el documento en archivos de hasta 30 páginas; no se omitieron páginas automáticamente.')
    const pages: PdfTextCell[][] = []
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent()
      pages.push(content.items.filter((item): item is typeof item & PdfTextCell => 'str' in item))
    }
    const receipt = parseReceiptPages(pages)
    if (receipt) return receipt
    const items: PurchaseSourceItem[] = []
    for (const page of pages) {
      for (const row of pdfRows(page)) {
        const parsed = parseSingleLineText(row.map(c => c.text).join('  '))
        if (parsed) items.push({ lineNumber: items.length + 1, ...parsed })
      }
    }
    return { items, warning: items.length
      ? 'Compara todas las páginas del documento: el lector puede omitir partidas o confundir columnas.'
      : 'No pudimos extraer los renglones del PDF. Usa un PDF con texto o captura las plantas manualmente; las fotos y escaneos necesitan transcripción.' }
  } catch {
    return { items: [], warning: 'No se pudo leer el PDF. Comprueba que tenga texto, no esté protegido y no exceda 30 páginas, o captura las plantas manualmente.' }
  } finally {
    await loadingTask.destroy()
  }
}
