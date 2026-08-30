import type { AdminProduct } from './admin-catalog-types'

const QR_VERSIONS = [
  { version: 1, dataCodewords: 19, errorCodewords: 7, blocks: 1 },
  { version: 2, dataCodewords: 34, errorCodewords: 10, blocks: 1 },
  { version: 3, dataCodewords: 55, errorCodewords: 15, blocks: 1 },
  { version: 4, dataCodewords: 80, errorCodewords: 20, blocks: 1 },
  { version: 5, dataCodewords: 108, errorCodewords: 26, blocks: 1 },
  { version: 6, dataCodewords: 136, errorCodewords: 18, blocks: 2 },
] as const

export interface ProductQrLabel {
  commonName: string
  internalCode: string
  qrContent: string
}

export function isValidLabelInternalCode(value: string): boolean {
  return value.length > 0 && value.length <= 40 && value.trim() === value
}

export function buildProductQrLabels(
  product: Pick<AdminProduct, 'commonName' | 'internalCode'>,
  quantity: number,
): ProductQrLabel[] {
  if (!isValidLabelInternalCode(product.internalCode)) {
    throw new Error('El código interno no es válido para generar etiquetas.')
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new Error('La cantidad de etiquetas debe ser un entero entre 1 y 100.')
  }

  const label = {
    commonName: product.commonName,
    internalCode: product.internalCode,
    qrContent: product.internalCode,
  }
  return Array.from({ length: quantity }, () => label)
}

function appendBits(target: number[], value: number, length: number) {
  for (let index = length - 1; index >= 0; index -= 1) {
    target.push((value >>> index) & 1)
  }
}

function multiplyGalois(left: number, right: number): number {
  let result = 0
  for (let index = 0; index < 8; index += 1) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d)
    result ^= ((right >>> (7 - index)) & 1) * left
  }
  return result
}

function createReedSolomonDivisor(degree: number): number[] {
  const result = Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let index = 0; index < degree; index += 1) {
    for (let coefficient = 0; coefficient < degree; coefficient += 1) {
      result[coefficient] = multiplyGalois(result[coefficient], root)
      if (coefficient + 1 < degree) result[coefficient] ^= result[coefficient + 1]
    }
    root = multiplyGalois(root, 2)
  }
  return result
}

function createReedSolomonRemainder(data: number[], divisor: number[]): number[] {
  const result = Array<number>(divisor.length).fill(0)
  for (const byte of data) {
    const factor = byte ^ result[0]
    result.shift()
    result.push(0)
    for (let index = 0; index < result.length; index += 1) {
      result[index] ^= multiplyGalois(divisor[index], factor)
    }
  }
  return result
}

