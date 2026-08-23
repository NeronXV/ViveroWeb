import type { UserAccessContext } from './access-types'

export type BranchState = 'none' | 'active' | 'inactive'

export function hasCapability(context: UserAccessContext | null, capability: string): boolean {
  return context?.accessState === 'ACTIVE' && context.capabilities.includes(capability)
}

export function getBranchState(context: UserAccessContext | null): BranchState {
  if (!context?.branch) return 'none'
  return context.branch.isActive ? 'active' : 'inactive'
}

export function isCashierEligible(context: UserAccessContext | null): boolean {
  return context?.accessState === 'ACTIVE'
    && hasCapability(context, 'OPERATE_CASHIER')
    && getBranchState(context) === 'active'
}
