import { describe, expect, it } from 'vitest'
import {
  calculateExpectedTotalCents,
  centsToFormattedMxn,
  centsToPesos,
  parsePurchaseDetailItem,
  parsePurchaseListItem,
  parseSupplier,
  parseSupplierPurchaseDetail,
  parseSupplierPurchasesResponse,
  pesosToCents,
  sanitizeFileName,
  validatePurchaseLines,
  validateSupplierCode,
} from './purchases-parser'
import { mapBackendError } from './purchases-service'
import { parseManualOrPasteJson, parseCsv } from './purchases-extractor'
import { getAuthorizedAdminModules, isAdminModuleAuthorized } from '../../access/access-rules'
import type { UserAccessContext } from '../../access/access-types'
import { buildProductQrLabels } from '../product-qr-label'
import type { PurchaseSourceItem, SupplierPurchaseDetail } from './purchases-types'

function createFakeContext(capabilities: string[] = []): UserAccessContext {
  return {
    schemaVersion: 1,
    userId: '11000000-0000-0000-0000-000000000001',
    accessState: 'ACTIVE',
    profile: {
      fullName: 'Administrador Pruebas',
      avatarPath: null,
      isActive: true,
    },
    role: { name: 'ADMIN', displayName: 'Administrador' },
    branch: {
      id: 'branch-1',
      code: 'NORTE',
      name: 'Sucursal Norte',
      isActive: true,
    },
    capabilities,
  }
}