function encodeData(content: string) {
  const bytes = [...new TextEncoder().encode(content)]
  const spec = QR_VERSIONS.find(({ dataCodewords }) => 24 + bytes.length * 8 <= dataCodewords * 8)
  if (!spec) throw new Error('El código interno excede la capacidad de la etiqueta QR.')

  const bits: number[] = []
  appendBits(bits, 0b0111, 4)
  appendBits(bits, 26, 8) // ECI assignment 26 declares UTF-8 without changing the payload.
  appendBits(bits, 0b0100, 4)
  appendBits(bits, bytes.length, 8)
  for (const byte of bytes) appendBits(bits, byte, 8)

  const capacity = spec.dataCodewords * 8
  appendBits(bits, 0, Math.min(4, capacity - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)

  const data: number[] = []
  for (let index = 0; index < bits.length; index += 8) {
    data.push(Number.parseInt(bits.slice(index, index + 8).join(''), 2))
  }
  for (let pad = 0; data.length < spec.dataCodewords; pad += 1) {
    data.push(pad % 2 === 0 ? 0xec : 0x11)
  }

  const blockLength = spec.dataCodewords / spec.blocks
  const blocks = Array.from({ length: spec.blocks }, (_, index) => data.slice(index * blockLength, (index + 1) * blockLength))
  const divisor = createReedSolomonDivisor(spec.errorCodewords)
  const errorBlocks = blocks.map((block) => createReedSolomonRemainder(block, divisor))
  const codewords: number[] = []
  for (let index = 0; index < blockLength; index += 1) {
    for (const block of blocks) codewords.push(block[index])
  }
  for (let index = 0; index < spec.errorCodewords; index += 1) {
    for (const block of errorBlocks) codewords.push(block[index])
  }
  return { version: spec.version, codewords }
}

function setFunctionModule(matrix: Array<Array<boolean | null>>, x: number, y: number, dark: boolean) {
  if (x >= 0 && y >= 0 && y < matrix.length && x < matrix.length) matrix[y][x] = dark
}

function drawFinder(matrix: Array<Array<boolean | null>>, centerX: number, centerY: number) {
  for (let y = -4; y <= 4; y += 1) {
    for (let x = -4; x <= 4; x += 1) {
      const distance = Math.max(Math.abs(x), Math.abs(y))
      setFunctionModule(matrix, centerX + x, centerY + y, distance !== 2 && distance !== 4)
    }
  }
}

function drawAlignment(matrix: Array<Array<boolean | null>>, centerX: number, centerY: number) {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      setFunctionModule(matrix, centerX + x, centerY + y, Math.max(Math.abs(x), Math.abs(y)) !== 1)
    }
  }
}

function drawFormatBits(matrix: Array<Array<boolean | null>>) {
  const size = matrix.length
  const data = 0b01000 // Error correction L and mask 0.
  let remainder = data
  for (let index = 0; index < 10; index += 1) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537)
  const bits = ((data << 10) | remainder) ^ 0x5412
  const bit = (index: number) => ((bits >>> index) & 1) !== 0

  for (let index = 0; index <= 5; index += 1) setFunctionModule(matrix, 8, index, bit(index))
  setFunctionModule(matrix, 8, 7, bit(6))
  setFunctionModule(matrix, 8, 8, bit(7))
  setFunctionModule(matrix, 7, 8, bit(8))
  for (let index = 9; index < 15; index += 1) setFunctionModule(matrix, 14 - index, 8, bit(index))
  for (let index = 0; index < 8; index += 1) setFunctionModule(matrix, size - 1 - index, 8, bit(index))
  for (let index = 8; index < 15; index += 1) setFunctionModule(matrix, 8, size - 15 + index, bit(index))
  setFunctionModule(matrix, 8, size - 8, true)
}

export function createQrMatrix(content: string): boolean[][] {
  if (!isValidLabelInternalCode(content)) throw new Error('El contenido QR no es un código interno válido.')
  const { version, codewords } = encodeData(content)
  const size = version * 4 + 17
  const matrix = Array.from({ length: size }, () => Array<boolean | null>(size).fill(null))

  drawFinder(matrix, 3, 3)
  drawFinder(matrix, size - 4, 3)
  drawFinder(matrix, 3, size - 4)
  for (let index = 8; index < size - 8; index += 1) {
    setFunctionModule(matrix, 6, index, index % 2 === 0)
    setFunctionModule(matrix, index, 6, index % 2 === 0)
  }
  if (version > 1) drawAlignment(matrix, size - 7, size - 7)
  drawFormatBits(matrix)

  const dataBits = codewords.flatMap((byte) => Array.from({ length: 8 }, (_, index) => (byte >>> (7 - index)) & 1))
  let bitIndex = 0
  let upward = true
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset
        if (matrix[y][x] !== null) continue
        const value = bitIndex < dataBits.length ? dataBits[bitIndex] !== 0 : false
        matrix[y][x] = value !== ((x + y) % 2 === 0)
        bitIndex += 1
      }
    }
    upward = !upward
  }

  return matrix.map((row) => row.map(Boolean))
}
