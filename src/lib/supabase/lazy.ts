// The Supabase client, loaded only when it is needed (about 54 KB gzip of auth,
// realtime and postgrest): at start-up only when this device may hold a session
// or an auth link just landed, otherwise on the first sign-in, sync or reminder
// call. Signed-out users never download it. App-wide code (auth, sync, native
// auth, web push) imports this file, never ./client, so supabase-js stays out of
// every first-load chunk; route code (circles, the auth callback) may use ./client.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

export type Client = SupabaseClient<Database>

/** Fired on window when the client has loaded, so every useAuth subscribes */
export const CLIENT_READY_EVENT = 'takrar:supabase-ready'

let client: Client | null = null
let loading: Promise<Client> | null = null

export function getLoadedClient(): Client | null {
  return client
}

export function loadClient(): Promise<Client> {
  if (client) return Promise.resolve(client)
  loading ??= import('./client').then((m) => {
    client = m.createClient()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(CLIENT_READY_EVENT))
    return client
  })
  return loading
}

/**
 * Whether a session may exist: Supabase keeps it in localStorage under
 * sb-<project>-auth-token (and a PKCE verifier beside it), or an auth link has
 * just opened the page with its token or code.
 */
export function mayHaveSession(storage?: Pick<Storage, 'length' | 'key'>, href?: string): boolean {
  try {
    const s = storage ?? window.localStorage
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)
      if (k && k.startsWith('sb-') && k.includes('-auth-token')) return true
    }
  } catch {
    /* storage blocked: fall through to the address */
  }
  try {
    const url = href ?? window.location.href
    return /[#&?](access_token|refresh_token|code|error_description)=/.test(url)
  } catch {
    return false
  }
}
