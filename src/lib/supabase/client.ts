import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { getSupabaseEnv } from './env'

let browserClient: SupabaseClient | undefined

export function getSupabaseClient(): SupabaseClient {
  if (browserClient) {
    return browserClient
  }

  const { url, publishableKey } = getSupabaseEnv()

  browserClient = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return browserClient
}
