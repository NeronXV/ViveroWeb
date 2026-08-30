import { useCallback, useEffect, useRef, useState } from 'react'
import { searchCustomers, upsertCustomer } from './admin-customers-service'
import type { AdminCustomer } from './admin-customers-types'
import { AdminServiceError } from './admin-service'

export function useAdminCustomers(enabled: boolean) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [results, setResults] = useState<AdminCustomer[]>([])
  const [status, setStatus] = useState<'initial' | 'loading' | 'ready' | 'error'>('initial')
  const [error, setError] = useState<string | null>(null)

  // Mutation states
  const [isMutating, setIsMutating] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const controllerRef = useRef<AbortController | null>(null)

  // Debounce query change
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query)
    }, 300)

    return () => {
      clearTimeout(handler)
    }
  }, [query])

  const executeSearch = useCallback(async (q: string) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setResults([])
      setStatus('initial')
      setError(null)
      return
    }

    setStatus('loading')
    setError(null)

    try {
      const data = await searchCustomers(trimmed, 50, controller.signal)
      setResults(data)
      setStatus('ready')
    } catch (err) {
      if (controller.signal.aborted) return
      setStatus('error')
      setError(err instanceof AdminServiceError ? err.message : 'No fue posible realizar la búsqueda.')
    }
  }, [])

  useEffect(() => {
    if (enabled) {
      void executeSearch(debouncedQuery)
    }
    return () => {
      controllerRef.current?.abort()
    }
  }, [enabled, debouncedQuery, executeSearch])

  const handleCreateCustomer = async (fullName: string, email: string | null, phone: string | null) => {
    setIsMutating(true)
    setMutationError(null)
    try {
      await upsertCustomer({ id: null, fullName, email, phone, isActive: true })
      void executeSearch(debouncedQuery)
    } catch (err) {
      const msg = err instanceof AdminServiceError ? err.message : 'Error al crear el cliente.'
      setMutationError(msg)
      throw err
    } finally {
      setIsMutating(false)
    }
  }

  const handleEditCustomer = async (id: string, fullName: string, email: string | null, phone: string | null) => {
    setIsMutating(true)
    setMutationError(null)
    try {
      await upsertCustomer({ id, fullName, email, phone, isActive: true })
      void executeSearch(debouncedQuery)
    } catch (err) {
      const msg = err instanceof AdminServiceError ? err.message : 'Error al actualizar el cliente.'
      setMutationError(msg)
      throw err
    } finally {
      setIsMutating(false)
    }
  }

  const retry = useCallback(() => {
    void executeSearch(debouncedQuery)
  }, [executeSearch, debouncedQuery])

  return {
    query,
    setQuery,
    results,
    status,
    error,
    isMutating,
    mutationError,
    setMutationError,
    createCustomer: handleCreateCustomer,
    editCustomer: handleEditCustomer,
    retry,
  }
}
