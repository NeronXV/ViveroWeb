import { describe, expect, it, vi } from 'vitest'
import { resolvePublicCatalogImageUrl, type CatalogStorageClient } from './catalog-image'
import type { PublicCatalogImage } from './catalog-types'

const ORIGIN = 'https://synthetic-project.supabase.co'
const PUBLIC_URL = `${ORIGIN}/storage/v1/object/public/catalog-images/products/aloe/main.webp`
const IMAGE: PublicCatalogImage = {
  bucketName: 'catalog-images',
  storagePath: 'products/aloe/main.webp',
  altText: 'Imagen sintética',
}

function storageReturning(publicUrl: unknown) {
  const getPublicUrl = vi.fn(() => ({ data: { publicUrl } }))
  const from = vi.fn(() => ({ getPublicUrl }))
  return { storage: { from } as CatalogStorageClient, from, getPublicUrl }
}

describe('resolvePublicCatalogImageUrl', () => {
  it('usa exactamente el bucket y la ruta validados mediante el SDK', () => {
    const fake = storageReturning(PUBLIC_URL)
    expect(resolvePublicCatalogImageUrl(IMAGE, fake.storage, ORIGIN)).toBe(PUBLIC_URL)
    expect(fake.from).toHaveBeenCalledExactlyOnceWith('catalog-images')
    expect(fake.getPublicUrl).toHaveBeenCalledExactlyOnceWith('products/aloe/main.webp')
  })

  it('devuelve fallback para una imagen nula sin consultar Storage', () => {
    const fake = storageReturning(PUBLIC_URL)
    expect(resolvePublicCatalogImageUrl(null, fake.storage, ORIGIN)).toBeNull()
    expect(fake.from).not.toHaveBeenCalled()
  })

  it.each([
    ['URL externa', 'https://example.invalid/image.webp'],
    ['esquema inseguro', 'javascript:alert(1)'],
    ['HTTP remoto', 'http://synthetic-project.supabase.co/storage/v1/object/public/catalog-images/products/aloe/main.webp'],
    ['respuesta ausente', undefined],
  ])('devuelve fallback ante %s en la respuesta', (_label, publicUrl) => {
    const fake = storageReturning(publicUrl)
    expect(resolvePublicCatalogImageUrl(IMAGE, fake.storage, ORIGIN)).toBeNull()
  })

  it('no convierte una ruta externa arbitraria en src', () => {
    const fake = storageReturning(PUBLIC_URL)
    const invalidImage = { ...IMAGE, storagePath: 'https://example.invalid/image.webp' }
    expect(resolvePublicCatalogImageUrl(invalidImage, fake.storage, ORIGIN)).toBeNull()
    expect(fake.from).not.toHaveBeenCalled()
  })

  it('devuelve fallback si el SDK falla', () => {
    const storage: CatalogStorageClient = { from: () => { throw new Error('fallo sintético') } }
    expect(resolvePublicCatalogImageUrl(IMAGE, storage, ORIGIN)).toBeNull()
  })

  it('permite una URL HTTP del mismo origen durante desarrollo local', () => {
    const localOrigin = 'http://127.0.0.1:54321'
    const localUrl = `${localOrigin}/storage/v1/object/public/catalog-images/products/aloe/main.webp`
    const fake = storageReturning(localUrl)
    expect(resolvePublicCatalogImageUrl(IMAGE, fake.storage, localOrigin)).toBe(localUrl)
  })
})
