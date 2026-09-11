// Painel admin — só o ADMIN_EMAIL pode chamar. Faturamento, assinaturas e e-mails.
// Agora lê do Asaas (em vez de Stripe) para faturamento e cancelamento.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { asaasEnv } from '../_shared/asaas.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const ADMIN_EMAIL = (Deno.env.get('ADMIN_EMAIL') ?? '').toLowerCase()
const RESEND = Deno.env.get('RESEND_API_KEY') ?? ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (b: unknown, status = 200): Response =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Connection Sound <noreply@connectionsound.com>', to: [to], subject, html })
  })
  return r.ok
}

// deno-lint-ignore no-explicit-any
Deno.serve(async (req: any) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
  })
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user || (user.email ?? '').toLowerCase() !== ADMIN_EMAIL) return json({ error: 'acesso negado' }, 403)

  const { action, ...p } = await req.json()
  try {
    if (action === 'stats') {
      const { data: subs } = await admin.from('subscriptions').select('status, asaas_subscription_id, price_id')
      const { count: totalAccounts } = await admin.from('profiles').select('*', { count: 'exact', head: true })
      const list = subs ?? []
      const activePaid = list.filter((s) => s.status === 'active' && s.asaas_subscription_id).length
      const permanent = list.filter((s) => s.status === 'active' && !s.asaas_subscription_id).length
      const trialing = list.filter((s) => s.status === 'trialing').length

      // Faturamento Asaas: soma de payments RECEIVED nos últimos 60 dias (paginando).
      // (Asaas v3 ainda oferece /financialTransactions para o extrato completo.)
      let revenue = 0
      try {
        const { baseUrl } = asaasEnv()
        let offset = 0
        const limit = 100
        for (let i = 0; i < 20; i++) {
          const r = await fetch(`${baseUrl}/payments?status=RECEIVED&limit=${limit}&offset=${offset}`, {
            headers: { access_token: Deno.env.get('ASAAS_API_KEY') ?? '' }
          })
          if (!r.ok) break
          const j = (await r.json()) as { data?: { value?: number }[]; hasMore?: boolean }
          for (const it of j.data ?? []) revenue += Number(it.value ?? 0)
          if (!j.hasMore || (j.data ?? []).length < limit) break
          offset += limit
        }
      } catch {
        /* sem Asaas configurado: revenue fica 0 */
      }

      return json({
        revenue: revenue,
        currency: 'BRL',
        totalAccounts: totalAccounts ?? 0,
        activePaid,
        permanent,
        trialing
      })
    }

    if (action === 'list') {
      const { data: subs } = await admin
        .from('subscriptions')
        .select('user_id,status,price_id,asaas_subscription_id,current_period_end')
      const { data: profs } = await admin.from('profiles').select('id,email,full_name,trial_ends_at,created_at')
      const pmap = new Map((profs ?? []).map((p2) => [p2.id, p2]))
      const rows = (subs ?? []).map((s) => {
        const pr = pmap.get(s.user_id)
        return {
          user_id: s.user_id,
          email: pr?.email ?? null,
          name: pr?.full_name ?? null,
          status: s.status,
          price_id: s.price_id,
          paid: !!s.asaas_subscription_id,
          current_period_end: s.current_period_end,
          trial_ends_at: pr?.trial_ends_at ?? null
        }
      })
      return json({ rows })
    }

    if (action === 'grant') {
      const { data: prof } = await admin.from('profiles').select('id').eq('email', p.email).maybeSingle()
      if (!prof) return json({ error: 'usuário não encontrado' }, 404)
      const end = p.days ? new Date(Date.now() + Number(p.days) * 86400000) : new Date('2099-12-31T00:00:00Z')
      await admin
        .from('subscriptions')
        .update({
          status: 'active',
          price_id: p.days ? 'manual' : 'permanente',
          current_period_end: end.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', prof.id)
      return json({ ok: true })
    }

    if (action === 'revoke') {
      const { data: prof } = await admin.from('profiles').select('id').eq('email', p.email).maybeSingle()
      if (!prof) return json({ error: 'usuário não encontrado' }, 404)
      const { data: sub } = await admin
        .from('subscriptions')
        .select('asaas_subscription_id')
        .eq('user_id', prof.id)
        .maybeSingle()
      if (sub?.asaas_subscription_id) {
        try {
          // Asaas: cancelar via DELETE /subscriptions/{id}
          await asaas(`/subscriptions/${sub.asaas_subscription_id}`, { method: 'DELETE' })
        } catch {
          /* já cancelada */
        }
      }
      await admin
        .from('subscriptions')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('user_id', prof.id)
      return json({ ok: true })
    }

    if (action === 'email') {
      const ok = await sendEmail(p.to, p.subject ?? 'Connection Sound', p.html ?? `<p>${p.message ?? ''}</p>`)
      return json({ ok })
    }

    return json({ error: 'ação inválida' }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})

