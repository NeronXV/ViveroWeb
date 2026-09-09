import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { validateSupplierCode } from './purchases-parser'
import { upsertSupplier } from './purchases-service'
import type { Supplier } from './purchases-types'

interface SupplierCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (supplier: Supplier) => void
}

export function SupplierCreateModal({ isOpen, onClose, onCreated }: SupplierCreateModalProps) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

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
    const trimmedName = name.trim()

    if (!validateSupplierCode(trimmedCode)) {
      setError('El código del proveedor debe tener entre 2 y 50 caracteres (letras, números y guiones).')
      return
    }

    if (!trimmedName || trimmedName.length < 2) {
      setError('El nombre o razón social del proveedor debe tener al menos 2 caracteres.')
      return
    }

    setIsSubmitting(true)
    try {
      const created = await upsertSupplier({
        code: trimmedCode,
        name: trimmedName,
      })
      onCreated(created)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar el proveedor.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return createPortal(
    <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="supplier-modal-title">
      <div className="admin-modal-content" ref={dialogRef} style={{ maxWidth: '480px' }}>
        <div className="admin-modal-header">
          <div>
            <p className="eyebrow">Proveedores</p>
            <h3 id="supplier-modal-title">Registrar Proveedor</h3>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Cerrar modal">&times;</button>
        </div>

        {error && <div className="admin-dialog-error" role="alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="admin-form-group">
            <label htmlFor="supplier-code">Código de Proveedor *</label>
            <input
              id="supplier-code"
              type="text"
              required
              maxLength={50}
              placeholder="Ej. PROV-MORELOS"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={isSubmitting}
              autoFocus
            />
            <small style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Letras, números y guiones. Se convertirá automáticamente a mayúsculas.
            </small>
          </div>

          <div className="admin-form-group">
            <label htmlFor="supplier-name">Nombre o Razón Social *</label>
            <input
              id="supplier-name"
              type="text"
              required
              maxLength={120}
              placeholder="Ej. Viveros y Follajes de Morelos S.A."
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="admin-modal-footer">
            <button type="button" className="secondary-auth-btn" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" className="submit-db-btn" disabled={isSubmitting || !code.trim() || !name.trim()}>
              {isSubmitting ? 'Guardando...' : 'Guardar proveedor'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