describe('Pruebas del Módulo de Compras y Proveedores', () => {
  describe('1. Parsers estrictos de respuestas RPC', () => {
    it('parseSupplier valida proveedor completo y lanza error si falta código o id', () => {
      const valid = { id: 's-1', code: 'PROV-01', name: 'Viveros del Sur' }
      expect(parseSupplier(valid)).toEqual({ id: 's-1', code: 'PROV-01', name: 'Viveros del Sur' })

      expect(() => parseSupplier(null)).toThrow('El proveedor recibido no es un objeto válido.')
      expect(() => parseSupplier({ id: 's-1', name: 'Sin código' })).toThrow('El proveedor carece de campos obligatorios')
    })

    it('parsePurchaseListItem procesa documento en formato camelCase y snake_case', () => {
      const camel = {
        id: 'p-1',
        supplier: { id: 's-1', code: 'PROV-01', name: 'Viveros del Sur' },
        documentDate: '2026-09-01',
        externalReference: 'FAC-100',
        paymentTerms: 'CASH',
        expectedTotalCents: 15000,
        status: 'DRAFT',
        itemCount: 2,
        unmatchedCount: 1,
        createdAt: '2026-09-01T12:00:00Z',
        receivedAt: null,
      }

      const parsedCamel = parsePurchaseListItem(camel)
      expect(parsedCamel.id).toBe('p-1')
      expect(parsedCamel.expectedTotalCents).toBe(15000)
      expect(parsedCamel.paymentTerms).toBe('CASH')
      expect(parsedCamel.status).toBe('DRAFT')

      const snake = {
        id: 'p-2',
        supplier: { id: 's-2', code: 'PROV-02', name: 'Plantas Maya' },
        document_date: '2026-09-02',
        external_reference: 'REF-200',
        payment_terms: 'CREDIT',
        expected_total_cents: 80000,
        status: 'RECEIVED',
        item_count: 5,
        unmatched_count: 0,
        created_at: '2026-09-02T10:00:00Z',
        received_at: '2026-09-02T15:00:00Z',
      }

      const parsedSnake = parsePurchaseListItem(snake)
      expect(parsedSnake.id).toBe('p-2')
      expect(parsedSnake.expectedTotalCents).toBe(80000)
      expect(parsedSnake.paymentTerms).toBe('CREDIT')
      expect(parsedSnake.status).toBe('RECEIVED')
      expect(parsedSnake.receivedAt).toBe('2026-09-02T15:00:00Z')
    })

    it('parseSupplierPurchasesResponse parsea respuesta envuelta o arreglo directo', () => {
      const wrapped = {
        schemaVersion: 1,
        branchId: 'b-1',
        items: [
          {
            id: 'p-1',
            supplier: { id: 's-1', code: 'P1', name: 'Prov 1' },
            documentDate: '2026-09-01',
            externalReference: null,
            paymentTerms: 'OTHER',
            expectedTotalCents: 5000,
            status: 'DRAFT',
            itemCount: 1,
            unmatchedCount: 1,
            createdAt: '2026-09-01T10:00:00Z',
            receivedAt: null,
          },
        ],
      }

      const res = parseSupplierPurchasesResponse(wrapped)
      expect(res.schemaVersion).toBe(1)
      expect(res.branchId).toBe('b-1')
      expect(res.items).toHaveLength(1)

      const directArray = [wrapped.items[0]]
      const resArray = parseSupplierPurchasesResponse(directArray)
      expect(resArray.items).toHaveLength(1)
    })

    it('parsePurchaseDetailItem valida renglones y estados de resolución', () => {
      const itemRaw = {
        id: 'it-1',
        lineNumber: 1,
        rawDescription: 'MONSTERA DELICIOSA',
        containerCode: 'M10',
        supplierPresentation: 'Maceta #10',
        suggestedCommonName: 'Monstera Deliciosa',
        suggestedPresentation: 'M10',
        quantity: 5,
        unitCostCents: 12000,
        lineTotalCents: 60000,
        productId: 'prod-abc',
        resolutionStatus: 'AUTO_MATCHED',
      }

      const parsed = parsePurchaseDetailItem(itemRaw)
      expect(parsed.id).toBe('it-1')
      expect(parsed.lineNumber).toBe(1)
      expect(parsed.rawDescription).toBe('MONSTERA DELICIOSA')
      expect(parsed.containerCode).toBe('M10')
      expect(parsed.quantity).toBe(5)
      expect(parsed.unitCostCents).toBe(12000)
      expect(parsed.lineTotalCents).toBe(60000)
      expect(parsed.resolutionStatus).toBe('AUTO_MATCHED')
    })

    it('parseSupplierPurchaseDetail procesa detalle autoritativo con items', () => {
      const detailRaw = {
        purchase: {
          id: 'p-10',
          supplier: { id: 's-1', code: 'P1', name: 'Proveedor Uno' },
          documentDate: '2026-09-01',
          externalReference: 'F-99',
          paymentTerms: 'CASH',
          expectedTotalCents: 6000,
          status: 'DRAFT',
          itemCount: 1,
          unmatchedCount: 0,
          sourceFileName: 'factura_01.pdf',
          createdAt: '2026-09-01T10:00:00Z',
          receivedAt: null,
        },
        items: [
          {
            id: 'it-1',
            lineNumber: 1,
            rawDescription: 'CLOROFITO',
            containerCode: 'M10',
            quantity: 1,
            unitCostCents: 6000,
            lineTotalCents: 6000,
            productId: 'prod-cloro',
            resolutionStatus: 'MATCHED',
          },
        ],
      }

      const parsed = parseSupplierPurchaseDetail(detailRaw)
      expect(parsed.id).toBe('p-10')
      expect(parsed.sourceFileName).toBe('factura_01.pdf')
      expect(parsed.items).toHaveLength(1)
      expect(parsed.items[0].productId).toBe('prod-cloro')
    })
  })

  describe('2. Conversión y formato de centavos', () => {
    it('convierte centavos a pesos string con centsToPesos', () => {
      expect(centsToPesos(6000)).toBe('60.00')
      expect(centsToPesos(12345)).toBe('123.45')
      expect(centsToPesos(0)).toBe('0.00')
    })

    it('convierte pesos a centavos enteros con pesosToCents sin deriva flotante', () => {
      expect(pesosToCents('60.00')).toBe(6000)
      expect(pesosToCents('123.45')).toBe(12345)
      expect(pesosToCents('$1,250.50 MXN')).toBe(125050)
      expect(pesosToCents(50.25)).toBe(5025)
    })

    it('formatea centavos como moneda MXN con centsToFormattedMxn', () => {
      const formatted = centsToFormattedMxn(6000)
      expect(formatted).toContain('60.00')
      expect(formatted).toContain('MXN')
    })
  })

  describe('3. Validación de renglones y cálculo de total esperado', () => {
    it('calcula la suma exacta de quantity * unitCostCents', () => {
      const lines = [
        { quantity: 7, unitCostCents: 6000 }, // 42000
        { quantity: 3, unitCostCents: 15000 }, // 45000
      ]
      expect(calculateExpectedTotalCents(lines)).toBe(87000)
    })

    it('validatePurchaseLines rechaza listas vacías, mayores a 250 o con cantidades no enteras', () => {
      expect(validatePurchaseLines([])).toBe('Debes incluir al menos un renglón en la compra.')

      const validLines: PurchaseSourceItem[] = [
        {
          lineNumber: 1,
          rawDescription: 'CLOROFITO',
          containerCode: 'M10',
          suggestedCommonName: 'Clorofito',
          suggestedPresentation: null,
          quantity: 5,
          unitCostCents: 6000,
        },
      ]
      expect(validatePurchaseLines(validLines)).toBeNull()

      const duplicateLines: PurchaseSourceItem[] = [
        { ...validLines[0], lineNumber: 1 },
        { ...validLines[0], lineNumber: 1 },
      ]
      expect(validatePurchaseLines(duplicateLines)).toBe('El número de renglón 1 está duplicado.')

      const negativeCost: PurchaseSourceItem[] = [
        { ...validLines[0], unitCostCents: -500 },
      ]
      expect(validatePurchaseLines(negativeCost)).toBe('El renglón 1 debe tener un costo unitario no negativo en centavos.')

      const zeroQty: PurchaseSourceItem[] = [
        { ...validLines[0], quantity: 0 },
      ]
      expect(validatePurchaseLines(zeroQty)).toBe('El renglón 1 debe tener una cantidad entera mayor a cero.')
    })

    it('validateSupplierCode valida código en mayúsculas, letras, números y guiones', () => {
      expect(validateSupplierCode('PROV-MORELOS-01')).toBe(true)
      expect(validateSupplierCode('VIVERO123')).toBe(true)
      expect(validateSupplierCode('p')).toBe(false) // muy corto
      expect(validateSupplierCode('PROV 01')).toBe(false) // espacio no permitido
      expect(validateSupplierCode('PROV@1')).toBe(false) // caracter especial
    })

    it('sanitizeFileName genera nombres de archivo seguros', () => {
      expect(sanitizeFileName('C:\\docs\\factura#1.pdf')).toBe('factura_1.pdf')
      expect(sanitizeFileName('/tmp/remision (mayo).pdf')).toBe('remision__mayo_.pdf')
    })
  })

  describe('4. Claves idempotentes y confirmation keys estables', () => {
    it('genera claves UUID válidas que se conservan durante reintentos', () => {
      const key1 = crypto.randomUUID()
      const key2 = crypto.randomUUID()
      expect(key1).not.toBe(key2)
      expect(key1).toHaveLength(36)

      // Simulación de reintento conservando la misma clave
      let retryCount = 0
      const sendAttempt = (key: string) => {
        retryCount += 1
        return { key, attempt: retryCount }
      }

      const attempt1 = sendAttempt(key1)
      const attempt2 = sendAttempt(key1)
      expect(attempt1.key).toBe(attempt2.key)
      expect(attempt2.attempt).toBe(2)
    })
  })

  describe('5. Bloqueo de confirmación con UNMATCHED', () => {
    it('impide confirmación si existen renglones UNMATCHED o ningún renglón relacionado', () => {
      const detailWithUnmatched: SupplierPurchaseDetail = {
        id: 'p-1',
        supplier: { id: 's-1', code: 'P1', name: 'Prov 1' },
        documentDate: '2026-09-01',
        externalReference: null,
        paymentTerms: 'CASH',
        expectedTotalCents: 10000,
        status: 'DRAFT',
        itemCount: 2,
        unmatchedCount: 1,
        sourceFileName: null,
        createdAt: '2026-09-01T10:00:00Z',
        receivedAt: null,
        items: [
          {
            id: 'it-1',
            lineNumber: 1,
            rawDescription: 'A',
            containerCode: 'GEN',
            supplierPresentation: null,
            suggestedCommonName: null,
            suggestedPresentation: null,
            quantity: 1,
            unitCostCents: 5000,
            lineTotalCents: 5000,
            productId: 'prod-1',
            resolutionStatus: 'MATCHED',
          },
          {
            id: 'it-2',
            lineNumber: 2,
            rawDescription: 'B',
            containerCode: 'GEN',
            supplierPresentation: null,
            suggestedCommonName: null,
            suggestedPresentation: null,
            quantity: 1,
            unitCostCents: 5000,
            lineTotalCents: 5000,
            productId: null,
            resolutionStatus: 'UNMATCHED',
          },
        ],
      }

      const canConfirm = (detail: SupplierPurchaseDetail): { allowed: boolean; reason?: string } => {
        if (detail.status !== 'DRAFT') return { allowed: false, reason: 'No está en DRAFT' }
        if (detail.unmatchedCount > 0) return { allowed: false, reason: 'Existen renglones UNMATCHED' }
        const hasMatched = detail.items.some((i) => i.resolutionStatus === 'MATCHED' || i.resolutionStatus === 'AUTO_MATCHED')
        if (!hasMatched) return { allowed: false, reason: 'No hay renglones relacionados' }
        return { allowed: true }
      }

      expect(canConfirm(detailWithUnmatched).allowed).toBe(false)
      expect(canConfirm(detailWithUnmatched).reason).toBe('Existen renglones UNMATCHED')

      // Ahora resolvemos el segundo como IGNORED
      const resolvedDetail: SupplierPurchaseDetail = {
        ...detailWithUnmatched,
        unmatchedCount: 0,
        items: [
          detailWithUnmatched.items[0],
          { ...detailWithUnmatched.items[1], resolutionStatus: 'IGNORED' },
        ],
      }

      expect(canConfirm(resolvedDetail).allowed).toBe(true)

      // Si todos son IGNORED, no debe permitirse
      const allIgnoredDetail: SupplierPurchaseDetail = {
        ...resolvedDetail,
        items: [
          { ...resolvedDetail.items[0], productId: null, resolutionStatus: 'IGNORED' },
          resolvedDetail.items[1],
        ],
      }

      expect(canConfirm(allIgnoredDetail).allowed).toBe(false)
      expect(canConfirm(allIgnoredDetail).reason).toBe('No hay renglones relacionados')
    })
  })

  describe('6. Mapeo seguro de errores y backend no disponible', () => {
    it('detecta PGRST202, 404 y function does not exist como BACKEND_UNAVAILABLE', () => {
      const err1 = mapBackendError({ code: 'PGRST202', message: 'Could not find the function upsert_supplier in the schema cache' })
      expect(err1.isBackendUnavailable).toBe(true)
      expect(err1.message).toContain('El backend de Compras y proveedores todavía no está disponible')

      const err2 = mapBackendError({ code: '404', message: 'Not found' })
      expect(err2.isBackendUnavailable).toBe(true)

      const err3 = mapBackendError({ message: 'function create_supplier_purchase_draft does not exist' })
      expect(err3.isBackendUnavailable).toBe(true)
    })

    it('mapea errores de negocio autoritativos a mensajes claros y seguros', () => {
      const errAuth = mapBackendError({ message: 'PURCHASE_MANAGEMENT_UNAUTHORIZED' })
      expect(errAuth.message).toBe('No tienes autorización para gestionar compras o inventario.')

      const errDup = mapBackendError({ message: 'PURCHASE_LINE_DUPLICATE' })
      expect(errDup.message).toBe('Existen renglones duplicados en la compra.')

      const errMismatch = mapBackendError({ message: 'PURCHASE_TOTAL_MISMATCH' })
      expect(errMismatch.message).toBe('El total esperado no coincide con la suma de los renglones.')

      const errRef = mapBackendError({ message: 'PURCHASE_REFERENCE_IN_USE' })
      expect(errRef.message).toBe('La referencia o folio externo ya fue registrada para este proveedor.')

      const errNotReady = mapBackendError({ message: 'PURCHASE_NOT_READY' })
      expect(errNotReady.message).toBe('La compra no está lista para ser confirmada. Revisa que todos los renglones estén resueltos.')
    })
  })

  describe('7. Visibilidad de módulo por capacidades de acceso', () => {
    it('el módulo compras está visible y autorizado cuando el usuario tiene MANAGE_INVENTORY', () => {
      const contextWithInventory = createFakeContext(['MANAGE_INVENTORY'])
      expect(isAdminModuleAuthorized(contextWithInventory, 'compras')).toBe(true)
      expect(getAuthorizedAdminModules(contextWithInventory)).toContain('compras')
    })

    it('el módulo compras no está disponible sin la capacidad MANAGE_INVENTORY', () => {
      const contextWithoutInventory = createFakeContext(['MANAGE_PRODUCTS', 'VIEW_REPORTS'])
      expect(isAdminModuleAuthorized(contextWithoutInventory, 'compras')).toBe(false)
      expect(getAuthorizedAdminModules(contextWithoutInventory)).not.toContain('compras')
    })
  })

  describe('8. Flujo de resolución MATCHED e IGNORED', () => {
    it('valida parámetros según resolución requerida', () => {
      const prepareResolution = (
        resolution: 'MATCHED' | 'IGNORED',
        productId: string | null
      ) => {
        if (resolution === 'MATCHED' && !productId) {
          throw new Error('Para MATCHED es obligatorio enviar un producto activo.')
        }
        return {
          resolution,
          productId: resolution === 'MATCHED' ? productId : null,
        }
      }

      expect(() => prepareResolution('MATCHED', null)).toThrow('Para MATCHED es obligatorio')
      expect(prepareResolution('MATCHED', 'prod-123')).toEqual({
        resolution: 'MATCHED',
        productId: 'prod-123',
      })
      expect(prepareResolution('IGNORED', 'prod-ignored')).toEqual({
        resolution: 'IGNORED',
        productId: null,
      })
    })
  })

  describe('9. Etiquetas QR basadas en internalCode (nunca UUID)', () => {
    it('genera etiquetas con internalCode como contenido QR y respeta límites de 1 a 100', () => {
      const product = {
        commonName: 'Clorofito Listón',
        internalCode: 'CLORO-M10',
      }

      const labels = buildProductQrLabels(product, 5)
      expect(labels).toHaveLength(5)
      labels.forEach((lbl) => {
        expect(lbl.internalCode).toBe('CLORO-M10')
        expect(lbl.qrContent).toBe('CLORO-M10') // internalCode, no UUID
        expect(lbl.commonName).toBe('Clorofito Listón')
      })

      expect(() => buildProductQrLabels(product, 0)).toThrow('entero entre 1 y 100')
      expect(() => buildProductQrLabels(product, 101)).toThrow('entero entre 1 y 100')
    })
  })

  describe('10. Extracción de JSON y CSV', () => {
    it('extrae renglones desde JSON pegado', () => {
      const jsonStr = JSON.stringify([
        {
          lineNumber: 1,
          rawDescription: 'CLOROFITO',
          containerCode: 'M10',
          quantity: 7,
          unitCostCents: 6000,
        },
      ])

      const res = parseManualOrPasteJson(jsonStr)
      expect(res.items).toHaveLength(1)
      expect(res.items[0].rawDescription).toBe('CLOROFITO')
      expect(res.items[0].quantity).toBe(7)
      expect(res.items[0].unitCostCents).toBe(6000)
    })

    it('extrae renglones desde CSV delimitado por comas', () => {
      const csv = `Descripción,Contenedor,Cantidad,Costo Unitario\nSABILA,M06,10,45.00`
      const res = parseCsv(csv)
      expect(res.items).toHaveLength(1)
      expect(res.items[0].rawDescription).toBe('SABILA')
      expect(res.items[0].containerCode).toBe('M06')
      expect(res.items[0].quantity).toBe(10)
      expect(res.items[0].unitCostCents).toBe(4500)
    })
  })
})
