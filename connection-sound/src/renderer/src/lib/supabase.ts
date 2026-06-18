import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
})

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  trial_started_at: string | null
  trial_ends_at: string | null
}

export interface Subscription {
  user_id: string
  status: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled'
  price_id: string | null
  current_period_end: string | null
}
