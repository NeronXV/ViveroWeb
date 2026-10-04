export interface CampaignAttempt { version: 1; actor: number; key: string; subject: string; body: string }
export const campaignStorageKey = (actor: number) => `vivero.api.newsletter.campaign.${actor}`
export function readCampaignAttempt(storage: Storage, actor: number): CampaignAttempt | null {
  const raw = storage.getItem(campaignStorageKey(actor))
  if (raw === null) return null
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Intento de boletín incompatible.')
  const row = value as Record<string, unknown>
  if (Object.keys(row).length !== 5 || row.version !== 1 || row.actor !== actor || typeof row.key !== 'string' || !/^[a-f0-9]{64}$/.test(row.key) || typeof row.subject !== 'string' || typeof row.body !== 'string') throw new Error('Intento de boletín incompatible.')
  return row as unknown as CampaignAttempt
}
export function prepareCampaignAttempt(storage: Storage, actor: number, subject: string, body: string): CampaignAttempt {
  const existing = readCampaignAttempt(storage, actor)
  if (existing) {
    if (existing.subject !== subject || existing.body !== body) throw new Error('Hay una campaña pendiente; recupera su texto original antes de crear otra.')
    return existing
  }
  const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('')
  const attempt: CampaignAttempt = { version: 1, actor, key, subject, body }
  const raw = JSON.stringify(attempt)
  storage.setItem(campaignStorageKey(actor), raw)
  if (storage.getItem(campaignStorageKey(actor)) !== raw) throw new Error('No se guardó el intento. No se enviará la campaña.')
  return attempt
}
export function clearCampaignAttempt(storage: Storage, attempt: CampaignAttempt): void {
  const existing = readCampaignAttempt(storage, attempt.actor)
  if (!existing || existing.key !== attempt.key) throw new Error('El intento cambió en otra pestaña; actualiza la lista.')
  storage.removeItem(campaignStorageKey(attempt.actor))
  if (storage.getItem(campaignStorageKey(attempt.actor)) !== null) throw new Error('El intento sigue pendiente en el almacenamiento.')
}
