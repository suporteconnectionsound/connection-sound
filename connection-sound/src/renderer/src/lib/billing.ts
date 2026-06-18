import { supabase } from './supabase'

export type CheckoutResult = 'success' | 'cancel' | 'closed' | 'error'

/** Cria a sessão de checkout (Edge Function) e abre o pagamento numa janela embutida. */
export async function startCheckout(plan: 'month' | 'year'): Promise<CheckoutResult> {
  const priceId = plan === 'year' ? import.meta.env.VITE_STRIPE_PRICE_YEARLY : import.meta.env.VITE_STRIPE_PRICE_MONTHLY
  try {
    const { data, error } = await supabase.functions.invoke('create-checkout', { body: { priceId } })
    if (error || !data?.url) return 'error'
    const result = await window.cs.openCheckout(data.url as string)
    return (result as CheckoutResult) ?? 'error'
  } catch {
    return 'error'
  }
}
