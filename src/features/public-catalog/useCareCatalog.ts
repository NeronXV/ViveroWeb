import { useEffect, useState } from 'react'
import { loadPublicCatalog } from './catalog-service'
import type { PublicCatalogCursor, PublicCatalogProduct } from './catalog-types'

export function useCareCatalog() {
  const [products, setProducts] = useState<PublicCatalogProduct[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    const load = async () => {
      let cursor: PublicCatalogCursor | null = null
      const rows: PublicCatalogProduct[] = []
      const cursors = new Set<string>()
      do {
        const response = await loadPublicCatalog({ search: '', categoryId: null, cursor, limit: 50 }, controller.signal)
        rows.push(...response.items)
        if (!response.page.hasMore) break
        cursor = response.page.nextCursor
        if (!cursor || cursors.has(JSON.stringify(cursor))) throw new Error('Paginación inválida')
        cursors.add(JSON.stringify(cursor))
      } while (!controller.signal.aborted)
      if (!controller.signal.aborted) { setProducts(rows); setStatus('ready') }
    }
    load().catch(() => { if (!controller.signal.aborted) setStatus('error') })
    return () => controller.abort()
  }, [revision])
  return { products, status, retry: () => setRevision((value) => value + 1) }
}
