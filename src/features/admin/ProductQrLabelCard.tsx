import { memo } from 'react'
import logo from '../../assets/isotipo-flor.png?inline'
import { createQrMatrix, type ProductQrLabel } from './product-qr-label'

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

export function ProductQrLabelCard({ label }: { label: ProductQrLabel }) {
  return <article className="product-qr-label">
    <div className="product-label-copy">
      <img className="product-label-logo" src={logo} alt="Vivero Dulcinea" />
      <strong>{label.commonName}</strong>
      <span>{label.internalCode}</span>
    </div>
    <QrSvg content={label.qrContent} />
  </article>
}
