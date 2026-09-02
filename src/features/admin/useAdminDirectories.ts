import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AdminServiceError,
  fetchAdminBranches,
  fetchAdminStaff,
  fetchAdminRoleOptions,
} from './admin-service'
import type {
  AdminBranch,
  AdminBranchCursor,
  AdminStaffCursor,
  AdminStaffMember,
  AdminStaffRole,
  AdminRoleOption,
} from './admin-types'

interface DirectoryState<T, C> {
  items: T[]
  cursor: C | null
  hasMore: boolean
  status: 'idle' | 'loading' | 'ready' | 'error'
  loadingMore: boolean
  error: string | null
}
function initialState<T, C>(): DirectoryState<T, C> {
  return { items: [], cursor: null, hasMore: false, status: 'idle', loadingMore: false, error: null }
}

function message(error: unknown): string {
  return error instanceof AdminServiceError ? error.message : 'No fue posible cargar el directorio administrativo.'
}

export function useAdminBranches(enabled: boolean) {
  const [state, setState] = useState<DirectoryState<AdminBranch, AdminBranchCursor>>(initialState)
  const controllerRef = useRef<AbortController | null>(null)

  const load = useCallback(async (more = false, cursor: AdminBranchCursor | null = null) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState((current) => more
      ? { ...current, loadingMore: true, error: null }
      : { ...current, status: 'loading', error: null })
    try {
      const response = await fetchAdminBranches(more ? cursor : null, controller.signal)
      setState((current) => ({
        items: more ? [...current.items, ...response.items.filter((item) => !current.items.some(({ id }) => id === item.id))] : response.items,
        cursor: response.page.nextCursor,
        hasMore: response.page.hasMore,
        status: 'ready', loadingMore: false, error: null,
      }))
    } catch (error) {
      if (controller.signal.aborted) return
      setState((current) => ({ ...current, status: more ? 'ready' : 'error', loadingMore: false, error: message(error) }))
    }
  }, [])

  useEffect(() => {
    if (enabled) void load()
    return () => controllerRef.current?.abort()
  }, [enabled, load])

  return {
    ...state,
    retry: () => void load(),
    refresh: () => void load(),
    loadMore: () => state.hasMore && !state.loadingMore && void load(true, state.cursor),
  }
}

export function useAdminStaff(enabled: boolean) {
  const [state, setState] = useState<DirectoryState<AdminStaffMember, AdminStaffCursor>>(initialState)
  const controllerRef = useRef<AbortController | null>(null)

  const load = useCallback(async (more = false, cursor: AdminStaffCursor | null = null) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState((current) => more
      ? { ...current, loadingMore: true, error: null }
      : { ...current, status: 'loading', error: null })
    try {
      const response = await fetchAdminStaff(more ? cursor : null, controller.signal)
      setState((current) => ({
        items: more ? [...current.items, ...response.items.filter((item) => !current.items.some(({ id }) => id === item.id))] : response.items,
        cursor: response.page.nextCursor,
        hasMore: response.page.hasMore,
        status: 'ready', loadingMore: false, error: null,
      }))
    } catch (error) {
      if (controller.signal.aborted) return
      setState((current) => ({ ...current, status: more ? 'ready' : 'error', loadingMore: false, error: message(error) }))
    }
  }, [])

  const updateStaffRole = useCallback((userId: string, role: AdminStaffRole, updatedAt: string) => {
    setState((current) => ({
      ...current,
      items: current.items.map((member) =>
        member.id === userId
          ? { ...member, role, updatedAt }
          : member
      ),
    }))
  }, [])

  useEffect(() => {
    if (enabled) void load()
    return () => controllerRef.current?.abort()
  }, [enabled, load])

  return {
    ...state,
    retry: () => void load(),
    refresh: () => void load(),
    loadMore: () => state.hasMore && !state.loadingMore && void load(true, state.cursor),
    updateStaffRole,
  }
}

interface RoleOptionsState {
  items: AdminRoleOption[]
  actorRole: 'ADMIN' | 'OWNER' | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
}

const initialRoleOptionsState: RoleOptionsState = {
  items: [],
  actorRole: null,
  status: 'idle',
  error: null,
}

export function useAdminRoleOptions(enabled: boolean) {
  const [state, setState] = useState<RoleOptionsState>(initialRoleOptionsState)
  const controllerRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState((current) => ({ ...current, status: 'loading', error: null }))
    try {
      const response = await fetchAdminRoleOptions(controller.signal)
      setState({
        items: response.items,
        actorRole: response.actorRole,
        status: 'ready',
        error: null,
      })
    } catch (error) {
      if (controller.signal.aborted) return
      setState((current) => ({
        ...current,
        status: 'error',
        error: message(error),
      }))
    }
  }, [])

  useEffect(() => {
    if (enabled) void load()
    return () => controllerRef.current?.abort()
  }, [enabled, load])

  return {
    ...state,
    retry: () => void load(),
    refresh: () => void load(),
  }
}
