// Opt-in response format; this is validation, never a client-side allocator.
export const SHORT_FOLIO_HEADER = { 'X-Vivero-Folio-Format': 'short-v1' } as const
export function isBackendSaleFolio(value: string): boolean {
  if (/^VD-[A-F0-9]{24}$/.test(value)) return true
  if (!/^VD-[0-9]{4,16}$/.test(value)) return false
  const ordinal = Number(value.slice(3))
  return Number.isSafeInteger(ordinal) && ordinal > 0 && value === `VD-${String(ordinal).padStart(4, '0')}`
}
export function isBackendOrderFolio(value: unknown, id: number): boolean {
  return value === `VW-${id}` || value === `VW-${String(id).padStart(4, '0')}`
}
