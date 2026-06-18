import { supabase } from './supabase'

export type CheckoutResult = 'success' | 'cancel' | 'closed' | 'error'
export type PayMethod = 'card' | 'boleto'

/** Cria a sessão de checkout (Edge Function) e abre o pagamento numa janela embutida.
 *  method 'card' = assinatura recorrente; method 'boleto' = pagamento único (libera N dias). */
export async function startCheckout(plan: 'month' | 'year', method: PayMethod = 'card'): Promise<CheckoutResult> {
  try {
    let body: Record<string, unknown>
    if (method === 'boleto') {
      body = { method: 'boleto', plan }
    } else {
      const priceId =
        plan === 'year' ? import.meta.env.VITE_STRIPE_PRICE_YEARLY : import.meta.env.VITE_STRIPE_PRICE_MONTHLY
      body = { priceId }
    }
    const { data, error } = await supabase.functions.invoke('create-checkout', { body })
    if (error || !data?.url) return 'error'
    const result = await window.cs.openCheckout(data.url as string)
    return (result as CheckoutResult) ?? 'error'
  } catch {
    return 'error'
  }
}
