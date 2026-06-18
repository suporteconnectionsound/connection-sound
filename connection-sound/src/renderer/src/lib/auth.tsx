import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, type Profile, type Subscription } from './supabase'

interface AuthState {
  loading: boolean
  session: Session | null
  user: User | null
  profile: Profile | null
  subscription: Subscription | null
  hasAccess: boolean
  isPro: boolean
  trialDaysLeft: number
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string; needsConfirm?: boolean }>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth fora do AuthProvider')
  return c
}

const DAY = 86400000

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)

  const loadData = useCallback(async (userId: string) => {
    const [{ data: prof }, { data: sub }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('subscriptions').select('*').eq('user_id', userId).maybeSingle()
    ])
    setProfile((prof as Profile | null) ?? null)
    setSubscription((sub as Subscription | null) ?? null)
  }, [])

  useEffect(() => {
    let mounted = true
    const finish = (): void => {
      if (mounted) setLoading(false)
    }
    // rede de segurança: nunca prende no splash
    const safety = setTimeout(finish, 8000)

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return
        setSession(data.session)
        if (data.session?.user) await loadData(data.session.user.id).catch(() => {})
        finish()
        clearTimeout(safety)
      })
      .catch(() => {
        finish()
        clearTimeout(safety)
      })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s)
      if (s?.user) await loadData(s.user.id).catch(() => {})
      else {
        setProfile(null)
        setSubscription(null)
      }
      finish()
    })
    return () => {
      mounted = false
      clearTimeout(safety)
      listener.subscription.unsubscribe()
    }
  }, [loadData])

  const now = Date.now()
  const trialEnd = profile?.trial_ends_at ? new Date(profile.trial_ends_at).getTime() : 0
  const trialValid = trialEnd > now
  const isPro = subscription?.status === 'active'
  const hasAccess = isPro || trialValid
  const trialDaysLeft = trialValid ? Math.max(0, Math.ceil((trialEnd - now) / DAY)) : 0

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message }
  }, [])

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } }
    })
    if (error) return { error: error.message }
    return { needsConfirm: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const refresh = useCallback(async () => {
    if (session?.user) await loadData(session.user.id)
  }, [session, loadData])

  return (
    <Ctx.Provider
      value={{
        loading,
        session,
        user: session?.user ?? null,
        profile,
        subscription,
        hasAccess,
        isPro,
        trialDaysLeft,
        signIn,
        signUp,
        signOut,
        refresh
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
