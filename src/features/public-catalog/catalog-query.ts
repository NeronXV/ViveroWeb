import type { PublicCatalogCursor } from './catalog-types'

export const PUBLIC_CATALOG_PAGE_LIMIT = 24
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)
  })
}

export interface PublicCatalogQuery {
  search: string
  categoryId: string | null
  cursor: PublicCatalogCursor | null
  limit?: number
}

export interface PublicCatalogRpcParams {
  p_search: string | null
  p_category_id: string | null
  p_limit: number
  p_after_name: string | null
  p_after_id: string | null
}

export class PublicCatalogQueryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublicCatalogQueryError'
  }
}

export function buildPublicCatalogRpcParams(query: PublicCatalogQuery): PublicCatalogRpcParams {
  const search = query.search.trim()
  const limit = query.limit ?? PUBLIC_CATALOG_PAGE_LIMIT
  const cursor = query.cursor
  if (search.length > 80 || containsControlCharacter(search)) {
    throw new PublicCatalogQueryError('La búsqueda solicitada no es válida.')
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new PublicCatalogQueryError('El límite solicitado para el catálogo no es válido.')
  }
  if (cursor !== null && (
    typeof cursor.sortName !== 'string' || cursor.sortName.trim() === '' || cursor.sortName.length > 160 ||
    containsControlCharacter(cursor.sortName) || cursor.sortName !== cursor.sortName.toLowerCase() ||
    typeof cursor.id !== 'string' || !UUID_PATTERN.test(cursor.id)
  )) {
    throw new PublicCatalogQueryError('El cursor solicitado para el catálogo no es válido.')
  }
  return {
    p_search: search === '' ? null : search,
    p_category_id: query.categoryId,
    p_limit: limit,
    p_after_name: cursor?.sortName ?? null,
    p_after_id: cursor?.id ?? null,
  }
}
