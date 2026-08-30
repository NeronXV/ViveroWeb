import { describe, expect, it } from 'vitest'
import { buildProductQrLabels, createQrMatrix, isValidLabelInternalCode } from './product-qr-label'

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
