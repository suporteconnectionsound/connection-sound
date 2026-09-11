// Recebe eventos do Asaas, valida o token do header e atualiza a tabela subscriptions.
//
// Eventos tratados (cobrem o ciclo de vida + chargebacks):
//   Pagamentos PIX/avulso:
//     PAYMENT_RECEIVED / PAYMENT_CONFIRMED  → libera dias (grantPixDays).
//     PAYMENT_OVERDUE                       → nada (pagamento avulso sem renovação não muda assinatura).
//     PAYMENT_DELETED                       → nada.
//     PAYMENT_REFUNDED / PARTIALLY_REFUNDED → status='canceled', current_period_end=agora.
//     PAYMENT_REFUND_DENIED                 → log silencioso.
//     PAYMENT_CHARGEBACK_REQUESTED          → status='canceled', current_period_end=agora.
//     PAYMENT_CHARGEBACK_DISPUTE            → log silencioso (disputa em andamento).
//     PAYMENT_AWAITING_CHARGEBACK_REVERSAL  → status='canceled', current_period_end=agora.
//
//   Assinaturas (cartão recorrente):
//     SUBSCRIPTION_CREATED / UPDATED        → espelha status + nextDueDate + price_id.
//     SUBSCRIPTION_INACTIVATED              → status='past_due' (Asaas inativou por regra/inadimplência).
//     SUBSCRIPTION_DELETED                  → status='canceled'.
//
//   Cobranças geradas por assinatura (PAYMENT_* com payment.subscription populada):
//     Renovação = PAYMENT_RECEIVED/CONFIRMED — já tratada nos casos acima.
//     O grantPixDays detecta se o payment tem subscription e estende o período.
//
// Outros eventos (BANK_SLIP_VIEWED, CHECKOUT_VIEWED, DUNNING_*, SPLIT_*, *_RISK_ANALYSIS,
// ANTICIPATED, RESTORED, REPROVED_BY_RISK, etc.) recebem log silencioso para observabilidade.
//
// Autenticação: header `asaas-access-token` deve bater com ASAAS_WEBHOOK_TOKEN.
// Importante: Asaas entrega webhooks at-least-once — dedupe persistente por body.id
// (tabela processed_webhook_events). O Set em memória foi removido porque perdia
// entre cold starts do Deno Deploy e duplicava eventos (grantPixDays dobraria dias).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { asaas, AsaasError } from '../_shared/asaas.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const TOKEN = Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? ''
const RESEND = Deno.env.get('RESEND_API_KEY') ?? ''
const OWNER_EMAIL =
  Deno.env.get('OWNER_NOTIFY_EMAIL') ?? Deno.env.get('ADMIN_EMAIL') ?? 'davidlindoso44@gmail.com'

/** Tenta inserir (event_id, source). Devolve true se a linha foi inserida (evento novo),
 *  false se já existia (duplicado). Usa upsert atômico — race-free. */
async function claimEvent(eventId: string): Promise<boolean> {
  const { data } = await admin
    .from('processed_webhook_events')
    .upsert({ event_id: eventId, source: 'asaas' }, { onConflict: 'event_id', ignoreDuplicates: true })
    .select('event_id')
  return Array.isArray(data) ? data.length > 0 : false
}

interface AsaasPayment {
  id: string
  status: string
  value: number
  externalReference?: string
  customer?: string
  subscription?: string
  paymentDate?: string
  confirmedDate?: string
}

interface AsaasSubscription {
  id: string
  status: string
  cycle?: string
  value?: number
  nextDueDate?: string
  customer?: string
  externalReference?: string
}

interface AsaasWebhookBody {
  event: string
  id?: string
  payment?: AsaasPayment
  subscription?: AsaasSubscription
}

function notifyOwner(label: string, html: string): Promise<void> {
  if (!RESEND) return Promise.resolve()
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Connection Sound <noreply@connectionsound.com>',
      to: [OWNER_EMAIL],
      subject: label,
      html
    })
  }).catch(() => {})
}

function logEvent(label: string, body: AsaasWebhookBody): Promise<void> {
  return notifyOwner(
    `🪝 Asaas: ${label}`,
    `<p>event=<code>${body.event}</code> id=<code>${body.id ?? '-'}</code></p>
     <pre style="font-size:11px;background:#f5f5f5;padding:8px;border-radius:4px;overflow:auto">${JSON.stringify(body, null, 2).slice(0, 1500)}</pre>`
  )
}

