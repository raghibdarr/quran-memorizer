'use client'

import { useCallback, useEffect, useState } from 'react'
import { CLIENT_READY_EVENT, getLoadedClient, loadClient, mayHaveSession, type Client } from '@/lib/supabase/lazy'
import type { User } from '@supabase/supabase-js'
import { authRedirect, openAuthPage, PASSWORD_RECOVERY_EVENT } from '@/lib/native-auth'
import { isNative } from '@/lib/native'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  isPasswordRecovery: boolean
}

function formatAuthError(error: { message: string }): string {
  const msg = error.message.toLowerCase()
  if (msg.includes('invalid login credentials'))
    return 'Invalid email or password'
  if (msg.includes('already registered') || msg.includes('already been registered'))
    return 'An account with this email already exists'
  if (msg.includes('email not confirmed'))
    return 'Please check your email to confirm your account'
  if (msg.includes('rate limit') || msg.includes('too many'))
    return 'Too many attempts. Please wait a few minutes and try again.'
  if (msg.includes('password') && msg.includes('least'))
    return 'Password must be at least 6 characters'
  return error.message
}

export function useAuth() {
  // The client loads lazily (src/lib/supabase/lazy.ts): signed-out users never download it
  const [supabase, setSupabase] = useState<Client | null>(() => getLoadedClient())
  // Signed out on this device: nothing to load, so nothing is loading
  const [state, setState] = useState<AuthState>(() => ({
    user: null,
    loading: !!getLoadedClient() || (typeof window !== 'undefined' && mayHaveSession()),
    error: null,
    isPasswordRecovery: false,
  }))

  useEffect(() => {
    // Any hook instance that loads the client (a sign-in, sync) wakes the others
    const onReady = () => setSupabase(getLoadedClient())
    window.addEventListener(CLIENT_READY_EVENT, onReady)
    // A reset link that reopened the app (native-auth.ts) asks for the new password
    const onRecovery = () => setState(prev => ({ ...prev, isPasswordRecovery: true }))
    window.addEventListener(PASSWORD_RECOVERY_EVENT, onRecovery)
    if (!getLoadedClient() && mayHaveSession()) loadClient().catch(() => setState(prev => ({ ...prev, loading: false })))
    return () => {
      window.removeEventListener(CLIENT_READY_EVENT, onReady)
      window.removeEventListener(PASSWORD_RECOVERY_EVENT, onRecovery)
    }
  }, [])

  useEffect(() => {
    if (!supabase) return
    // Get initial session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setState(prev => ({ ...prev, user, loading: false }))
    })

    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setState(prev => ({
        ...prev,
        user: session?.user ?? null,
        loading: false,
        isPasswordRecovery: event === 'PASSWORD_RECOVERY' ? true : prev.isPasswordRecovery,
      }))
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  /** The client, loading it on first use */
  const client = useCallback(async () => supabase ?? (await loadClient()), [supabase])

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  const clearPasswordRecovery = useCallback(() => {
    setState(prev => ({ ...prev, isPasswordRecovery: false }))
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, error: null, loading: true }))
    const { error } = await (await client()).auth.signUp({ email, password, options: { emailRedirectTo: authRedirect() } })
    if (error) {
      setState(prev => ({ ...prev, error: formatAuthError(error), loading: false }))
      return false
    }
    setState(prev => ({ ...prev, loading: false }))
    return true
  }, [client])

  const signIn = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, error: null, loading: true }))
    const { error } = await (await client()).auth.signInWithPassword({ email, password })
    if (error) {
      setState(prev => ({ ...prev, error: formatAuthError(error), loading: false }))
      return false
    }
    setState(prev => ({ ...prev, loading: false }))
    return true
  }, [client])

  const signInWithGoogle = useCallback(async () => {
    setState(prev => ({ ...prev, error: null }))
    // In the apps the provider page opens in the system browser and returns by deep link
    const native = isNative()
    const { data, error } = await (await client()).auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirect(), skipBrowserRedirect: native },
    })
    if (error) {
      setState(prev => ({ ...prev, error: formatAuthError(error) }))
      return false
    }
    if (native && data.url) await openAuthPage(data.url)
    return true
  }, [client])

  const signInWithMagicLink = useCallback(async (email: string) => {
    setState(prev => ({ ...prev, error: null, loading: true }))
    const { error } = await (await client()).auth.signInWithOtp({
      email,
      options: { emailRedirectTo: authRedirect() },
    })
    if (error) {
      setState(prev => ({ ...prev, error: formatAuthError(error), loading: false }))
      return false
    }
    setState(prev => ({ ...prev, loading: false }))
    return true
  }, [client])

  const resetPassword = useCallback(async (email: string) => {
    setState(prev => ({ ...prev, error: null, loading: true }))
    const { error } = await (await client()).auth.resetPasswordForEmail(email, {
      redirectTo: authRedirect('recovery'),
    })
    if (error) {
      setState(prev => ({ ...prev, error: formatAuthError(error), loading: false }))
      return false
    }
    setState(prev => ({ ...prev, loading: false }))
    return true
  }, [client])

  const updatePassword = useCallback(async (newPassword: string) => {
    setState(prev => ({ ...prev, error: null, loading: true }))
    const { error } = await (await client()).auth.updateUser({ password: newPassword })
    if (error) {
      setState(prev => ({ ...prev, error: formatAuthError(error), loading: false }))
      return false
    }
    setState(prev => ({ ...prev, loading: false, isPasswordRecovery: false }))
    return true
  }, [client])

  const signOut = useCallback(async () => {
    await (await client()).auth.signOut()
  }, [client])

  /** Deletes the account and everything synced to it (migration 004), then signs out */
  const deleteAccount = useCallback(async () => {
    const { error } = await (await client()).rpc('delete_my_account')
    if (error) return false
    await (await client()).auth.signOut({ scope: 'local' })
    return true
  }, [client])

  return {
    ...state,
    signUp,
    signIn,
    signInWithGoogle,
    signInWithMagicLink,
    resetPassword,
    updatePassword,
    signOut,
    deleteAccount,
    clearError,
    clearPasswordRecovery,
  }
}
