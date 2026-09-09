import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AdminProduct } from './admin-catalog-types'
import { buildProductQrLabelBatch, createQrMatrix, isValidLabelInternalCode } from './product-qr-label'

const QrSvg = memo(function QrSvg({ content }: { content: string }) {
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
})

export function ProductQrLabelDialog({ products, onClose }: { products: AdminProduct[]; onClose: () => void }) {
  const [quantities, setQuantities] = useState<Record<string, string>>(
    () => Object.fromEntries(products.map((product) => [product.id, '1'])),
  )
  const [copiesForAll, setCopiesForAll] = useState('1')
  const validQuantity = (value: string) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100
  const includedProducts = products.filter((product) => quantities[product.id] !== undefined)
  const quantitiesValid = includedProducts.length > 0 && includedProducts.every((product) => validQuantity(quantities[product.id]))
  const total = includedProducts.reduce((sum, product) => sum + (Number(quantities[product.id]) || 0), 0)
  const codesValid = includedProducts.every((product) => isValidLabelInternalCode(product.internalCode))
  const canPrint = quantitiesValid && codesValid && total <= 1000
  const labels = useMemo(() => canPrint
    ? buildProductQrLabelBatch(products.filter((product) => quantities[product.id] !== undefined)
      .map((product) => ({ product, quantity: Number(quantities[product.id]) })))
    : [], [products, quantities, canPrint])
  const previousFocus = useRef<HTMLElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

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
    if (!canPrint) return
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
        <div className="product-label-bulk-toolbar">
          <label htmlFor="product-label-all">Copias para todos</label>
          <input id="product-label-all" type="number" min="1" max="100" step="1"
            value={copiesForAll} onChange={(event) => setCopiesForAll(event.target.value)} />
          <button type="button" className="admin-action-btn secondary"
            disabled={!validQuantity(copiesForAll) || includedProducts.length === 0}
            onClick={() => setQuantities(Object.fromEntries(includedProducts.map((product) => [product.id, copiesForAll])))}>
            Aplicar a todos
          </button>
        </div>
        <div className="product-label-batch-list">
          {includedProducts.map((product) => (
            <div className="product-label-batch-row" key={product.id}>
              <label htmlFor={'label-count-' + product.id}>
                <strong>{product.commonName}</strong><small>{product.internalCode}</small>
              </label>
              <input id={'label-count-' + product.id} type="number" min="1" max="100" step="1"
                aria-label={'Copias de ' + product.commonName}
                aria-invalid={!validQuantity(quantities[product.id])}
                value={quantities[product.id]}
                onChange={(event) => setQuantities({ ...quantities, [product.id]: event.target.value })} />
              <button type="button" className="admin-action-btn secondary"
                aria-label={'Quitar ' + product.commonName}
                onClick={() => setQuantities(Object.fromEntries(Object.entries(quantities).filter(([id]) => id !== product.id)))}>
                Quitar
              </button>
            </div>
          ))}
        </div>
        <p role="status">{includedProducts.length} productos · {canPrint ? total : 0} etiquetas listas para imprimir.</p>
        {!codesValid && <p role="alert">Quita los productos cuyo código interno ya no sea válido antes de imprimir.</p>}
        {!canPrint && <p role="alert">Selecciona al menos un producto e indica de 1 a 100 copias por producto, hasta 1000 etiquetas por impresión.</p>}
        <p>Hojas A4, escala 100 %, sin encabezados ni pies de página. Las etiquetas se acomodan en varias hojas automáticamente.</p>

        <div className="product-label-print-root" aria-label={`Vista previa de ${labels.length} etiquetas`}>
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
          <button type="button" className="catalog-action" onClick={printLabels} disabled={!canPrint}>Imprimir {labels.length} etiquetas en A4</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
