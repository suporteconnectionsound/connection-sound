// Recebe eventos da Stripe, valida a assinatura e atualiza a tabela subscriptions.
import Stripe from 'https://esm.sh/stripe@16?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' })
const cryptoProvider = Stripe.createSubtleCryptoProvider()
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// Notificação para o dono a cada pagamento/assinatura que entra.
const RESEND = Deno.env.get('RESEND_API_KEY') ?? ''
const OWNER_EMAIL = Deno.env.get('OWNER_NOTIFY_EMAIL') ?? 'davidlindoso43@gmail.com'

async function notifyOwner(label: string, session: Stripe.Checkout.Session): Promise<void> {
  if (!RESEND) return
  const email = session.customer_details?.email ?? session.customer_email ?? '—'
  const name = session.customer_details?.name ?? ''
  const valor =
    session.amount_total != null ? `R$ ${(session.amount_total / 100).toFixed(2).replace('.', ',')}` : '—'
  const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const html = `<!doctype html><html><body style="margin:0;background:#07070b;padding:24px;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#111118;border:1px solid #23232e;border-radius:16px;overflow:hidden">
      <tr><td style="height:4px;background:linear-gradient(90deg,#ff9248,#f25312,#111118)"></td></tr>
      <tr><td style="padding:26px 30px;color:#e6e6ee">
        <div style="font-size:13px;color:#ff9248;font-weight:bold;letter-spacing:.3px">CONNECTION SOUND</div>
        <h1 style="margin:8px 0 16px;font-size:22px;color:#fff">💰 ${label}</h1>
        <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.9;color:#c9c9d4">
          <tr><td style="color:#8a8a96;padding-right:14px">Cliente</td><td style="color:#fff">${name ? name + ' · ' : ''}${email}</td></tr>
          <tr><td style="color:#8a8a96;padding-right:14px">Valor</td><td style="color:#fff;font-weight:bold">${valor}</td></tr>
          <tr><td style="color:#8a8a96;padding-right:14px">Quando</td><td style="color:#fff">${quando}</td></tr>
        </table>
      </td></tr>
    </table></td></tr></table></body></html>`
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Connection Sound <noreply@connectionsound.com>',
        to: [OWNER_EMAIL],
        subject: `💰 ${label} — ${valor}`,
        html
      })
    })
  } catch {
    /* nunca interrompe o webhook por causa do e-mail */
  }
}

function mapStatus(s: string): string {
  if (s === 'active' || s === 'trialing') return 'active'
  if (s === 'past_due' || s === 'unpaid') return 'past_due'
  if (s === 'canceled' || s === 'incomplete_expired') return 'canceled'
  return s
}

async function syncSubscription(subscriptionId: string, userIdHint?: string): Promise<void> {
  const s = await stripe.subscriptions.retrieve(subscriptionId)
  const customerId = typeof s.customer === 'string' ? s.customer : s.customer.id
  const patch = {
    stripe_subscription_id: s.id,
    stripe_customer_id: customerId,
    status: mapStatus(s.status),
    price_id: s.items.data[0]?.price?.id ?? null,
    current_period_end: new Date(s.current_period_end * 1000).toISOString(),
    updated_at: new Date().toISOString()
  }
  const userId = userIdHint ?? (s.metadata?.user_id as string | undefined)
  if (userId) await admin.from('subscriptions').update(patch).eq('user_id', userId)
  else await admin.from('subscriptions').update(patch).eq('stripe_customer_id', customerId)
}

// Pagamento à vista (Boleto): libera acesso por N dias. Empilha se ainda houver tempo.
async function grantOneTime(session: Stripe.Checkout.Session): Promise<void> {
  const userId =
    (session.client_reference_id as string | null) ?? (session.metadata?.user_id as string | undefined)
  if (!userId) return
  const days = parseInt((session.metadata?.access_days as string) || '30', 10)
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id

  // Base = a partir de agora OU do fim do período atual, o que for maior (renovação empilha).
  const { data: cur } = await admin
    .from('subscriptions')
    .select('current_period_end')
    .eq('user_id', userId)
    .maybeSingle()
  const now = Date.now()
  const existingEnd = cur?.current_period_end ? new Date(cur.current_period_end).getTime() : 0
  const base = Math.max(now, existingEnd)
  const end = new Date(base + days * 86400000).toISOString()

  await admin
    .from('subscriptions')
    .update({
      status: 'active',
      price_id: `boleto_${days}d`,
      current_period_end: end,
      stripe_customer_id: customerId ?? undefined,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
}

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature')
  const body = await req.text()
  if (!sig) return new Response('sem assinatura', { status: 400 })

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
      undefined,
      cryptoProvider
    )
  } catch (e) {
    return new Response(`assinatura inválida: ${(e as Error).message}`, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          // Checkout embutido envia user_id em metadata; Payment Link (e-mails) envia em client_reference_id.
          const uid =
            (session.client_reference_id as string | null) ?? (session.metadata?.user_id as string | undefined)
          await syncSubscription(String(session.subscription), uid || undefined)
          await notifyOwner('Nova assinatura (cartão)', session)
        } else if (session.mode === 'payment' && session.payment_status === 'paid') {
          // Pagamento único já confirmado (ex.: cartão em modo payment).
          await grantOneTime(session)
          await notifyOwner('Novo pagamento', session)
        }
        break
      }
      case 'checkout.session.async_payment_succeeded': {
        // Boleto confirma de forma assíncrona — é aqui que o pagamento é aprovado.
        const session = event.data.object as Stripe.Checkout.Session
        await grantOneTime(session)
        await notifyOwner('Novo pagamento (boleto)', session)
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const s = event.data.object as Stripe.Subscription
        await syncSubscription(s.id, s.metadata?.user_id as string | undefined)
        break
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        if (inv.subscription) {
          await admin
            .from('subscriptions')
            .update({ status: 'past_due', updated_at: new Date().toISOString() })
            .eq('stripe_subscription_id', String(inv.subscription))
        }
        break
      }
    }
  } catch (e) {
    return new Response(`erro no handler: ${(e as Error).message}`, { status: 500 })
  }

  return new Response('ok', { status: 200 })
})
