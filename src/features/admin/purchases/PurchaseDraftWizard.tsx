import { ProductQrLabelCard } from '../ProductQrLabelCard'
import { useEffect, useMemo, useRef, useState } from 'react'
import { centsToPesos, centsToFormattedMxn, pesosToCents, calculateExpectedTotalCents, validatePurchaseLines, sanitizeFileName } from './purchases-parser'
import { confirmSupplierPurchase, createSupplierPurchaseDraft, fetchSupplierPurchaseDetail, resolveSupplierPurchaseItem, setSupplierPresentation } from './purchases-service'
import { extractFromLocalPdf, parseCsv, parseManualOrPasteJson } from './purchases-extractor'
import { SupplierCreateModal } from './SupplierCreateModal'
import { SupplierPresentationModal } from './SupplierPresentationModal'
import { AdminProductCreateModal } from './AdminProductCreateModal'
import { fetchAdminProducts } from '../admin-catalog-service'
import type { AdminProduct } from '../admin-catalog-types'
import { buildProductQrLabels, isValidLabelInternalCode } from '../product-qr-label'
import type {
  PaymentTerms,
  PurchaseSourceItem,
  Supplier,
  SupplierPurchaseDetail,
} from './purchases-types'

interface PurchaseDraftWizardProps {
  branch: { id: string; name: string } | null
  knownSuppliers: Supplier[]
  initialPurchaseId?: string | null
  onSupplierAdded: (supplier: Supplier) => void
  onCompleted: () => void
  onNavigateToCatalog?: () => void
  onCancel: () => void
}

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6

