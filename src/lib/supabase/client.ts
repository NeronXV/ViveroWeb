import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { getSupabaseEnv } from './env'

let browserClient: SupabaseClient | undefined
const AUTH_REQUEST_TIMEOUT_MS = 6_000

function isAuthEndpoint(input: RequestInfo | URL, supabaseOrigin: string): boolean {
  const value = input instanceof Request ? input.url : input
  const requestUrl = new URL(value, supabaseOrigin)

  return requestUrl.origin === supabaseOrigin && /^\/auth\/v1(?:\/|$)/.test(requestUrl.pathname)
}

function createAuthFetch(supabaseOrigin: string): typeof fetch {
  return async (input, init) => {
    if (!isAuthEndpoint(input, supabaseOrigin)) return fetch(input, init)

    const timeoutController = new AbortController()
    const timeoutId = window.setTimeout(() => timeoutController.abort(), AUTH_REQUEST_TIMEOUT_MS)
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, timeoutController.signal])
      : timeoutController.signal

    try {
      return await fetch(input, { ...init, signal })
    } catch (error) {
      if (timeoutController.signal.aborted && !callerSignal?.aborted) {
        return new Response(JSON.stringify({ message: 'Tiempo de espera agotado.' }), {
          status: 408,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      throw error
    } finally {
      window.clearTimeout(timeoutId)
    }
  }
}

export function getSupabaseClient(): SupabaseClient {
  if (browserClient) {
    return browserClient
  }

  const { url, publishableKey } = getSupabaseEnv()
  const supabaseOrigin = new URL(url).origin

  browserClient = createClient(url, publishableKey, {
    global: {
      fetch: createAuthFetch(supabaseOrigin),
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return browserClient
}
