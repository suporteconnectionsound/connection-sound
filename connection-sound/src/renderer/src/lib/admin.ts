import { supabase } from './supabase'

export const ADMIN_EMAIL = 'davidlindoso43@gmail.com'

export interface AdminStats {
  revenue: number
  currency: string
  totalAccounts: number
  activePaid: number
  permanent: number
  trialing: number
}

export interface AdminRow {
  user_id: string
  email: string | null
  name: string | null
  status: string
  price_id: string | null
  paid: boolean
  current_period_end: string | null
  trial_ends_at: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call<T = any>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin', { body: { action, ...params } })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data as T
}

export const adminApi = {
  stats: () => call<AdminStats>('stats'),
  list: () => call<{ rows: AdminRow[] }>('list'),
  grant: (email: string, days?: number) => call('grant', { email, days }),
  revoke: (email: string) => call('revoke', { email }),
  email: (to: string, subject: string, message: string) => call('email', { to, subject, message })
}
