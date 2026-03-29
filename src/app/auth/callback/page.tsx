'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createClient()

      // Supabase PKCE flow: the hash or search params contain the auth data
      // Try exchangeCodeForSession first, then check if session already exists
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          window.location.href = '/'
          return
        }
      }

      // Fallback: check if session was set via hash fragment (implicit flow)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        window.location.href = '/'
        return
      }

      // No session — redirect home anyway
      window.location.href = '/'
    }

    handleCallback()
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal border-t-transparent" />
    </div>
  )
}
