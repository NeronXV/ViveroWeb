import { describe, expect, it } from 'vitest'
import { buildProductQrLabelBatch, buildProductQrLabels, createQrMatrix, isValidLabelInternalCode } from './product-qr-label'

const product = { commonName: 'Monstera deliciosa', internalCode: 'PLANTA-001' }

describe('etiquetas QR de producto', () => {
  it('usa exactamente internal_code como contenido QR sin añadir otros datos', () => {
    const [label] = buildProductQrLabels(product, 1)

    expect(label.qrContent).toBe('PLANTA-001')
    expect(label).toEqual({ commonName: 'Monstera deliciosa', internalCode: 'PLANTA-001', qrContent: 'PLANTA-001' })
    expect(JSON.stringify(label)).not.toContain('precio')
    expect(JSON.stringify(label)).not.toContain('http')
  })

  it.each(['', ' A-01', 'A-01 ', 'A'.repeat(41)])('rechaza el código interno inválido %j', (code) => {
    expect(isValidLabelInternalCode(code)).toBe(false)
    expect(() => buildProductQrLabels({ ...product, internalCode: code }, 1)).toThrow('código interno')
  })

  it('conserva exactamente códigos válidos con espacios, símbolos y UTF-8', () => {
    const internalCode = 'Árbol madre # 01'
    const [label] = buildProductQrLabels({ ...product, internalCode }, 1)

    expect(label.internalCode).toBe(internalCode)
    expect(label.qrContent).toBe(internalCode)
    expect(createQrMatrix(internalCode).length).toBeGreaterThan(21)
  })

  it('crea exclusivamente la cantidad solicitada entre 1 y 100', () => {
    expect(buildProductQrLabels(product, 7)).toHaveLength(7)
    expect(buildProductQrLabels(product, 100)).toHaveLength(100)
    expect(() => buildProductQrLabels(product, 0)).toThrow('entre 1 y 100')
    expect(() => buildProductQrLabels(product, 101)).toThrow('entre 1 y 100')
    expect(() => buildProductQrLabels(product, 1.5)).toThrow('entre 1 y 100')
  })

  it('genera una matriz QR cuadrada con módulos claros y oscuros', () => {
    const matrix = createQrMatrix(product.internalCode)
    expect(matrix.length).toBe(21)
    expect(matrix.every((row) => row.length === matrix.length)).toBe(true)
    expect(matrix.flat()).toContain(true)
    expect(matrix.flat()).toContain(false)
  })

  it('cubre códigos UTF-8 del límite contractual en una versión soportada', () => {
    const matrix = createQrMatrix('漢'.repeat(40))
    expect(matrix).toHaveLength(41)
  })
})

describe('impresión conjunta de etiquetas', () => {
  it('mantiene el orden, códigos y cantidades de varios productos', () => {
    const labels = buildProductQrLabelBatch([
      { product, quantity: 2 },
      { product: { commonName: 'Romero', internalCode: 'ROM-002' }, quantity: 3 },
    ])
    expect(labels.map((label) => label.qrContent)).toEqual([
      'PLANTA-001', 'PLANTA-001', 'ROM-002', 'ROM-002', 'ROM-002',
    ])
    expect(labels[2].commonName).toBe('Romero')
  })

  it('mantiene la impresión de un producto y rechaza lotes vacíos', () => {
    expect(buildProductQrLabelBatch([{ product, quantity: 4 }])).toEqual(buildProductQrLabels(product, 4))
    expect(() => buildProductQrLabelBatch([])).toThrow('Selecciona productos')
  })

  it.each([0, -1, 1.5, 101, NaN])('rechaza cantidades inválidas %s sin imprimir parcialmente', (quantity) => {
    expect(() => buildProductQrLabelBatch([{ product, quantity: 1 }, { product, quantity }])).toThrow()
  })

  it('permite hasta 1000 etiquetas y rechaza exceder el límite', () => {
    const entries = Array.from({ length: 10 }, () => ({ product, quantity: 100 }))
    expect(buildProductQrLabelBatch(entries)).toHaveLength(1000)
    expect(() => buildProductQrLabelBatch([...entries, { product, quantity: 1 }])).toThrow('1000')
  })

  it('rechaza todo el lote si un código no es válido', () => {
    expect(() => buildProductQrLabelBatch([
      { product, quantity: 2 }, { product: { ...product, internalCode: '' }, quantity: 1 },
    ])).toThrow('código interno')
  })
})
