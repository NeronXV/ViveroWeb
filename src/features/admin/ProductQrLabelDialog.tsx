import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AdminProduct } from './admin-catalog-types'
import { buildProductQrLabels, createQrMatrix } from './product-qr-label'

function QrSvg({ content }: { content: string }) {
  const matrix = createQrMatrix(content)
  const quietZone = 4
  const size = matrix.length + quietZone * 2
  const path = matrix.flatMap((row, y) => row.flatMap((dark, x) => (
    dark ? [`M${x + quietZone} ${y + quietZone}h1v1h-1z`] : []
  ))).join('')

  return (
    <svg className="product-label-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Código QR del código interno ${content}`} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}

export function ProductQrLabelDialog({ product, onClose }: { product: AdminProduct; onClose: () => void }) {
  const [quantity, setQuantity] = useState(1)
  const previousFocus = useRef<HTMLElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const labels = buildProductQrLabels(product, quantity)

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      previousFocus.current?.focus()
    }
  }, [onClose])

  const printLabels = () => {
    document.body.classList.add('print-product-labels')
    try {
      window.print()
    } finally {
      document.body.classList.remove('print-product-labels')
    }
  }

  return createPortal(
    <div className="admin-modal-overlay product-label-dialog" role="dialog" aria-modal="true" aria-labelledby="product-label-title">
      <div className="admin-modal-content product-label-dialog-content" ref={dialogRef}>
        <div className="admin-modal-header">
          <div>
            <p className="eyebrow">Impresión local</p>
            <h3 id="product-label-title">Etiquetas QR</h3>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Cerrar etiquetas QR" autoFocus>&times;</button>
        </div>

        <p className="product-label-warning" role="note">
          Si cambia el código interno del producto, debes reimprimir todas sus etiquetas.
        </p>
        <div className="admin-form-group product-label-quantity">
          <label htmlFor="product-label-quantity">Cantidad de copias</label>
          <input
            id="product-label-quantity"
            type="number"
            min="1"
            max="100"
            step="1"
            value={quantity}
            onChange={(event) => setQuantity(Math.min(100, Math.max(1, Number(event.target.value) || 1)))}
          />
        </div>

        <div className="product-label-print-root" aria-label={`Vista previa de ${quantity} etiquetas`}>
          {labels.map((label, index) => (
            <article className="product-qr-label" key={`${label.internalCode}-${index}`}>
              <div className="product-label-copy">
                <strong>{label.commonName}</strong>
                <span>{label.internalCode}</span>
              </div>
              <QrSvg content={label.qrContent} />
            </article>
          ))}
        </div>

        <div className="admin-modal-footer product-label-controls">
          <button type="button" className="secondary-auth-btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="catalog-action" onClick={printLabels}>Imprimir en A4</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
