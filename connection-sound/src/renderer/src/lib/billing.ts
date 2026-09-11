import { supabase } from './supabase'

export type CheckoutResult = 'success' | 'cancel' | 'closed' | 'error'
export type PayMethod = 'pix' | 'card'

export interface PixData {
  type: 'pix'
  paymentId: string
  brCode: string
  qrCodeBase64: string
  expiresAt: string | null
  invoiceUrl: string | null
  amount: number
  plan: 'month' | 'year'
}

export interface CardData {
  type: 'card'
  checkoutId: string
  checkoutUrl: string
  amount: number
  cycle: 'MONTHLY' | 'YEARLY'
  plan: 'month' | 'year'
}

/** Cria um pagamento PIX avulso (libera N dias) e devolve QR + copia-e-cola.
 *  O app mostra o QR e faz polling em asaas-check-payment até confirmar. */
export async function startPix(plan: 'month' | 'year'): Promise<PixData | null> {
  try {
    const timeout = new Promise<null>((res) => setTimeout(() => res(null), 20000))
    const invoke = supabase.functions.invoke('asaas-create-checkout', {
      body: { method: 'pix', plan }
    }) as PromiseLike<{ data: PixData | null }>
    const r = (await Promise.race([invoke, timeout])) as { data: PixData | null } | null
    return r?.data ?? null
  } catch {
    return null
  }
}

/** Cria uma assinatura cartão recorrente e devolve a URL de checkout hospedado Asaas.
 *  O app abre a URL numa janela embutida; o Asaas cuida do cartão e o webhook libera. */
export async function startCard(plan: 'month' | 'year'): Promise<CardData | null> {
  try {
    const timeout = new Promise<null>((res) => setTimeout(() => res(null), 20000))
    const invoke = supabase.functions.invoke('asaas-create-checkout', {
      body: { method: 'card', plan }
    }) as PromiseLike<{ data: CardData | null }>
    const r = (await Promise.race([invoke, timeout])) as { data: CardData | null } | null
    return r?.data ?? null
  } catch {
    return null
  }
}

/** Confere o status de um pagamento PIX no Asaas (polling). */
export async function checkPayment(paymentId: string): Promise<{ status: string } | null> {
  try {
    const r = await supabase.functions.invoke('asaas-check-payment', { body: { paymentId } })
    if (r.error || !r.data) return null
    return r.data as { status: string }
  } catch {
    return null
  }
}

/** Abre o checkout hospedado Asaas (cartão) numa janela embutida. */
export async function openCardCheckout(url: string): Promise<CheckoutResult> {
  try {
    const result = await window.cs.openCheckout(url)
    return (result as CheckoutResult) ?? 'closed'
  } catch {
    return 'error'
  }
}
