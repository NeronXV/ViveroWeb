import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { fetchInventoryPermissions, type InventoryPermissions } from './inventory-preparation-service'

const none: InventoryPermissions = { canRecordCount: false, canReceive: false, canApproveCounts: false }
export function useInventoryPermissions(active = true) {
  const { accessContext } = useAuth()
  const identity = `${accessContext?.userId}:${accessContext?.branch?.id}:${accessContext?.branch?.isActive}:${accessContext?.accessState}:${accessContext?.role?.name}:${accessContext?.capabilities.join(',')}`
  const [state, setState] = useState<{ identity: string; permissions: InventoryPermissions } | null>(null)
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    fetchInventoryPermissions(controller.signal).then(permissions => {
      if (!controller.signal.aborted) setState({ identity, permissions })
    }).catch(() => { if (!controller.signal.aborted) setState({ identity, permissions: none }) })
    return () => controller.abort()
  }, [active, identity])
  return active && state?.identity === identity ? state.permissions : none
}
