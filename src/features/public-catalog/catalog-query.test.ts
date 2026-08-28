import { describe, expect, it } from 'vitest'
import { buildPublicCatalogRpcParams, type PublicCatalogQuery } from './catalog-query'

const ID = '73000000-0000-0000-0000-000000000001'

function query(overrides: Partial<PublicCatalogQuery> = {}): PublicCatalogQuery {
  return { search: '', categoryId: null, cursor: null, ...overrides }
}

describe('buildPublicCatalogRpcParams', () => {
  it('convierte una búsqueda vacía en null', () => {
    expect(buildPublicCatalogRpcParams(query({ search: '   ' })).p_search).toBeNull()
  })

  it('normaliza espacios exteriores', () => {
    expect(buildPublicCatalogRpcParams(query({ search: '  aloe  ' })).p_search).toBe('aloe')
  })

  it('acepta una búsqueda de 80 caracteres', () => {
    const search = 'a'.repeat(80)
    expect(buildPublicCatalogRpcParams(query({ search })).p_search).toBe(search)
  })

  it('rechaza una búsqueda de más de 80 caracteres', () => {
    expect(() => buildPublicCatalogRpcParams(query({ search: 'a'.repeat(81) }))).toThrow()
  })

  it.each([null, ID])('construye una categoría %s', (categoryId) => {
    expect(buildPublicCatalogRpcParams(query({ categoryId })).p_category_id).toBe(categoryId)
  })

  it.each([1, 24, 50])('acepta el límite %i', (limit) => {
    expect(buildPublicCatalogRpcParams(query({ limit })).p_limit).toBe(limit)
  })

  it.each([0, 51])('rechaza el límite %i', (limit) => {
    expect(() => buildPublicCatalogRpcParams(query({ limit }))).toThrow()
  })

  it('construye un cursor compuesto completo', () => {
    const result = buildPublicCatalogRpcParams(query({ cursor: { sortName: 'aloe', id: ID } }))
    expect(result.p_after_name).toBe('aloe')
    expect(result.p_after_id).toBe(ID)
  })

  it.each([
    { sortName: 'aloe' },
    { id: ID },
  ])('rechaza un cursor parcial', (cursor) => {
    expect(() => buildPublicCatalogRpcParams(query({ cursor: cursor as unknown as PublicCatalogQuery['cursor'] }))).toThrow()
  })
})
