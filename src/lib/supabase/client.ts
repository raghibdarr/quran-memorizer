import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import type { Database } from './types'

let client: ReturnType<typeof createSupabaseClient<Database>> | null = null

export function createClient() {
  if (client) return client
  client = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // The apps get auth links back as takrar://auth/callback?code=… (PKCE, see
    // native-auth.ts); the website keeps the default flow, so an email link still
    // works when opened in a different browser from the one that asked for it
    Capacitor.isNativePlatform() ? { auth: { flowType: 'pkce' } } : undefined,
  )
  return client
}
