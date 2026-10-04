import { afterEach, expect, it, vi } from 'vitest'
import { newsletterLink, publicNewsletter, parseCampaigns, createCampaign, sendCampaign, campaignContent } from './newsletter-service'
import { backendHttp } from '../../lib/backend-http'
import { prepareCampaignAttempt, readCampaignAttempt, clearCampaignAttempt, campaignStorageKey } from './campaign-attempt'
vi.mock('../../lib/backend-http', async original => ({ ...await original<typeof import('../../lib/backend-http')>(), backendHttp: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })
it('newsletter uses fragments and rejects legacy/query/malformed links', () => {
  expect(newsletterLink('#confirm=' + 'a'.repeat(43))).toEqual({ action: 'confirm', token: 'a'.repeat(43) })
  expect(newsletterLink('#unsubscribe=' + 'a'.repeat(43))?.action).toBe('unsubscribe')
  for (const value of ['?confirm=' + 'a'.repeat(43), '#confirm=legacy-uuid', '#confirm=' + 'a'.repeat(43) + '&email=secret']) expect(newsletterLink(value)).toBeNull()
})
it('public consent posts same origin without cookies, redirects or bearer credentials', async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true })))
  vi.stubGlobal('fetch', request)
  await publicNewsletter('subscribe', { email: 'demo@example.invalid', consent: true })
  expect(request).toHaveBeenCalledWith('/api/v1/newsletter/subscribe', expect.objectContaining({ credentials: 'omit', redirect: 'error', cache: 'no-store', body: JSON.stringify({ email: 'demo@example.invalid', consent: true }) }))
})
it('newsletter refuses server errors and false success without exposing provider details', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'private provider detail' }), { status: 503 })))
  await expect(publicNewsletter('confirm', { token: 'a'.repeat(43) })).rejects.not.toThrow('private provider detail')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ confirmed: false }))))
  await expect(publicNewsletter('confirm', { token: 'a'.repeat(43) })).rejects.toThrow()
})
it('campaign parser requires integer IDs and coherent counts', () => {
  const row = { id: 1, subject: 'Demo', body: 'Demo newsletter', recipients: 2, sent: 1, skipped: 0, review: 1 }
  expect(parseCampaigns({ items: [row] })[0].id).toBe('1')
  for (const changed of [{ id: 'uuid' }, { sent: '1' }, { review: 2 }, { recipients: -1 }]) expect(() => parseCampaigns({ items: [{ ...row, ...changed }] })).toThrow()
})
it('invalid content is rejected before storing an immutable campaign attempt', () => {
  expect(() => campaignContent('Demo\nheader', 'Demo newsletter')).toThrow()
  expect(() => campaignContent('Demo', 'Body\u0000newsletter')).toThrow()
  expect(() => campaignContent('Demo', '🌱'.repeat(5000))).not.toThrow()
})
it('admin calls authenticated API with the preserved request key and bounds batch results', async () => {
  vi.mocked(backendHttp).mockResolvedValue({ id: 1, recipients: 2 })
  await createCampaign('Demo', 'Demo newsletter', 'a'.repeat(64))
  expect(backendHttp).toHaveBeenCalledWith('admin/newsletter/campaigns', 'POST', { subject: 'Demo', body: 'Demo newsletter' }, undefined, 'a'.repeat(64))
  vi.mocked(backendHttp).mockResolvedValue({ sent: 1, batch_size: 2 }); expect(await sendCampaign('1')).toBe(1)
  vi.mocked(backendHttp).mockResolvedValue({ sent: 21, batch_size: 21 }); await expect(sendCampaign('1')).rejects.toThrow()
})
function storage(): Storage { const rows = new Map<string, string>(); return { get length() { return rows.size }, clear: () => rows.clear(), getItem: key => rows.get(key) ?? null, setItem: (key, value) => { rows.set(key, value) }, removeItem: key => { rows.delete(key) }, key: () => null } }
it('campaign attempt survives reload, preserves its key/body and belongs to one actor', () => {
  const db = storage(), first = prepareCampaignAttempt(db, 1, 'Demo', 'Demo newsletter')
  expect(readCampaignAttempt(db, 1)).toEqual(first)
  expect(prepareCampaignAttempt(db, 1, 'Demo', 'Demo newsletter')).toEqual(first)
  expect(readCampaignAttempt(db, 2)).toBeNull()
  expect(() => prepareCampaignAttempt(db, 1, 'Changed', 'Demo newsletter')).toThrow()
  clearCampaignAttempt(db, first); expect(readCampaignAttempt(db, 1)).toBeNull()
})
it('unavailable, malformed or silently discarded storage prevents a new attempt', () => {
  const db = storage()
  db.setItem(campaignStorageKey(1), '{broken'); expect(() => prepareCampaignAttempt(db, 1, 'Demo', 'Demo newsletter')).toThrow()
  db.clear(); db.setItem = () => {}; expect(() => prepareCampaignAttempt(db, 1, 'Demo', 'Demo newsletter')).toThrow()
})
