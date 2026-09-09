import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SizeUnit } from './purchases-types'

interface SupplierPresentationModalProps {
  isOpen: boolean
  supplierId: string
  supplierName: string
  initialCode: string
  onClose: () => void
  onSave: (
    code: string,
    displayName: string,
    nominalSize: number | null,
    sizeUnit: SizeUnit | null,
    notes: string | null
  ) => Promise<void>
}

export function SupplierPresentationModal({
  isOpen,
  supplierName,
  initialCode,
  onClose,
  onSave,
}: SupplierPresentationModalProps) {
  const [code, setCode] = useState(initialCode)
  const [displayName, setDisplayName] = useState('')
  const [nominalSize, setNominalSize] = useState('')
  const [sizeUnit, setSizeUnit] = useState<SizeUnit | ''>('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setCode(initialCode)
    setDisplayName('')
    setNominalSize('')
    setSizeUnit('')
    setNotes('')
    setError(null)
  }, [initialCode, isOpen])

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

    const trimmedCode = code.trim().toUpperCase()
    const trimmedDisplayName = displayName.trim()

    if (!trimmedCode) {
      setError('El código del proveedor es requerido (ej. M10, B02).')
      return
    }

    if (!trimmedDisplayName || trimmedDisplayName.length < 2) {
      setError('El nombre descriptivo de la presentación debe tener al menos 2 caracteres.')
      return
    }

    let parsedSize: number | null = null
    if (nominalSize.trim() !== '') {
      const num = parseFloat(nominalSize)
      if (isNaN(num) || num <= 0) {
        setError('Si especificas una medida nominal, debe ser un número positivo.')
        return
      }
      parsedSize = num
    }

    const unitValue = sizeUnit ? (sizeUnit as SizeUnit) : null

    setIsSubmitting(true)
    try {
      await onSave(
        trimmedCode,
        trimmedDisplayName,
        parsedSize,
        unitValue,
        notes.trim() || null
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la presentación.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return createPortal(
    <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="presentation-modal-title">
      <div className="admin-modal-content" ref={dialogRef} style={{ maxWidth: '520px' }}>
        <div className="admin-modal-header">
          <div>
            <p className="eyebrow">Catálogo de Proveedor: {supplierName}</p>
            <h3 id="presentation-modal-title">Configurar Presentación / Envase</h3>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Cerrar modal">&times;</button>
        </div>

        {error && <div className="admin-dialog-error" role="alert">{error}</div>}

        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Define el significado de códigos de envase de este proveedor (como M10, B02, M06).
          Si la medida física aún es incierta, puedes guardar sólo el nombre descriptivo y notas dejando la medida vacía.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="admin-form-group">
            <label htmlFor="presentation-code">Código de Envase / Presentación *</label>
            <input
              id="presentation-code"
              type="text"
              required
              maxLength={20}
              placeholder="Ej. M10, B02, CHAR-72"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={isSubmitting}
            />
          </div>

          <div className="admin-form-group">
            <label htmlFor="presentation-name">Nombre Descriptivo *</label>
            <input
              id="presentation-name"
              type="text"
              required
              maxLength={100}
              placeholder="Ej. Maceta termoformada #10 (10 cm)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="form-row">
            <div className="admin-form-group">
              <label htmlFor="presentation-size">Medida Nominal (opcional)</label>
              <input
                id="presentation-size"
                type="number"
                step="0.1"
                min="0"
                placeholder="Ej. 10"
                value={nominalSize}
                onChange={(e) => setNominalSize(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="admin-form-group">
              <label htmlFor="presentation-unit">Unidad de Medida (opcional)</label>
              <select
                id="presentation-unit"
                value={sizeUnit}
                onChange={(e) => setSizeUnit(e.target.value as SizeUnit | '')}
                disabled={isSubmitting}
              >
                <option value="">(Sin especificar)</option>
                <option value="cm">Centímetros (cm)</option>
                <option value="in">Pulgadas (in)</option>
                <option value="l">Litros (l)</option>
                <option value="gal">Galones (gal)</option>
              </select>
            </div>
          </div>

          <div className="admin-form-group">
            <label htmlFor="presentation-notes">Notas u Observaciones (opcional)</label>
            <textarea
              id="presentation-notes"
              rows={2}
              maxLength={250}
              placeholder="Ej. Medida pendiente de confirmación física al recibir el lote."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="admin-modal-footer">
            <button type="button" className="secondary-auth-btn" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" className="submit-db-btn" disabled={isSubmitting || !displayName.trim() || !code.trim()}>
              {isSubmitting ? 'Guardando...' : 'Guardar presentación'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