export function PurchaseDraftWizard({
  branch,
  knownSuppliers,
  initialPurchaseId = null,
  onSupplierAdded,
  onCompleted,
  onNavigateToCatalog,
  onCancel,
}: PurchaseDraftWizardProps) {
  // Navigation step
  const [step, setStep] = useState<WizardStep>(initialPurchaseId ? 4 : 1)

  // Step 1: Supplier and Document
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(knownSuppliers[0]?.id || '')
  const [documentDate, setDocumentDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [externalReference, setExternalReference] = useState('')
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>('CASH')
  const [sourceFileName, setSourceFileName] = useState<string | null>(null)

  // Modals state
  const [isCreateSupplierOpen, setIsCreateSupplierOpen] = useState(false)
  const [presentationModalData, setPresentationModalData] = useState<{
    supplierId: string
    supplierName: string
    initialCode: string
  } | null>(null)
  const [productCreateModalData, setProductCreateModalData] = useState<{
    itemId: string
    suggestedCommonName: string
    suggestedPresentation: string
    unitCostCents: number
  } | null>(null)

  // Step 2: Line items capture and import
  const [importMode, setImportMode] = useState<'manual' | 'json' | 'csv' | 'pdf'>('manual')
  const [importText, setImportText] = useState('')
  const [pdfWarning, setPdfWarning] = useState<string | null>(null)
  const [isExtractingPdf, setIsExtractingPdf] = useState(false)
  const [items, setItems] = useState<PurchaseSourceItem[]>([
    {
      lineNumber: 1,
      rawDescription: '',
      containerCode: 'M10',
      suggestedCommonName: '',
      suggestedPresentation: '',
      quantity: 1,
      unitCostCents: 0,
    },
  ])

  // Step 3 & 4: Draft creation and detail state
  const [purchaseDetail, setPurchaseDetail] = useState<SupplierPurchaseDetail | null>(null)
  const [isCreatingDraft, setIsCreatingDraft] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)

  // Idempotency key generated ONCE for the draft creation and preserved across retries
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())

  // Confirmation key generated ONCE for confirmation and preserved across retries
  const confirmationKeyRef = useRef<string>(crypto.randomUUID())
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  // Active products for resolution search in Step 4
  const [activeProducts, setActiveProducts] = useState<AdminProduct[]>([])
  const [searchProductQuery, setSearchProductQuery] = useState('')
  const [resolvingItemId, setResolvingItemId] = useState<string | null>(null)
  const [activeItemForSearch, setActiveItemForSearch] = useState<string | null>(null)

  // Step 6: QR labels printing
  const [labelBatchIndex, setLabelBatchIndex] = useState(0)

  // Load existing purchase if starting with initialPurchaseId
  useEffect(() => {
    if (initialPurchaseId) {
      fetchSupplierPurchaseDetail(initialPurchaseId)
        .then((detail) => {
          setPurchaseDetail(detail)
          if (detail.status === 'RECEIVED') {
            setStep(6)
          } else {
            setStep(4)
          }
        })
        .catch((err) => {
          setDraftError(err instanceof Error ? err.message : 'Error al cargar la compra existente.')
        })
    }
  }, [initialPurchaseId])

  // Load catalog products for line matching
  useEffect(() => {
    if (step === 4) {
      fetchAdminProducts({ status: 'active' })
        .then(setActiveProducts)
        .catch(() => {})
    }
  }, [step])

  // Selected supplier object
  const currentSupplier = useMemo(() => {
    return knownSuppliers.find((s) => s.id === selectedSupplierId) || null
  }, [knownSuppliers, selectedSupplierId])

  // Calculate expected total cents from current lines
  const expectedTotalCents = useMemo(() => {
    return calculateExpectedTotalCents(items)
  }, [items])

  // Line item modifiers
  const handleAddLine = () => {
    setItems((prev) => [
      ...prev,
      {
        lineNumber: prev.length + 1,
        rawDescription: '',
        containerCode: 'GEN',
        suggestedCommonName: '',
        suggestedPresentation: '',
        quantity: 1,
        unitCostCents: 0,
      },
    ])
  }

  const handleRemoveLine = (idx: number) => {
    setItems((prev) => {
      const filtered = prev.filter((_, i) => i !== idx)
      return filtered.map((it, i) => ({ ...it, lineNumber: i + 1 }))
    })
  }

  const handleUpdateLine = <K extends keyof PurchaseSourceItem>(
    idx: number,
    field: K,
    value: PurchaseSourceItem[K],
  ) => {
    setItems((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  // Handle text imports (JSON / CSV)
  const handleApplyTextImport = () => {
    setDraftError(null)
    try {
      if (importMode === 'json') {
        const res = parseManualOrPasteJson(importText)
        setItems(res.items)
      } else if (importMode === 'csv') {
        const res = parseCsv(importText)
        setItems(res.items)
      }
      setImportMode('manual')
      setImportText('')
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Error al interpretar el texto importado.')
    }
  }

  // Handle local PDF import
  const handlePdfFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSourceFileName(sanitizeFileName(file.name))
    setIsExtractingPdf(true)
    setPdfWarning(null)
    setDraftError(null)

    try {
      const res = await extractFromLocalPdf(file)
      if (res.items.length > 0) {
        setItems(res.items)
        setImportMode('manual')
      }
      if (res.warning) {
        setPdfWarning(res.warning)
      }
    } catch {
      setPdfWarning('No pudimos extraer los renglones automáticamente. Puedes capturarlos o pegarlos manualmente.')
    } finally {
      setIsExtractingPdf(false)
      e.target.value = ''
    }
  }

  // Step 3 -> 4: Create draft via RPC
  const handleCreateDraft = async () => {
    if (!selectedSupplierId) {
      setDraftError('Debes seleccionar o crear un proveedor.')
      return
    }

    const validationMsg = validatePurchaseLines(items)
    if (validationMsg) {
      setDraftError(validationMsg)
      return
    }

    setIsCreatingDraft(true)
    setDraftError(null)

    try {
      const detail = await createSupplierPurchaseDraft({
        supplierId: selectedSupplierId,
        documentDate,
        externalReference: externalReference.trim() || null,
        paymentTerms,
        expectedTotalCents,
        sourceFileName,
        items,
        idempotencyKey: idempotencyKeyRef.current,
      })

      setPurchaseDetail(detail)
      setStep(4)
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Error al registrar el borrador de compra.')
    } finally {
      setIsCreatingDraft(false)
    }
  }

  // Step 4: Line resolution handlers
  const handleResolveMatch = async (itemId: string, product: AdminProduct) => {
    if (!purchaseDetail) return
    setResolvingItemId(itemId)
    setDraftError(null)

    try {
      await resolveSupplierPurchaseItem({
        itemId,
        resolution: 'MATCHED',
        productId: product.id,
        normalizedName: product.commonName,
        presentation: null,
      })

      const updated = await fetchSupplierPurchaseDetail(purchaseDetail.id)
      setPurchaseDetail(updated)
      setActiveItemForSearch(null)
      setSearchProductQuery('')
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Error al relacionar el producto con el renglón.')
    } finally {
      setResolvingItemId(null)
    }
  }

  const handleResolveIgnore = async (itemId: string) => {
    if (!purchaseDetail) return
    setResolvingItemId(itemId)
    setDraftError(null)

    try {
      await resolveSupplierPurchaseItem({
        itemId,
        resolution: 'IGNORED',
        productId: null,
        normalizedName: null,
        presentation: null,
      })

      const updated = await fetchSupplierPurchaseDetail(purchaseDetail.id)
      setPurchaseDetail(updated)
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : 'Error al ignorar el renglón.')
    } finally {
      setResolvingItemId(null)
    }
  }

  // Step 5: Confirm Reception
  const handleConfirmReception = async () => {
    if (!purchaseDetail) return

    if (purchaseDetail.unmatchedCount > 0) {
      setConfirmError(`Aún tienes ${purchaseDetail.unmatchedCount} renglones pendientes por relacionar.`)
      return
    }

    const hasMatched = purchaseDetail.items.some(
      (it) => it.resolutionStatus === 'MATCHED' || it.resolutionStatus === 'AUTO_MATCHED'
    )
    if (!hasMatched) {
      setConfirmError('Debe haber al menos un renglón relacionado para dar entrada a inventario.')
      return
    }

    setIsConfirming(true)
    setConfirmError(null)

    try {
      const updated = await fetchSupplierPurchaseDetail(purchaseDetail.id)
      if (updated.status === 'RECEIVED') {
        setPurchaseDetail(updated)
        setStep(6)
        return
      }

      const confirmed = await confirmSupplierPurchase({
        purchaseId: purchaseDetail.id,
        confirmationKey: confirmationKeyRef.current,
      })

      setPurchaseDetail(confirmed)
      setStep(6)
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Error al confirmar la recepción.')
    } finally {
      setIsConfirming(false)
    }
  }

  // Build QR labels from matched received items
  const matchedLabels = useMemo(() => {
    if (!purchaseDetail) return []
    const labels: Array<{ product: AdminProduct; count: number; qrLabels: ReturnType<typeof buildProductQrLabels> }> = []

    for (const item of purchaseDetail.items) {
      if ((item.resolutionStatus === 'MATCHED' || item.resolutionStatus === 'AUTO_MATCHED') && item.productId) {
        const prod = activeProducts.find((p) => p.id === item.productId)
        if (prod && isValidLabelInternalCode(prod.internalCode)) {
          const count = Math.min(item.quantity, 100) // max batch 100
          try {
            labels.push({
              product: prod,
              count,
              qrLabels: buildProductQrLabels(prod, count),
            })
          } catch {
            // ignore invalid internal code
          }
        }
      }
    }
    return labels
  }, [purchaseDetail, activeProducts])

  // Filtered products for search dropdown in Step 4
  const filteredProducts = useMemo(() => {
    if (!searchProductQuery.trim()) return activeProducts.slice(0, 15)
    const q = searchProductQuery.toLowerCase()
    return activeProducts
      .filter((p) => p.commonName.toLowerCase().includes(q) || p.internalCode.toLowerCase().includes(q))
      .slice(0, 20)
  }, [activeProducts, searchProductQuery])

  // Printable batches if total labels > 100
  const activeLabelBatch = matchedLabels[labelBatchIndex] || null

  return (
    <div className="purchase-wizard-container">
      {/* Stepper Header */}
      <div className="purchase-stepper" aria-label="Progreso del registro de compra">
        {[
          { num: 1, label: 'Proveedor' },
          { num: 2, label: 'Renglones' },
          { num: 3, label: 'Borrador' },
          { num: 4, label: 'Relacionar' },
          { num: 5, label: 'Confirmar' },
          { num: 6, label: 'Etiquetas QR' },
        ].map((s) => (
          <div
            key={s.num}
            className={`step-item ${step === s.num ? 'active' : ''} ${step > s.num ? 'completed' : ''}`}
          >
            <span className="step-circle">{step > s.num ? '✓' : s.num}</span>
            <span className="step-label">{s.label}</span>
          </div>
        ))}
      </div>

      {draftError && <div className="admin-dialog-error" role="alert">{draftError}</div>}
      {confirmError && <div className="admin-dialog-error" role="alert">{confirmError}</div>}

      {/* PASO 1: Proveedor y documento */}
      {step === 1 && (
        <section className="botanical-section-card" aria-labelledby="step-1-title">
          <div className="botanical-section-header">
            <span>🏢</span>
            <h3 id="step-1-title">Paso 1: Proveedor y Documento</h3>
          </div>

          <div className="form-row">
            <div className="admin-form-group form-group" style={{ flex: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="wizard-supplier">Proveedor *</label>
                <button
                  type="button"
                  className="mini-action-btn primary"
                  onClick={() => setIsCreateSupplierOpen(true)}
                >
                  + Agregar nuevo proveedor
                </button>
              </div>
              <select
                id="wizard-supplier"
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                required
              >
                <option value="" disabled>Selecciona un proveedor conocido</option>
                {knownSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.code}] {s.name}
                  </option>
                ))}
              </select>
              {knownSuppliers.length === 0 && (
                <small style={{ color: 'var(--text-secondary)' }}>
                  Aún no hay proveedores registrados en compras previas. Usa el botón "+ Agregar nuevo proveedor".
                </small>
              )}
            </div>

            <div className="admin-form-group form-group" style={{ flex: 1 }}>
              <label htmlFor="wizard-date">Fecha del Documento *</label>
              <input
                id="wizard-date"
                type="date"
                required
                value={documentDate}
                onChange={(e) => setDocumentDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="admin-form-group form-group">
              <label htmlFor="wizard-reference">Folio o Referencia Externa</label>
              <input
                id="wizard-reference"
                type="text"
                placeholder="Ej. FAC-4921 o NOTA-0082"
                value={externalReference}
                onChange={(e) => setExternalReference(e.target.value)}
              />
            </div>

            <div className="admin-form-group form-group">
              <label htmlFor="wizard-terms">Condiciones de Pago *</label>
              <select
                id="wizard-terms"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)}
              >
                <option value="CASH">Contado</option>
                <option value="CREDIT">Crédito</option>
                <option value="OTHER">Otro</option>
              </select>
            </div>

            <div className="admin-form-group form-group">
              <label htmlFor="wizard-filename">Archivo de Origen</label>
              <input
                id="wizard-filename"
                type="text"
                placeholder="Nombre de archivo (opcional)"
                value={sourceFileName || ''}
                onChange={(e) => setSourceFileName(sanitizeFileName(e.target.value))}
              />
            </div>
          </div>

          <div className="wizard-actions-bar">
            <button type="button" className="secondary-auth-btn" onClick={onCancel}>
              Cancelar
            </button>
            <button
              type="button"
              className="submit-db-btn"
              disabled={!selectedSupplierId || !documentDate}
              onClick={() => setStep(2)}
            >
              Continuar a Renglones →
            </button>
          </div>
        </section>
      )}

      {/* PASO 2: Importar y revisar renglones */}
      {step === 2 && (
        <section className="botanical-section-card" aria-labelledby="step-2-title">
          <div className="botanical-section-header">
            <span>📋</span>
            <h3 id="step-2-title">Paso 2: Renglones de la Compra</h3>
          </div>

          {/* Opciones de carga: Captura manual, Pegar JSON, Importar CSV, Seleccionar PDF */}
          <div className="import-mode-bar" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`mini-action-btn ${importMode === 'manual' ? 'primary' : ''}`}
              onClick={() => setImportMode('manual')}
            >
              ✏️ Captura Manual
            </button>
            <button
              type="button"
              className={`mini-action-btn ${importMode === 'json' ? 'primary' : ''}`}
              onClick={() => setImportMode('json')}
            >
              📋 Pegar JSON
            </button>
            <button
              type="button"
              className={`mini-action-btn ${importMode === 'csv' ? 'primary' : ''}`}
              onClick={() => setImportMode('csv')}
            >
              📄 Pegar o Importar CSV
            </button>
            <label className={`mini-action-btn ${isExtractingPdf ? 'disabled' : ''}`} style={{ cursor: 'pointer' }}>
              📑 Seleccionar PDF Local
              <input
                type="file"
                accept=".pdf,application/pdf"
                style={{ display: 'none' }}
                onChange={handlePdfFileSelect}
                disabled={isExtractingPdf}
              />
            </label>
            {isExtractingPdf && <span style={{ fontSize: '0.85rem', color: 'var(--primary-color)' }}>Analizando PDF localmente...</span>}
          </div>

          {pdfWarning && (
            <div className="admin-dialog-error" style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#b45309' }} role="status">
              {pdfWarning}
            </div>
          )}

          {/* Area de pegado de JSON o CSV */}
          {(importMode === 'json' || importMode === 'csv') && (
            <div className="import-paste-area" style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="import-textarea">
                Pega aquí tu contenido en formato {importMode.toUpperCase()}:
              </label>
              <textarea
                id="import-textarea"
                rows={5}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={
                  importMode === 'json'
                    ? `[\n  { "lineNumber": 1, "rawDescription": "CLOROFITO", "containerCode": "M10", "quantity": 7, "unitCostCents": 6000 }\n]`
                    : `Descripción, Contenedor, Cantidad, Costo Unitario\nCLOROFITO, M10, 7, 60.00`
                }
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="mini-action-btn primary" onClick={handleApplyTextImport}>
                  Procesar renglones
                </button>
                <button type="button" className="mini-action-btn" onClick={() => setImportMode('manual')}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Tabla editable de renglones */}
          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>#</th>
                  <th>Descripción original *</th>
                  <th style={{ width: '110px' }}>Envase / Cód.</th>
                  <th>Nombre sugerido</th>
                  <th>Presentación</th>
                  <th style={{ width: '90px' }}>Cant. *</th>
                  <th style={{ width: '120px' }}>Costo U. (MXN) *</th>
                  <th style={{ width: '130px' }}>Importe</th>
                  <th style={{ width: '50px' }}>Quitar</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const lineTotalPesos = (it.quantity * it.unitCostCents) / 100
                  return (
                    <tr key={idx}>
                      <td><strong>{it.lineNumber}</strong></td>
                      <td>
                        <input
                          type="text"
                          required
                          value={it.rawDescription}
                          onChange={(e) => handleUpdateLine(idx, 'rawDescription', e.target.value)}
                          placeholder="Ej. CLOROFITO LISTÓN"
                          style={{ width: '100%', minWidth: '140px' }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={it.containerCode}
                          onChange={(e) => handleUpdateLine(idx, 'containerCode', e.target.value.toUpperCase())}
                          placeholder="M10"
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={it.suggestedCommonName || ''}
                          onChange={(e) => handleUpdateLine(idx, 'suggestedCommonName', e.target.value || null)}
                          placeholder="Opcional"
                          style={{ width: '100%', minWidth: '120px' }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={it.suggestedPresentation || ''}
                          onChange={(e) => handleUpdateLine(idx, 'suggestedPresentation', e.target.value || null)}
                          placeholder="Opcional"
                          style={{ width: '100%', minWidth: '120px' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          required
                          value={it.quantity}
                          onChange={(e) => handleUpdateLine(idx, 'quantity', Math.max(1, parseInt(e.target.value, 10) || 1))}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={centsToPesos(it.unitCostCents)}
                          onChange={(e) => handleUpdateLine(idx, 'unitCostCents', pesosToCents(e.target.value))}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <strong>
                          ${lineTotalPesos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </strong>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="mini-action-btn"
                          style={{ color: '#ef4444' }}
                          onClick={() => handleRemoveLine(idx)}
                          disabled={items.length <= 1}
                          title="Eliminar renglón"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
            <button type="button" className="mini-action-btn primary" onClick={handleAddLine}>
              + Agregar otro renglón
            </button>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total esperado calculado:</span>
              <h3 style={{ color: 'var(--primary-color)', margin: 0 }}>
                {centsToFormattedMxn(expectedTotalCents)}
              </h3>
            </div>
          </div>

          <div className="wizard-actions-bar">
            <button type="button" className="secondary-auth-btn" onClick={() => setStep(1)}>
              ← Volver a Proveedor
            </button>
            <button
              type="button"
              className="submit-db-btn"
              disabled={items.length === 0}
              onClick={() => setStep(3)}
            >
              Revisar y Crear Borrador →
            </button>
          </div>
        </section>
      )}

      {/* PASO 3: Resumen y creación de borrador */}
      {step === 3 && (
        <section className="botanical-section-card" aria-labelledby="step-3-title">
          <div className="botanical-section-header">
            <span>📝</span>
            <h3 id="step-3-title">Paso 3: Confirmar y Crear Borrador (DRAFT)</h3>
          </div>

          <div className="purchase-summary-box" style={{ background: 'var(--surface-color)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', marginBottom: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <span className="eyebrow">Proveedor</span>
                <strong>[{currentSupplier?.code}] {currentSupplier?.name}</strong>
              </div>
              <div>
                <span className="eyebrow">Fecha de Documento</span>
                <strong>{documentDate}</strong>
              </div>
              <div>
                <span className="eyebrow">Referencia / Folio</span>
                <strong>{externalReference || '(Sin referencia)'}</strong>
              </div>
              <div>
                <span className="eyebrow">Condiciones</span>
                <strong>{paymentTerms === 'CASH' ? 'Contado' : paymentTerms === 'CREDIT' ? 'Crédito' : 'Otro'}</strong>
              </div>
              <div>
                <span className="eyebrow">Renglones</span>
                <strong>{items.length} partidas</strong>
              </div>
              <div>
                <span className="eyebrow">Total Esperado</span>
                <strong style={{ color: '#10b981', fontSize: '1.2rem' }}>{centsToFormattedMxn(expectedTotalCents)}</strong>
              </div>
            </div>
          </div>

          <div className="note-card" style={{ padding: '0.85rem 1rem', borderRadius: 'var(--radius-sm)', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: '1.5rem' }}>
            ℹ️ <strong>Nota de Seguridad:</strong> La creación de este documento quedará en estado <strong>DRAFT (Borrador)</strong>. Un borrador <strong>NO</strong> modifica el inventario de la sucursal hasta que confirmes la recepción en el Paso 5.
          </div>

          <div className="wizard-actions-bar">
            <button type="button" className="secondary-auth-btn" onClick={() => setStep(2)} disabled={isCreatingDraft}>
              ← Regresar a Renglones
            </button>
            <button
              type="button"
              className="submit-db-btn"
              onClick={handleCreateDraft}
              disabled={isCreatingDraft}
            >
              {isCreatingDraft ? 'Guardando borrador en Supabase...' : 'Guardar Borrador de Compra ✓'}
            </button>
          </div>
        </section>
      )}

      {/* PASO 4: Relacionar productos */}
      {step === 4 && purchaseDetail && (
        <section className="botanical-section-card" aria-labelledby="step-4-title">
          <div className="botanical-section-header">
            <span>🔗</span>
            <h3 id="step-4-title">Paso 4: Relacionar Renglones con el Catálogo</h3>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Compra #{purchaseDetail.id.slice(0, 8)} • Proveedor: <strong>{purchaseDetail.supplier.name}</strong>
              </p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem' }}>
                Renglones sin relacionar: <strong style={{ color: purchaseDetail.unmatchedCount > 0 ? '#ef4444' : '#10b981' }}>{purchaseDetail.unmatchedCount}</strong>
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="mini-action-btn"
                onClick={() => {
                  fetchSupplierPurchaseDetail(purchaseDetail.id).then(setPurchaseDetail)
                }}
              >
                ↻ Actualizar detalle
              </button>
            </div>
          </div>

          {/* Listado de renglones y sus resoluciones */}
          <div className="table-responsive">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th>Descripción del Proveedor</th>
                  <th style={{ width: '110px' }}>Envase</th>
                  <th style={{ width: '70px' }}>Cant.</th>
                  <th style={{ width: '100px' }}>Costo U.</th>
                  <th style={{ width: '120px' }}>Estado</th>
                  <th>Producto Asociado</th>
                  <th style={{ width: '280px' }}>Acciones de Relación</th>
                </tr>
              </thead>
              <tbody>
                {purchaseDetail.items.map((it) => {
                  const isUnmatched = it.resolutionStatus === 'UNMATCHED'
                  const isIgnored = it.resolutionStatus === 'IGNORED'
                  const matchedProduct = activeProducts.find((p) => p.id === it.productId)

                  // Check if container code looks unconfirmed (e.g. B02, M06, M10)
                  const hasSuspiciousCode = /^(B02|M06|M10|M08|M12|M14|GEN)$/i.test(it.containerCode)

                  return (
                    <tr key={it.id} style={{ background: isUnmatched ? 'rgba(245, 158, 11, 0.05)' : undefined }}>
                      <td><strong>{it.lineNumber}</strong></td>
                      <td>
                        <strong>{it.rawDescription}</strong>
                        {it.suggestedCommonName && (
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            Sugerido: {it.suggestedCommonName}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="code-badge">{it.containerCode}</span>
                        {hasSuspiciousCode && (
                          <span
                            title="Código sin medida física confirmada"
                            style={{ cursor: 'pointer', marginLeft: '0.25rem', color: '#f59e0b' }}
                            onClick={() => {
                              setPresentationModalData({
                                supplierId: purchaseDetail.supplier.id,
                                supplierName: purchaseDetail.supplier.name,
                                initialCode: it.containerCode,
                              })
                            }}
                          >
                            ⚠️
                          </span>
                        )}
                      </td>
                      <td>{it.quantity}</td>
                      <td>${centsToPesos(it.unitCostCents)}</td>
                      <td>
                        <span className={`status-badge-res ${it.resolutionStatus.toLowerCase()}`}>
                          {it.resolutionStatus === 'UNMATCHED' && 'Pendiente'}
                          {it.resolutionStatus === 'AUTO_MATCHED' && 'Auto-relacionado'}
                          {it.resolutionStatus === 'MATCHED' && 'Relacionado'}
                          {it.resolutionStatus === 'IGNORED' && 'Ignorado'}
                        </span>
                      </td>
                      <td>
                        {matchedProduct ? (
                          <div>
                            <strong>{matchedProduct.commonName}</strong>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Cód: {matchedProduct.internalCode} • Venta: ${centsToPesos(matchedProduct.priceCents)}
                            </span>
                          </div>
                        ) : isIgnored ? (
                          <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Renglón omitido</span>
                        ) : (
                          <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>Sin producto asociado</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          {/* Buscar producto existente */}
                          <button
                            type="button"
                            className="mini-action-btn primary"
                            disabled={resolvingItemId === it.id}
                            onClick={() => {
                              setActiveItemForSearch(activeItemForSearch === it.id ? null : it.id)
                              setSearchProductQuery(it.suggestedCommonName || it.rawDescription)
                            }}
                          >
                            🔍 {activeItemForSearch === it.id ? 'Cerrar búsqueda' : 'Relacionar'}
                          </button>

                          {/* Crear nuevo producto */}
                          <button
                            type="button"
                            className="mini-action-btn"
                            disabled={resolvingItemId === it.id}
                            onClick={() => {
                              setProductCreateModalData({
                                itemId: it.id,
                                suggestedCommonName: it.suggestedCommonName || it.rawDescription,
                                suggestedPresentation: it.suggestedPresentation || it.containerCode,
                                unitCostCents: it.unitCostCents,
                              })
                            }}
                          >
                            + Crear producto
                          </button>

                          {/* Configurar envase */}
                          <button
                            type="button"
                            className="mini-action-btn"
                            title="Configurar significado de envase en proveedor"
                            onClick={() => {
                              setPresentationModalData({
                                supplierId: purchaseDetail.supplier.id,
                                supplierName: purchaseDetail.supplier.name,
                                initialCode: it.containerCode,
                              })
                            }}
                          >
                            📐 Envase
                          </button>

                          {/* Marcar como ignorado */}
                          {!isIgnored && (
                            <button
                              type="button"
                              className="mini-action-btn"
                              style={{ color: '#64748b' }}
                              disabled={resolvingItemId === it.id}
                              onClick={() => handleResolveIgnore(it.id)}
                            >
                              Omitir
                            </button>
                          )}
                        </div>

                        {/* Dropdown de búsqueda rápida de producto para este renglón */}
                        {activeItemForSearch === it.id && (
                          <div
                            style={{
                              marginTop: '0.5rem',
                              padding: '0.5rem',
                              background: 'var(--surface-color)',
                              border: '1px solid var(--primary-color)',
                              borderRadius: 'var(--radius-sm)',
                              boxShadow: 'var(--shadow-md)',
                            }}
                          >
                            <input
                              type="text"
                              placeholder="Buscar por nombre o código interno..."
                              value={searchProductQuery}
                              onChange={(e) => setSearchProductQuery(e.target.value)}
                              style={{ width: '100%', marginBottom: '0.4rem', fontSize: '0.8rem' }}
                              autoFocus
                            />
                            <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              {filteredProducts.length === 0 ? (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  No se encontraron productos activos con ese criterio.
                                </span>
                              ) : (
                                filteredProducts.map((prod) => (
                                  <button
                                    key={prod.id}
                                    type="button"
                                    className="mini-action-btn"
                                    style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', width: '100%' }}
                                    onClick={() => handleResolveMatch(it.id, prod)}
                                  >
                                    <span><strong>{prod.commonName}</strong> ({prod.internalCode})</span>
                                    <span style={{ color: '#10b981' }}>${centsToPesos(prod.priceCents)}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="wizard-actions-bar">
            <button type="button" className="secondary-auth-btn" onClick={onCompleted}>
              Pausar y volver a la lista
            </button>
            <button
              type="button"
              className="submit-db-btn"
              disabled={purchaseDetail.unmatchedCount > 0}
              onClick={() => setStep(5)}
            >
              {purchaseDetail.unmatchedCount > 0
                ? `Faltan ${purchaseDetail.unmatchedCount} renglones por resolver`
                : 'Continuar a Confirmación de Recepción →'}
            </button>
          </div>
        </section>
      )}

      {/* PASO 5: Confirmar recepción */}
      {step === 5 && purchaseDetail && (
        <section className="botanical-section-card" aria-labelledby="step-5-title">
          <div className="botanical-section-header">
            <span>📦</span>
            <h3 id="step-5-title">Paso 5: Confirmar Recepción de Inventario</h3>
          </div>

          <div className="purchase-summary-box" style={{ background: 'var(--surface-color)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--surface-border)', marginBottom: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <span className="eyebrow">Proveedor</span>
                <strong>[{purchaseDetail.supplier.code}] {purchaseDetail.supplier.name}</strong>
              </div>
              <div>
                <span className="eyebrow">Sucursal Activa</span>
                <strong>{branch?.name || 'Sucursal Asignada'}</strong>
              </div>
              <div>
                <span className="eyebrow">Total Compra</span>
                <strong style={{ color: '#10b981', fontSize: '1.2rem' }}>{centsToFormattedMxn(purchaseDetail.expectedTotalCents)}</strong>
              </div>
              <div>
                <span className="eyebrow">Renglones Relacionados</span>
                <strong>
                  {purchaseDetail.items.filter((it) => it.resolutionStatus === 'MATCHED' || it.resolutionStatus === 'AUTO_MATCHED').length} partidas
                </strong>
              </div>
              <div>
                <span className="eyebrow">Unidades Entrantes</span>
                <strong>
                  {purchaseDetail.items
                    .filter((it) => it.resolutionStatus === 'MATCHED' || it.resolutionStatus === 'AUTO_MATCHED')
                    .reduce((acc, it) => acc + it.quantity, 0)}{' '}
                  unidades
                </strong>
              </div>
              <div>
                <span className="eyebrow">Renglones Ignorados</span>
                <strong>{purchaseDetail.items.filter((it) => it.resolutionStatus === 'IGNORED').length} partidas</strong>
              </div>
            </div>
          </div>

          <div className="warning-card" style={{ padding: '1rem', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', marginBottom: '1.5rem' }}>
            ⚠️ <strong>ADVERTENCIA DEFINITIVA DE INVENTARIO:</strong>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
              Al confirmar esta recepción, el backend de Supabase creará movimientos autoritativos de tipo{' '}
              <strong>RECEPTION</strong> y aumentará las existencias en la sucursal <strong>{branch?.name}</strong>.
              Esta acción no puede deshacerse desde el borrador.
            </p>
          </div>

          <div className="wizard-actions-bar">
            <button type="button" className="secondary-auth-btn" onClick={() => setStep(4)} disabled={isConfirming}>
              ← Volver a Relacionar
            </button>
            <button
              type="button"
              className="submit-db-btn"
              style={{ background: '#10b981' }}
              onClick={handleConfirmReception}
              disabled={isConfirming || purchaseDetail.unmatchedCount > 0}
            >
              {isConfirming ? 'Procesando movimientos en Supabase...' : 'Confirmar Recepción e Incrementar Stock ✓'}
            </button>
          </div>
        </section>
      )}

      {/* PASO 6: Etiquetas QR */}
      {step === 6 && purchaseDetail && (
        <section className="botanical-section-card" aria-labelledby="step-6-title">
          <div className="botanical-section-header">
            <span>🏷️</span>
            <h3 id="step-6-title">Paso 6: Etiquetas QR de Entrada</h3>
          </div>

          <div className="success-banner" style={{ padding: '1rem', borderRadius: 'var(--radius-sm)', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', marginBottom: '1.5rem' }}>
            🎉 <strong>¡Recepción Confirmada Exitosamente!</strong>
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem' }}>
              El inventario ha sido actualizado en la sucursal activa. Ahora puedes imprimir las etiquetas QR (50 x 30 mm) para colocar en las macetas o productos recibidos.
            </p>
          </div>

          {/* Listado de productos recibidos para imprimir */}
          <h4>Productos Recibidos</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {matchedLabels.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No hay productos con código interno válido para generar etiquetas.</p>
            ) : (
              matchedLabels.map((batch, index) => (
                <div
                  key={batch.product.id}
                  style={{
                    padding: '0.75rem 1rem',
                    background: 'var(--surface-color)',
                    border: '1px solid var(--surface-border)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong>{batch.product.commonName}</strong>
                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Código interno: <code>{batch.product.internalCode}</code> • Cantidad recibida: {batch.count}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="mini-action-btn primary"
                    onClick={() => {
                      setLabelBatchIndex(index)
                      requestAnimationFrame(() => window.print())
                    }}
                  >
                    🖨️ Imprimir {batch.count} etiquetas
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Vista previa de etiquetas QR del lote seleccionado */}
          {activeLabelBatch && (
            <div className="product-label-print-root" aria-label={`Vista previa de ${activeLabelBatch.count} etiquetas`}>
              {activeLabelBatch.qrLabels.map((label, idx) => (
                <ProductQrLabelCard label={label} key={label.internalCode + '-' + idx} />
              ))}
            </div>
          )}

          <div className="wizard-actions-bar" style={{ marginTop: '1.5rem' }}>
            {onNavigateToCatalog && (
              <button type="button" className="secondary-auth-btn" onClick={onNavigateToCatalog}>
                🌿 Ir a Catálogo y Plantas
              </button>
            )}
            <button type="button" className="submit-db-btn" onClick={onCompleted}>
              Finalizar y Volver a Compras ✓
            </button>
          </div>
        </section>
      )}

      {/* Modal para Crear Proveedor */}
      <SupplierCreateModal
        isOpen={isCreateSupplierOpen}
        onClose={() => setIsCreateSupplierOpen(false)}
        onCreated={(supplier) => {
          onSupplierAdded(supplier)
          setSelectedSupplierId(supplier.id)
        }}
      />

      {/* Modal para Configurar Presentación / Envase */}
      {presentationModalData && (
        <SupplierPresentationModal
          isOpen={true}
          supplierId={presentationModalData.supplierId}
          supplierName={presentationModalData.supplierName}
          initialCode={presentationModalData.initialCode}
          onClose={() => setPresentationModalData(null)}
          onSave={async (code, displayName, nominalSize, sizeUnit, notes) => {
            await setSupplierPresentation({
              supplierId: presentationModalData.supplierId,
              code,
              displayName,
              nominalSize,
              sizeUnit,
              notes,
            })
            if (purchaseDetail) {
              const updated = await fetchSupplierPurchaseDetail(purchaseDetail.id)
              setPurchaseDetail(updated)
            }
          }}
        />
      )}

      {/* Modal para Crear Producto Nuevo desde Renglón */}
      {productCreateModalData && (
        <AdminProductCreateModal
          isOpen={true}
          initialCommonName={productCreateModalData.suggestedCommonName}
          suggestedPresentation={productCreateModalData.suggestedPresentation}
          unitCostCents={productCreateModalData.unitCostCents}
          onClose={() => setProductCreateModalData(null)}
          onCreated={async (newProduct) => {
            setActiveProducts((prev) => [newProduct, ...prev])
            await handleResolveMatch(productCreateModalData.itemId, newProduct)
            setProductCreateModalData(null)
          }}
        />
      )}
    </div>
  )
}
