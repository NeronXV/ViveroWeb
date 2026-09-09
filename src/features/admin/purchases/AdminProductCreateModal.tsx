import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchAdminCategories, upsertProduct } from '../admin-catalog-service'
import { centsToPesos, pesosToCents } from '../admin-catalog-parser'
import type { AdminCategory, AdminProduct, ProductUnit } from '../admin-catalog-types'

interface AdminProductCreateModalProps {
  isOpen: boolean
  initialCommonName?: string
  initialInternalCode?: string
  suggestedPresentation?: string
  unitCostCents?: number
  onClose: () => void
  onCreated: (product: AdminProduct) => void
}

export function AdminProductCreateModal({
  isOpen,
  initialCommonName = '',
  initialInternalCode = '',
  suggestedPresentation = '',
  unitCostCents = 0,
  onClose,
  onCreated,
}: AdminProductCreateModalProps) {
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [isLoadingCategories, setIsLoadingCategories] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Product fields
  const [internalCode, setInternalCode] = useState(initialInternalCode)
  const [barcode, setBarcode] = useState('')
  const [commonName, setCommonName] = useState(initialCommonName)
  const [scientificName, setScientificName] = useState('')
  const [description, setDescription] = useState(suggestedPresentation ? `Presentación: ${suggestedPresentation}` : '')
  const [categoryId, setCategoryId] = useState('')
  const [priceStr, setPriceStr] = useState('')
  const [wholesalePriceStr, setWholesalePriceStr] = useState('')
  const [unit, setUnit] = useState<ProductUnit>('pieza')
  const [minimumStock, setMinimumStock] = useState('0')
  const [isActive, setIsActive] = useState(true)

  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setInternalCode(initialInternalCode.toUpperCase())
    setCommonName(initialCommonName)
    setDescription(suggestedPresentation ? `Presentación: ${suggestedPresentation}` : '')
    setPriceStr('')
    setWholesalePriceStr('')
    setError(null)

    let isMounted = true
    setIsLoadingCategories(true)
    fetchAdminCategories()
      .then((cats) => {
        if (isMounted) {
          setCategories(cats)
          if (cats.length > 0) {
            setCategoryId((prev) => prev || cats[0].id)
          }
        }
      })
      .catch(() => {
        if (isMounted) setError('No fue posible cargar las categorías del catálogo.')
      })
      .finally(() => {
        if (isMounted) setIsLoadingCategories(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, initialCommonName, initialInternalCode, suggestedPresentation])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedCode = internalCode.trim().toUpperCase()
    const trimmedName = commonName.trim()

    if (!trimmedCode || trimmedCode.length < 2 || trimmedCode.length > 40) {
      setError('El código interno debe tener entre 2 y 40 caracteres.')
      return
    }

    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 160) {
      setError('El nombre común debe tener entre 2 y 160 caracteres.')
      return
    }

    if (!categoryId) {
      setError('Debes seleccionar una categoría.')
      return
    }

    if (!priceStr.trim()) {
      setError('Debes ingresar un precio de venta al público en catálogo.')
      return
    }

    const finalPriceCents = pesosToCents(priceStr)
    if (finalPriceCents <= 0) {
      setError('El precio de venta debe ser mayor a cero.')
      return
    }

    const finalWholesalePriceCents = wholesalePriceStr.trim() !== '' ? pesosToCents(wholesalePriceStr) : null

    const stockNum = parseFloat(minimumStock)
    if (isNaN(stockNum) || stockNum < 0) {
      setError('La existencia mínima debe ser un número mayor o igual a cero.')
      return
    }

    setIsSubmitting(true)
    try {
      const created = await upsertProduct({
        internalCode: trimmedCode,
        barcode: barcode.trim() || null,
        commonName: trimmedName,
        scientificName: scientificName.trim() || null,
        description: description.trim() || null,
        categoryId,
        priceCents: finalPriceCents,
        wholesalePriceCents: finalWholesalePriceCents,
        unit,
        minimumStock: Math.round(stockNum),
        wateringAdvice: null,
        lightType: null,
        recommendedClimate: null,
        isActive,
      })

      onCreated(created)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el nuevo producto.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return createPortal(
    <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="product-create-title">
      <div className="admin-modal-content" ref={dialogRef} style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="admin-modal-header">
          <div>
            <p className="eyebrow">Alta de Producto en Catálogo</p>
            <h3 id="product-create-title">Crear Producto para Renglón</h3>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Cerrar modal">&times;</button>
        </div>

        {error && <div className="admin-dialog-error" role="alert">{error}</div>}

        {/* Separación visual entre costo de compra y precio de venta */}
        <div
          style={{
            background: 'var(--surface-color)',
            border: '1px solid var(--surface-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block' }}>
              Costo de Compra Proveedor (Referencia)
            </span>
            <strong style={{ fontSize: '1.1rem', color: '#10b981' }}>
              ${centsToPesos(unitCostCents)} MXN
            </strong>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: '240px', textAlign: 'right' }}>
            Establece un precio de venta al público para tu catálogo. Nunca se reemplaza automáticamente.
          </span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="admin-form-group form-group">
              <label htmlFor="prod-code">Código Interno *</label>
              <input
                id="prod-code"
                type="text"
                required
                maxLength={40}
                value={internalCode}
                onChange={(e) => setInternalCode(e.target.value.toUpperCase())}
                placeholder="Ej. SUC-ALOE-01"
                disabled={isSubmitting}
                autoFocus
              />
            </div>
            <div className="admin-form-group form-group">
              <label htmlFor="prod-barcode">Código de Barras (opcional)</label>
              <input
                id="prod-barcode"
                type="text"
                maxLength={128}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Ej. 7501234567890"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="admin-form-group form-group">
              <label htmlFor="prod-common">Nombre Común *</label>
              <input
                id="prod-common"
                type="text"
                required
                maxLength={160}
                value={commonName}
                onChange={(e) => setCommonName(e.target.value)}
                placeholder="Ej. Clorofito Listón"
                disabled={isSubmitting}
              />
            </div>
            <div className="admin-form-group form-group">
              <label htmlFor="prod-scientific">Nombre Científico</label>
              <input
                id="prod-scientific"
                type="text"
                maxLength={160}
                value={scientificName}
                onChange={(e) => setScientificName(e.target.value)}
                placeholder="Ej. Chlorophytum comosum"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="admin-form-group form-group">
              <label htmlFor="prod-category">Categoría *</label>
              <select
                id="prod-category"
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={isSubmitting || isLoadingCategories}
              >
                {categories.length === 0 && <option value="">Cargando categorías...</option>}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.isActive ? '' : '(Inactiva)'}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-form-group form-group">
              <label htmlFor="prod-unit">Unidad de Venta *</label>
              <select
                id="prod-unit"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value as ProductUnit)}
                disabled={isSubmitting}
              >
                <option value="pieza">Pieza</option>
                <option value="maceta">Maceta</option>
                <option value="charola">Charola</option>
                <option value="bolsa">Bolsa</option>
                <option value="kg">Kilogramo (kg)</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="admin-form-group form-group">
              <label htmlFor="prod-price">Precio de Venta Público (MXN) *</label>
              <input
                id="prod-price"
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="admin-form-group form-group">
              <label htmlFor="prod-wholesale">Precio Mayoreo (MXN opcional)</label>
              <input
                id="prod-wholesale"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={wholesalePriceStr}
                onChange={(e) => setWholesalePriceStr(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="admin-form-group form-group">
              <label htmlFor="prod-minstock">Existencia Mínima</label>
              <input
                id="prod-minstock"
                type="number"
                min="0"
                value={minimumStock}
                onChange={(e) => setMinimumStock(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="admin-form-group form-group" style={{ display: 'flex', alignItems: 'center', paddingTop: '1.8rem' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={isSubmitting}
                />
                Producto Activo en Catálogo
              </label>
            </div>
          </div>

          <div className="admin-form-group form-group">
            <label htmlFor="prod-desc">Descripción / Presentación</label>
            <textarea
              id="prod-desc"
              rows={2}
              maxLength={400}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalles sobre presentación, tamaño, etc."
              disabled={isSubmitting}
            />
          </div>

          <div className="admin-modal-footer">
            <button type="button" className="secondary-auth-btn" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" className="submit-db-btn" disabled={isSubmitting || !priceStr.trim() || !commonName.trim() || !internalCode.trim()}>
              {isSubmitting ? 'Guardando en catálogo...' : 'Crear y relacionar producto'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
