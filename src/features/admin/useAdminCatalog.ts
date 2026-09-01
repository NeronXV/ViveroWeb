import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchAdminProducts,
  fetchAdminCategories,
  upsertProduct,
  upsertCategory,
  uploadProductImage,
} from './admin-catalog-service'
import type {
  AdminCategory,
  AdminProduct,
  UpsertCategoryInput,
  UpsertProductInput,
} from './admin-catalog-types'
import { AdminServiceError } from './admin-service'

export function useAdminCatalog(enabled: boolean) {
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [productStatus, setProductStatus] = useState<'all' | 'active' | 'inactive'>('all')

  // Mutation states
  const [isMutating, setIsMutating] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const controllerRef = useRef<AbortController | null>(null)

  const load = useCallback(
    async (
      currentSearch: string,
      currentCategoryId: string | null,
      currentStatus: 'all' | 'active' | 'inactive'
    ) => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      setStatus('loading')
      setError(null)

      try {
        const [loadedProducts, loadedCategories] = await Promise.all([
          fetchAdminProducts(
            { search: currentSearch, categoryId: currentCategoryId, status: currentStatus },
            controller.signal
          ),
          fetchAdminCategories(controller.signal),
        ])

        setProducts(loadedProducts)
        setCategories(loadedCategories)
        setStatus('ready')
      } catch (err) {
        if (controller.signal.aborted) return
        setStatus('error')
        setError(err instanceof AdminServiceError ? err.message : 'No fue posible cargar el catálogo.')
      }
    },
    []
  )

  useEffect(() => {
    if (enabled) {
      void load(search, categoryId, productStatus)
    }
    return () => {
      controllerRef.current?.abort()
    }
  }, [enabled, search, categoryId, productStatus, load])

  const refresh = useCallback(() => {
    void load(search, categoryId, productStatus)
  }, [load, search, categoryId, productStatus])

  const handleUpsertProduct = async (input: UpsertProductInput): Promise<AdminProduct> => {
    setIsMutating(true)
    setMutationError(null)
    try {
      const result = await upsertProduct(input)
      refresh()
      return result
    } catch (err) {
      const msg = err instanceof AdminServiceError ? err.message : 'Error al guardar el producto.'
      setMutationError(msg)
      throw err
    } finally {
      setIsMutating(false)
    }
  }

  const handleUpsertCategory = async (input: UpsertCategoryInput): Promise<AdminCategory> => {
    setIsMutating(true)
    setMutationError(null)
    try {
      const result = await upsertCategory(input)
      setCategories((prev) => {
        const index = prev.findIndex((c) => c.id === result.id)
        if (index >= 0) {
          const updated = [...prev]
          updated[index] = result
          return updated
        }
        return [...prev, result]
      })
      refresh()
      return result
    } catch (err) {
      const msg = err instanceof AdminServiceError ? err.message : 'Error al guardar la categoría.'
      setMutationError(msg)
      throw err
    } finally {
      setIsMutating(false)
    }
  }

  const handleUploadProductImage = async (
    productId: string,
    file: Blob,
    existingImageId?: string
  ): Promise<{ imageId: string; storagePath: string }> => {
    setIsMutating(true)
    setMutationError(null)
    try {
      const result = await uploadProductImage(productId, file, existingImageId)
      refresh()
      return result
    } catch (err) {
      const msg = err instanceof AdminServiceError ? err.message : 'Error al subir la fotografía.'
      setMutationError(msg)
      throw err
    } finally {
      setIsMutating(false)
    }
  }

  return {
    products,
    categories,
    status,
    error,
    search,
    setSearch,
    categoryId,
    setCategoryId,
    productStatus,
    setProductStatus,
    isMutating,
    mutationError,
    setMutationError,
    refresh,
    retry: refresh,
    upsertProduct: handleUpsertProduct,
    upsertCategory: handleUpsertCategory,
    uploadProductImage: handleUploadProductImage,
  }
}
