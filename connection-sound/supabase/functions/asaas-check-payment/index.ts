// Polling leve do app para verificar o status de um pagamento PIX.
// Retorna { status, receivedAt } a partir do Asaas.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { asaas, AsaasError } from '../_shared/asaas.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

interface AsaasPayment {
  id: string
  status: string
  customer?: string
  paymentDate?: string
  confirmedDate?: string
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

    const { paymentId } = (await req.json().catch(() => ({}))) as { paymentId?: string }
    if (!paymentId) return new Response(JSON.stringify({ error: 'paymentId ausente' }), { status: 400, headers: cors })

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Verifica no Asaas o status real (a função webhook já atualizou a tabela).
    const pay = await asaas<AsaasPayment>(`/payments/${paymentId}`)

    // Já está pago? Confirma nosso banco com o status do Asaas (cobre eventual atraso do webhook).
    if (pay.status === 'RECEIVED' || pay.status === 'CONFIRMED') {
      const { data: sub } = await admin
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      if (sub?.status !== 'active') {
        await admin
          .from('subscriptions')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
      }
    }

    return new Response(
      JSON.stringify({
        status: pay.status,
        receivedAt: pay.confirmedDate ?? pay.paymentDate ?? null
      }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    if (e instanceof AsaasError) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors })
    }
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: cors
    })
  }
})
