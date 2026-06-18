// Painel admin — só o ADMIN_EMAIL pode chamar. Faturamento, assinaturas e e-mails.
import Stripe from 'https://esm.sh/stripe@16?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' })
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
      const { data: subs } = await admin.from('subscriptions').select('status, stripe_subscription_id')
      const { count: totalAccounts } = await admin.from('profiles').select('*', { count: 'exact', head: true })
      const list = subs ?? []
      const activePaid = list.filter((s) => s.status === 'active' && s.stripe_subscription_id).length
      const permanent = list.filter((s) => s.status === 'active' && !s.stripe_subscription_id).length
      const trialing = list.filter((s) => s.status === 'trialing').length

      let revenue = 0
      let currency = 'brl'
      let hasMore = true
      let startingAfter: string | undefined = undefined
      let guard = 0
      while (hasMore && guard < 10) {
        const ch = await stripe.charges.list({ limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) })
        for (const c of ch.data) if (c.paid && c.status === 'succeeded') { revenue += c.amount; currency = c.currency }
        hasMore = ch.has_more
        startingAfter = ch.data[ch.data.length - 1]?.id
        guard++
      }
      return json({ revenue: revenue / 100, currency, totalAccounts: totalAccounts ?? 0, activePaid, permanent, trialing })
    }

    if (action === 'list') {
      const { data: subs } = await admin
        .from('subscriptions')
        .select('user_id,status,price_id,stripe_subscription_id,current_period_end')
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
          paid: !!s.stripe_subscription_id,
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
        .select('stripe_subscription_id')
        .eq('user_id', prof.id)
        .maybeSingle()
      if (sub?.stripe_subscription_id) {
        try {
          await stripe.subscriptions.cancel(sub.stripe_subscription_id)
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