function externalRefUserId(ref?: string): string | null {
  // Formato: "user:<user_id>:pix:month" | "user:<user_id>:sub:year"
  if (!ref) return null
  const m = ref.match(/^user:([a-f0-9-]{8,}):(pix|sub)/i)
  return m ? m[1] : null
}

/** Resolve a linha de assinatura: prioriza user_id do externalReference; cai pra customer_id. */
async function findSubRef(p: {
  externalReference?: string
  customer?: string
  asaasSubscriptionId?: string
}): Promise<{ column: 'user_id' | 'asaas_customer_id' | 'asaas_subscription_id'; value: string } | null> {
  const userId = externalRefUserId(p.externalReference)
  if (userId) return { column: 'user_id', value: userId }
  if (p.asaasSubscriptionId) return { column: 'asaas_subscription_id', value: p.asaasSubscriptionId }
  if (p.customer) return { column: 'asaas_customer_id', value: p.customer }
  return null
}

async function grantPixDays(userId: string, paymentId: string, ref?: string): Promise<void> {
  // Determina quantos dias pelo ref (pix:month=30, pix:year=365).
  let days = 30
  if (ref && /pix:year/i.test(ref)) days = 365
  // Empilha: base = agora OU fim do período atual, o que for maior.
  const { data: cur } = await admin
    .from('subscriptions')
    .select('current_period_end')
    .eq('user_id', userId)
    .maybeSingle()
  const now = Date.now()
  const existing = cur?.current_period_end ? new Date(cur.current_period_end).getTime() : 0
  const base = Math.max(now, existing)
  const end = new Date(base + days * 86400000).toISOString()

  await admin
    .from('subscriptions')
    .update({
      status: 'active',
      price_id: `asaas_pix_${days}d`,
      current_period_end: end,
      asaas_payment_id: paymentId,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
}

function mapSubStatus(s: string): string {
  if (s === 'ACTIVE') return 'active'
  if (s === 'OVERDUE' || s === 'INACTIVE' || s === 'INACTIVATED') return 'past_due'
  if (s === 'CANCELED' || s === 'EXPIRED' || s === 'DELETED') return 'canceled'
  return s.toLowerCase()
}

Deno.serve(async (req) => {
  // Asaas envia token no header `asaas-access-token` (não no body).
  const token = req.headers.get('asaas-access-token') ?? ''
  if (!TOKEN) {
    return new Response('webhook não configurado', { status: 500 })
  }
  if (token !== TOKEN) {
    return new Response('token inválido', { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as AsaasWebhookBody | null
  if (!body?.event) return new Response('payload inválido', { status: 400 })

  const evtId = body.id ?? `${body.event}-${body.payment?.id ?? body.subscription?.id ?? Math.random()}`
  if (!(await claimEvent(evtId))) return new Response('ok (dup)', { status: 200 })

  try {
    switch (body.event) {
      // ───── PIX / pagamento avulso ─────────────────────────────────────────
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED': {
        const p = body.payment
        if (!p) break
        // Caso especial: este pagamento é de uma assinatura (renovação)? Caímos no
        // caminho de subscription mais abaixo. Aqui só tratamos PIX avulso.
        if (p.subscription) {
          // Renovação de cartão recorrente: estende o período pelo ciclo da assinatura.
          const ref = await findSubRef({
            externalReference: undefined,
            customer: p.customer,
            asaasSubscriptionId: p.subscription
          })
          if (!ref) break
          const { data: cur } = await admin
            .from('subscriptions')
            .select('current_period_end, price_id')
            .eq(ref.column, ref.value)
            .maybeSingle()
          const days = /yearly/i.test(cur?.price_id ?? '') ? 365 : 30
          const now = Date.now()
          const existing = cur?.current_period_end ? new Date(cur.current_period_end).getTime() : 0
          const base = Math.max(now, existing)
          const end = new Date(base + days * 86400000).toISOString()
          await admin
            .from('subscriptions')
            .update({ status: 'active', current_period_end: end, asaas_payment_id: p.id, updated_at: new Date().toISOString() })
            .eq(ref.column, ref.value)
          await notifyOwner(
            `🔄 Renovação Asaas — R$ ${p.value.toFixed(2).replace('.', ',')}`,
            `<p>Payment <b>${p.id}</b> da subscription <b>${p.subscription}</b> recebido. +${days}d.</p>`
          )
          break
        }
        const userId = externalRefUserId(p.externalReference)
        if (!userId) break
        if (p.status === 'RECEIVED' || p.status === 'CONFIRMED') {
          await grantPixDays(userId, p.id, p.externalReference)
          await notifyOwner(
            `💰 Novo pagamento PIX — R$ ${p.value.toFixed(2).replace('.', ',')}`,
            `<p>Pagamento Asaas <b>${p.id}</b> confirmado. Valor: R$ ${p.value.toFixed(2)}.</p>`
          )
        }
        break
      }

      case 'PAYMENT_OVERDUE':
      case 'PAYMENT_DELETED':
      case 'PAYMENT_REFUND_DENIED': {
        await logEvent(`${body.event} (sem efeito)`, body)
        break
      }

      case 'PAYMENT_REFUNDED':
      case 'PAYMENT_PARTIALLY_REFUNDED':
      case 'PAYMENT_CHARGEBACK_REQUESTED':
      case 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL': {
        const p = body.payment
        if (!p) break
        const ref = await findSubRef({
          externalReference: p.externalReference,
          customer: p.customer,
          asaasSubscriptionId: p.subscription
        })
        if (!ref) break
        await admin
          .from('subscriptions')
          .update({
            status: 'canceled',
            current_period_end: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq(ref.column, ref.value)
        await notifyOwner(
          `⛔ Asaas: ${body.event} — R$ ${p.value.toFixed(2).replace('.', ',')}`,
          `<p>Pagamento <b>${p.id}</b> ${humanEvent(body.event)}. Acesso bloqueado.</p>`
        )
        break
      }

      case 'PAYMENT_CHARGEBACK_DISPUTE': {
        // Disputa aberta após contestação — aguarda decisão do adquirente.
        await logEvent('CHARGEBACK em disputa', body)
        break
      }

      // ───── Assinatura (cartão recorrente) ────────────────────────────────
      case 'SUBSCRIPTION_CREATED':
      case 'SUBSCRIPTION_UPDATED': {
        const s = body.subscription
        if (!s) break
        const ref = await findSubRef({
          externalReference: s.externalReference,
          customer: s.customer,
          asaasSubscriptionId: s.id
        })
        if (!ref) break
        const status = mapSubStatus(s.status)
        const patch: Record<string, unknown> = {
          asaas_subscription_id: s.id,
          status,
          price_id: `asaas_${(s.cycle ?? 'MONTHLY').toLowerCase()}`,
          updated_at: new Date().toISOString()
        }
        if (s.nextDueDate) {
          patch.current_period_end = new Date(s.nextDueDate + 'T23:59:59-03:00').toISOString()
        }
        if (s.customer) patch.asaas_customer_id = s.customer
        await admin.from('subscriptions').update(patch).eq(ref.column, ref.value)
        if (body.event === 'SUBSCRIPTION_CREATED' && status === 'active') {
          await notifyOwner(
            `💳 Nova assinatura cartão — R$ ${(s.value ?? 0).toFixed(2).replace('.', ',')}`,
            `<p>Subscription Asaas <b>${s.id}</b> criada. Ciclo ${s.cycle}.</p>`
          )
        }
        break
      }

      case 'SUBSCRIPTION_INACTIVATED': {
        const s = body.subscription
        if (!s) break
        const ref = await findSubRef({
          externalReference: s.externalReference,
          customer: s.customer,
          asaasSubscriptionId: s.id
        })
        if (!ref) break
        await admin
          .from('subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq(ref.column, ref.value)
        await notifyOwner(
          `⚠️ Assinatura inativada`,
          `<p>Subscription Asaas <b>${s.id}</b> foi inativada. Status local: past_due.</p>`
        )
        break
      }

      case 'SUBSCRIPTION_DELETED': {
        const s = body.subscription
        if (!s) break
        const ref = await findSubRef({
          externalReference: s.externalReference,
          customer: s.customer,
          asaasSubscriptionId: s.id
        })
        if (!ref) break
        await admin
          .from('subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq(ref.column, ref.value)
        await logEvent('SUBSCRIPTION_DELETED', body)
        break
      }

      // ───── Demais eventos: só log ─────────────────────────────────────────
      default: {
        await logEvent('não tratado', body)
        break
      }
    }

    return new Response('ok', { status: 200 })
  } catch (e) {
    if (e instanceof AsaasError) {
      return new Response(`erro Asaas: ${e.message}`, { status: 500 })
    }
    return new Response(`erro: ${(e as Error).message}`, { status: 500 })
  }
})

function humanEvent(e: string): string {
  switch (e) {
    case 'PAYMENT_REFUNDED': return 'estornado'
    case 'PAYMENT_PARTIALLY_REFUNDED': return 'parcialmente estornado'
    case 'PAYMENT_CHARGEBACK_REQUESTED': return 'em chargeback'
    case 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL': return 'com chargeback perdido'
    default: return e.toLowerCase()
  }
}
