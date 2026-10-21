import { expect, it } from 'vitest'
import { parseCsv } from './purchases-extractor'
import type { AdminProduct } from '../admin-catalog-types'
import { prepareReceptionSource, readMoney, suggestReceptionProducts, type ReceptionReviewLine } from './reception-review'

const line: ReceptionReviewLine = { lineNumber: 1, rawDescription: 'Planta de ensayo', containerCode: 'B6', suggestedCommonName: null, suggestedPresentation: null, quantity: 10, unitCostCents: 4500, name: 'Planta de ensayo', presentation: 'B6', productId: '', newPlant: true, documentQuantity: '10', cost: '45.00', received: '8' }
it('accepts exact money and rejects descriptions, exponent notation, negative and malformed values', () => {
  expect(readMoney('$ 1,250.50')).toBe(125050)
  for (const value of ['1001 X01 B4', '-12', '1e6', '12.345', '', '1,20']) expect(readMoney(value)).toBeNull()
})
it('compares the document total independently of received quantities, including zero received', () => {
  expect(prepareReceptionSource([line], '450.00')[0].quantity).toBe(10)
  expect(prepareReceptionSource([{ ...line, received: '0' }], '450.00')[0].quantity).toBe(10)
  expect(() => prepareReceptionSource([line], '360.00')).toThrow('no coincide')
  expect(() => prepareReceptionSource([line], '', true)).toThrow('no coincide')
})
it('saves corrected source costs and names; rejects amount/header names and incomplete quantities', () => {
  expect(prepareReceptionSource([{ ...line, cost: '50.00', name: 'Nombre revisado' }], '500.00')[0]).toMatchObject({ unitCostCents: 5000, suggestedCommonName: 'Nombre revisado' })
  for (const rawDescription of ['Cant', '$175.00', 'Descripción por revisar', '']) expect(() => prepareReceptionSource([{ ...line, rawDescription }], '')).toThrow('nombre')
  expect(() => prepareReceptionSource([{ ...line, documentQuantity: '' }], '')).toThrow('cantidad')
})
it('suggests active names with accents normalized, ranks exact matches and never selects a product', () => {
  const products = [
    { id: '1', commonName: 'Planta de ensayo grande', isActive: true },
    { id: '2', commonName: 'Plánta de ensayo', isActive: true },
    { id: '3', commonName: 'Planta de ensayo', isActive: false },
  ] as AdminProduct[]
  expect(suggestReceptionProducts('PLANTA DE ENSAYO', products).map(p => p.id)).toEqual(['2', '1'])
  expect(suggestReceptionProducts('$175.00', products)).toEqual([])
  expect(line.productId).toBe('')
})

it('reads named CSV columns and rejects descriptions used as costs or fractional quantities', () => {
  expect(parseCsv('Nombre,Contenedor,Cantidad,Costo Unitario\nPlanta demo,B6,3,25.00').items[0]).toMatchObject({rawDescription:'Planta demo', quantity:3, unitCostCents:2500})
  expect(parseCsv('Nombre,Unidades,Precio unitario\nPlanta demo,3,25.00').items[0].unitCostCents).toBe(2500)
  expect(() => parseCsv('Nombre,Cantidad,Costo Unitario\nPlanta demo,3,1001 X01 B4')).toThrow('costos')
  expect(() => parseCsv('Nombre,Cantidad,Costo Unitario\nPlanta demo,1.5,25.00')).toThrow('cantidades')
})
