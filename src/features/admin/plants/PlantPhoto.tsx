import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { fetchPlantPhoto } from './plants-service'

export function PlantPhoto({ imageId, name, preview, hero = false, onPreviewError }: { imageId?: string; name: string; preview?: string | null; hero?: boolean; onPreviewError?: () => void }) {
  const { accessContext } = useAuth()
  const [photo, setPhoto] = useState<{ id: string; url: string } | null>(null)
  const [failed, setFailed] = useState(false)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const identity = `${accessContext?.userId}:${accessContext?.branch?.id}`
  useEffect(() => {
    if (!imageId || preview) return
    const controller = new AbortController()
    let url: string | null = null, started = false
    const load = async () => {
      if (started) return
      started = true
      try {
        const blob = await fetchPlantPhoto(imageId, controller.signal)
        if (!controller.signal.aborted) { url = URL.createObjectURL(blob); setPhoto({ id: imageId, url }); setFailed(false) }
      } catch { if (!controller.signal.aborted) setFailed(true) }
    }
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { void load(); observer.disconnect() } }, { rootMargin: '150px' })
    if (root.current) observer.observe(root.current)
    return () => { controller.abort(); observer.disconnect(); if (url) URL.revokeObjectURL(url) }
  }, [imageId, preview, identity])
  const src = preview || (photo && photo.id === imageId ? photo.url : null)
  return <div ref={root} className={`plant-photo ${hero ? 'plant-photo-hero' : ''}`}>
    {src && src !== failedSrc ? <img src={src} alt={name} onError={() => { setFailedSrc(src); if (preview) onPreviewError?.(); else setFailed(true) }} /> : <div className="plant-photo-placeholder"><svg aria-hidden="true" viewBox="0 0 64 64"><path d="M32 51V30M32 39C11 39 11 15 11 15s22 0 21 24ZM32 30C32 9 54 9 54 9s0 22-22 21Z" /></svg><span>{src === failedSrc && preview ? 'No se pudo abrir la vista previa' : failed ? 'Foto no disponible' : imageId ? 'Cargando fotografía…' : 'Fotografía pendiente'}</span></div>}
    {preview && <span className="plant-photo-caption">Vista previa · sin guardar</span>}
  </div>
}
