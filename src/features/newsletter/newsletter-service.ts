import { apiId, backendHttp, list, object } from '../../lib/backend-http'
export interface Campaign { id: string; subject: string; body: string; recipients: number; sent: number; skipped: number; review: number }
export function campaignContent(subject: string, body: string): void {
  const controls = (value: string, singleLine: boolean) => [...value].some(character => {
    const code = character.charCodeAt(0)
    return code === 127 || code < 32 && (singleLine || ![9, 10, 13].includes(code))
  })
  if ([...subject].length < 3 || [...subject].length > 150 || [...body].length < 10 || [...body].length > 10000 || controls(subject, true) || controls(body, false)) throw new Error('Revisa el asunto y el mensaje antes de guardar la campaña.')
}
const count = (value: unknown) => { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Respuesta incompatible.'); return value }
export function parseCampaigns(value: unknown): Campaign[] {
  return list(object(value).items).map(row => {
    if (typeof row.subject !== 'string' || typeof row.body !== 'string') throw new Error('Respuesta incompatible.')
    const result = { id: apiId(row.id), subject: row.subject, body: row.body, recipients: count(row.recipients), sent: count(row.sent), skipped: count(row.skipped), review: count(row.review) }
    if (result.sent + result.skipped + result.review > result.recipients) throw new Error('Respuesta incompatible.')
    return result
  })
}
export function newsletterLink(fragment: string): { action: 'confirm' | 'unsubscribe'; token: string } | null {
  const match = /^#(confirm|unsubscribe)=([A-Za-z0-9_-]{43})$/.exec(fragment)
  return match ? { action: match[1] as 'confirm' | 'unsubscribe', token: match[2] } : null
}
export async function publicNewsletter(action: 'subscribe' | 'confirm' | 'unsubscribe', body: { email: string; consent: boolean } | { token: string }, signal?: AbortSignal): Promise<void> {
  const response = await fetch(`/api/v1/newsletter/${action}`, { method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error('No se confirmó la operación del boletín.')
  const value = object(await response.json()), key = action === 'subscribe' ? 'accepted' : action === 'confirm' ? 'confirmed' : 'unsubscribed'
  if (value[key] !== true) throw new Error('Respuesta incompatible.')
}
export async function campaigns(signal?: AbortSignal): Promise<Campaign[]> { return parseCampaigns(await backendHttp('admin/newsletter/campaigns', 'GET', undefined, signal)) }
export async function createCampaign(subject: string, body: string, key: string, signal?: AbortSignal): Promise<void> {
  const result = await backendHttp('admin/newsletter/campaigns', 'POST', { subject, body }, signal, key)
  apiId(result.id); count(result.recipients)
}
export async function sendCampaign(id: string, signal?: AbortSignal): Promise<number> {
  apiId(Number(id))
  const result = await backendHttp(`admin/newsletter/campaigns/${id}/send`, 'POST', {}, signal)
  const sent = count(result.sent), batch = count(result.batch_size)
  if (sent > batch || batch > 20) throw new Error('Respuesta incompatible.')
  return sent
}
