import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

export function ReceptionPdfPreview({ url }: { url: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let active = true
    let task: ReturnType<typeof import('pdfjs-dist').getDocument> | undefined
    void import('pdfjs-dist').then(async pdfjs => {
      if (!active) return
      if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()
      task = pdfjs.getDocument({ url })
      const pdf = await task.promise
      if (pdf.numPages > 30) throw new Error('Page limit')
      if (active) setDocument(pdf)
    }).catch(() => { if (active) setError(true) })
    return () => { active = false; void task?.destroy() }
  }, [url])
  useEffect(() => {
    if (!document || !canvas.current) return
    let active = true
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined
    const target = canvas.current
    void document.getPage(page).then(async pdfPage => {
      if (!active) return
      const original = pdfPage.getViewport({ scale: 1 })
      const viewport = pdfPage.getViewport({ scale: Math.min(2, 6000 / Math.max(original.width, original.height)) })
      target.width = Math.ceil(viewport.width); target.height = Math.ceil(viewport.height)
      render = pdfPage.render({ canvas: target, viewport })
      await render.promise
    }).catch(() => { if (active) setError(true) })
    return () => { active = false; render?.cancel() }
  }, [document, page])
  return <details className="reception-document-preview" open>
    <summary>Ver PDF original</summary><a href={url} target="_blank" rel="noreferrer">Abrir documento en otra pestaña</a>
    {document && document.numPages > 1 && <div className="reception-preview-pages"><button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Página anterior</button><span>Página {page} de {document.numPages}</span><button type="button" disabled={page === document.numPages} onClick={() => setPage(p => p + 1)}>Página siguiente</button></div>}
    {error ? <p role="status">No se pudo mostrar la vista previa. Abre el documento original para compararlo.</p> : <div className="reception-preview-scroll"><canvas ref={canvas} role="img" aria-label={`Documento original, página ${page}`} /></div>}
  </details>
}
