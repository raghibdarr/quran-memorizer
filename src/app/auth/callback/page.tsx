'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createClient()

      // Supabase PKCE flow: the search params carry the auth code. Whatever the
      // outcome (code exchanged, session already set via hash, or nothing), go home.
      const code = new URL(window.location.href).searchParams.get('code')
      if (code) await supabase.auth.exchangeCodeForSession(code)
      else await supabase.auth.getSession()

      router.replace('/')
    }

    handleCallback()
  }, [router])

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal border-t-transparent" />
    </div>
  )
}
