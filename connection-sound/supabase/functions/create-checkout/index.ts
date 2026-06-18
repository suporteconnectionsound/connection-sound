// Cria uma sessão de checkout da Stripe (server-side, usa a chave secreta).
// Dois modos:
//   - Cartão  → assinatura recorrente (mode: subscription) usando um priceId recorrente.
//   - Pix     → pagamento único (mode: payment) que libera N dias de acesso.
// O app chama esta função com o JWT do usuário; ela devolve a URL do checkout.
import Stripe from 'https://esm.sh/stripe@16?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' })

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

// Valores do Pix (à vista) controlados pelo servidor — não confia em valor vindo do cliente.
const PIX_PLANS: Record<string, { amount: number; days: number; label: string }> = {
  month: { amount: 1999, days: 30, label: 'Connection Sound Pro — 1 mês (Pix)' },
  year: { amount: 11999, days: 365, label: 'Connection Sound Pro — 1 ano (Pix)' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    })
    const {
      data: { user }
    } = await supabase.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'não autenticado' }), { status: 401, headers: cors })

    const { priceId, method, plan } = await req.json()
    const isPix = method === 'pix'
    if (!isPix && !priceId) {
      return new Response(JSON.stringify({ error: 'priceId ausente' }), { status: 400, headers: cors })
    }
    if (isPix && !PIX_PLANS[plan]) {
      return new Response(JSON.stringify({ error: 'plano Pix inválido' }), { status: 400, headers: cors })
    }

    // Reaproveita (ou cria) o cliente Stripe do usuário.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: sub } = await admin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    let customerId = sub?.stripe_customer_id as string | undefined
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } })
      customerId = customer.id
      await admin.from('subscriptions').update({ stripe_customer_id: customerId }).eq('user_id', user.id)
    }

    const success_url = 'https://connectionsound.com/cs-success?session_id={CHECKOUT_SESSION_ID}'
    const cancel_url = 'https://connectionsound.com/cs-cancel'

    let session: Stripe.Checkout.Session
    if (isPix) {
      const p = PIX_PLANS[plan]
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: customerId,
        payment_method_types: ['pix'],
        line_items: [
          {
            price_data: {
              currency: 'brl',
              product_data: { name: p.label },
              unit_amount: p.amount
            },
            quantity: 1
          }
        ],
        metadata: { user_id: user.id, access_days: String(p.days), kind: 'pix' },
        payment_intent_data: { metadata: { user_id: user.id, access_days: String(p.days) } },
        success_url,
        cancel_url
      })
    } else {
      session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url,
        cancel_url,
        metadata: { user_id: user.id },
        subscription_data: { metadata: { user_id: user.id } }
      })
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 400, headers: cors })
  }
})
