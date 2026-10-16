'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
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
  const [supabase] = useState(() => createClient())
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
    isPasswordRecovery: false,
  })

  useEffect(() => {
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

    // A reset link that reopened the app (native-auth.ts) asks for the new password
    const onRecovery = () => setState(prev => ({ ...prev, isPasswordRecovery: true }))
    window.addEventListener(PASSWORD_RECOVERY_EVENT, onRecovery)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener(PASSWORD_RECOVERY_EVENT, onRecovery)
    }
  }, [supabase])

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  const clearPasswordRecovery = useCallback(() => {
    setState(prev => ({ ...prev, isPasswordRecovery: false }))
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, error: null, loading: true }))
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: authRedirect() } })
    if (error) {
      setState(prev => ({ ...prev, error: formatAuthError(error), loading: false }))
      return false
    }
    setState(prev => ({ ...prev, loading: false }))
    return true
  }, [supabase])

  const signIn = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, error: null, loading: true }))
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setState(prev => ({ ...prev, error: formatAuthError(error), loading: false }))
      return false
    }
    setState(prev => ({ ...prev, loading: false }))
    return true
  }, [supabase])

  const signInWithGoogle = useCallback(async () => {
    setState(prev => ({ ...prev, error: null }))
    // In the apps the provider page opens in the system browser and returns by deep link
    const native = isNative()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirect(), skipBrowserRedirect: native },
    })
    if (error) {
      setState(prev => ({ ...prev, error: formatAuthError(error) }))
      return false
    }
    if (native && data.url) await openAuthPage(data.url)
    return true
  }, [supabase])

  const signInWithMagicLink = useCallback(async (email: string) => {
    setState(prev => ({ ...prev, error: null, loading: true }))
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: authRedirect() },
    })
    if (error) {
      setState(prev => ({ ...prev, error: formatAuthError(error), loading: false }))
      return false
    }
    setState(prev => ({ ...prev, loading: false }))
    return true
  }, [supabase])

  const resetPassword = useCallback(async (email: string) => {
    setState(prev => ({ ...prev, error: null, loading: true }))
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirect('recovery'),
    })
    if (error) {
      setState(prev => ({ ...prev, error: formatAuthError(error), loading: false }))
      return false
    }
    setState(prev => ({ ...prev, loading: false }))
    return true
  }, [supabase])

  const updatePassword = useCallback(async (newPassword: string) => {
    setState(prev => ({ ...prev, error: null, loading: true }))
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setState(prev => ({ ...prev, error: formatAuthError(error), loading: false }))
      return false
    }
    setState(prev => ({ ...prev, loading: false, isPasswordRecovery: false }))
    return true
  }, [supabase])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [supabase])

  /** Deletes the account and everything synced to it (migration 004), then signs out */
  const deleteAccount = useCallback(async () => {
    const { error } = await supabase.rpc('delete_my_account')
    if (error) return false
    await supabase.auth.signOut({ scope: 'local' })
    return true
  }, [supabase])

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
