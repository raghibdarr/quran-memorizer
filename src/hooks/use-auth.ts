'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

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

    return () => subscription.unsubscribe()
  }, [supabase])

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  const clearPasswordRecovery = useCallback(() => {
    setState(prev => ({ ...prev, isPasswordRecovery: false }))
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, error: null, loading: true }))
    const { error } = await supabase.auth.signUp({ email, password })
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setState(prev => ({ ...prev, error: formatAuthError(error) }))
      return false
    }
    return true
  }, [supabase])

  const signInWithMagicLink = useCallback(async (email: string) => {
    setState(prev => ({ ...prev, error: null, loading: true }))
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
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
      redirectTo: `${window.location.origin}/auth/callback`,
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

  return {
    ...state,
    signUp,
    signIn,
    signInWithGoogle,
    signInWithMagicLink,
    resetPassword,
    updatePassword,
    signOut,
    clearError,
    clearPasswordRecovery,
  }
}
