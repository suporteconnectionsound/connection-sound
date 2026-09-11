// Cria uma cobrança Asaas.
//   - method: 'pix'  → POST /payments (PIX avulso). Devolve QR + copia-e-cola.
//   - method: 'card' → POST /checkouts (checkout hospedado Asaas) com chargeTypes
//                       RECURRENT + subscription. Devolve URL onde o usuário digita
//                       o cartão. O webhook SUBSCRIPTION_CREATED libera o acesso.
// Acesso controlado pelo JWT do Supabase do usuário.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  ASAAS_PLAN_PRICES,
  ASAAS_PIX_PRICES,
  asaas,
  ensureCustomer,
  AsaasError
} from '../_shared/asaas.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

interface CreateBody {
  method: 'pix' | 'card'
  plan: 'month' | 'year'
}

interface AsaasPixPayment {
  id: string
  status: string
  invoiceUrl?: string
  dueDate?: string
  encodedImage?: string
  payload?: string
  expirationDate?: string
}

interface AsaasCheckout {
  id: string
  link: string
  status: string
  billingTypes?: string[]
  chargeTypes?: string[]
}

function asaasOrigin(): string {
  return (Deno.env.get('ASAAS_ENV') ?? 'sandbox') === 'production'
    ? 'https://www.asaas.com'
    : 'https://sandbox.asaas.com'
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

    const body = (await req.json().catch(() => ({}))) as CreateBody
    const method = body.method
    const plan = body.plan
    if (method !== 'pix' && method !== 'card') {
      return new Response(JSON.stringify({ error: 'method inválido' }), { status: 400, headers: cors })
    }
    if (plan !== 'month' && plan !== 'year') {
      return new Response(JSON.stringify({ error: 'plan inválido' }), { status: 400, headers: cors })
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const name = (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'Cliente'

    if (method === 'pix') {
      const p = ASAAS_PIX_PRICES[plan]
      const customerId = await ensureCustomer(user.email!, name)
      await admin
        .from('subscriptions')
        .upsert(
          {
            user_id: user.id,
            asaas_customer_id: customerId,
            status: 'pending',
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id' }
        )

      const pix = await asaas<AsaasPixPayment>('/payments', {
        method: 'POST',
        body: JSON.stringify({
          customer: customerId,
          billingType: 'PIX',
          value: p.value,
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          description: p.label,
          externalReference: `user:${user.id}:pix:${plan}`
        })
      })

      return new Response(
        JSON.stringify({
          type: 'pix',
          paymentId: pix.id,
          brCode: pix.payload ?? '',
          qrCodeBase64: pix.encodedImage ?? '',
          expiresAt: pix.expirationDate ?? pix.dueDate ?? null,
          invoiceUrl: pix.invoiceUrl ?? null,
          amount: p.value,
          plan
        }),
        { headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // method === 'card' — checkout hospedado com subscription recorrente.
    const p = ASAAS_PLAN_PRICES[plan]
    const customerId = await ensureCustomer(user.email!, name)
    await admin
      .from('subscriptions')
      .upsert(
        {
          user_id: user.id,
          asaas_customer_id: customerId,
          status: 'pending',
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      )

    const origin = new URL(req.url).origin
    const ck = await asaas<AsaasCheckout>('/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        billingTypes: ['CREDIT_CARD', 'PIX'],
        chargeTypes: ['RECURRENT'],
        minutesToExpire: 60,
        externalReference: `user:${user.id}:sub:${plan}`,
        callback: {
          successUrl: `${origin}/cs-success?provider=asaas`,
          cancelUrl: `${origin}/cs-cancel?provider=asaas`,
          expiredUrl: `${origin}/cs-cancel?provider=asaas&reason=expired`
        },
        customerData: {
          name,
          email: user.email ?? undefined
        },
        subscription: {
          cycle: p.cycle,
          value: p.value,
          description: p.label
        }
      })
    })

    return new Response(
      JSON.stringify({
        type: 'card',
        checkoutId: ck.id,
        checkoutUrl: ck.link,
        amount: p.value,
        cycle: p.cycle,
        plan
      }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    if (e instanceof AsaasError) {
      return new Response(JSON.stringify({ error: e.message, details: e.body }), {
        status: 500,
        headers: cors
      })
    }
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: cors
    })
  }
})
