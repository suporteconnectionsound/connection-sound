// E-mails automáticos da jornada (boas-vindas, trial vencendo/vencido, win-back).
// Disparado pelo cron (pg_cron + pg_net) de hora em hora. Protegido por x-cron-secret.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const RESEND = Deno.env.get('RESEND_API_KEY') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const OWNER_EMAIL = Deno.env.get('OWNER_NOTIFY_EMAIL') ?? 'davidlindoso43@gmail.com'
const LOGO = Deno.env.get('BRAND_LOGO_URL') ?? 'https://uirwbnwvutvqdpcevjge.supabase.co/storage/v1/object/public/brand/logo.png'
// Antes: links Stripe (PAY_LINK_MONTHLY/YEARLY). Agora o Asaas gera o checkout
// dentro do app — basta apontar para a landing page onde o usuário baixa o app e
// o Paywall aparece com as opções PIX/Cartão.
const PAY_MONTHLY = Deno.env.get('PAY_LINK_MONTHLY') ?? 'https://connectionsound.com/?pay=month'
const PAY_YEARLY = Deno.env.get('PAY_LINK_YEARLY') ?? 'https://connectionsound.com/?pay=year'
const SUPORTE_WHATS = 'https://wa.me/5561992437695'
const SUPORTE_MAIL = 'suporteconnectionsound@gmail.com'

type Kind = 'welcome' | 'trial_expiring' | 'trial_expired' | 'winback'
interface Row {
  user_id: string
  email: string
  full_name: string | null
  kind: Kind
}

function payLink(base: string, uid: string, email: string): string {
  const q = `prefilled_email=${encodeURIComponent(email)}&client_reference_id=${encodeURIComponent(uid)}`
  return base.includes('?') ? `${base}&${q}` : `${base}?${q}`
}

// ---- Design da marca (escuro/premium, inline, compatível com Outlook/Gmail) ----
function button(href: string, label: string, sub?: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr><td style="border-radius:12px;background:#f25312;background:linear-gradient(135deg,#ff9248,#f25312);box-shadow:0 10px 24px rgba(242,83,18,.35)">
    <a href="${href}" target="_blank" style="display:block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#1a0e04;text-decoration:none;border-radius:12px">
      ${label}${sub ? `<span style="display:block;font-size:11px;font-weight:normal;color:#3a1c08;margin-top:2px">${sub}</span>` : ''}
    </a>
  </td></tr></table>`
}

function shell(preheader: string, inner: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#07070b">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07070b;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#111118;border:1px solid #23232e;border-radius:18px;overflow:hidden">
        <tr><td style="padding:26px 30px 18px;border-bottom:1px solid #1d1d27">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:11px"><img src="${LOGO}" width="40" height="40" alt="Connection Sound" style="display:block;border-radius:10px"></td>
            <td style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#ffffff;letter-spacing:.2px">Connection&nbsp;Sound</td>
          </tr></table>
        </td></tr>
        <tr><td style="height:3px;background:linear-gradient(90deg,#ff9248,#f25312,#111118)"></td></tr>
        <tr><td style="padding:30px 34px 22px;font-family:Arial,Helvetica,sans-serif;color:#c9c9d4;font-size:15px;line-height:1.6">
          ${inner}
        </td></tr>
        <tr><td style="padding:20px 34px 28px;border-top:1px solid #1d1d27;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#73737f;line-height:1.6">
          Precisa de ajuda? Fale com a gente no
          <a href="${SUPORTE_WHATS}" target="_blank" style="color:#ff9248;text-decoration:none">WhatsApp</a>
          ou em <a href="mailto:${SUPORTE_MAIL}" style="color:#ff9248;text-decoration:none">${SUPORTE_MAIL}</a>.<br>
          © Connection Sound · Você recebe este e-mail porque criou uma conta no app.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function h1(t: string): string {
  return `<h1 style="margin:0 0 14px;font-size:23px;line-height:1.25;color:#ffffff;font-weight:bold">${t}</h1>`
}
function plans(uid: string, email: string): string {
  return `
  <div style="margin:22px 0 6px">${button(payLink(PAY_YEARLY, uid, email), 'Assinar Anual — R$ 119,99/ano', 'menos de R$ 10/mês · 2 meses grátis')}</div>
  <div style="margin:12px 0 4px;text-align:center">
    <a href="${payLink(PAY_MONTHLY, uid, email)}" target="_blank" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#a6a6b3;text-decoration:underline">ou assinar Mensal — R$ 19,99/mês</a>
  </div>`
}

function render(r: Row): { subject: string; html: string } {
  const name = (r.full_name ?? '').trim().split(' ')[0]
  const oi = name ? `Oi, ${name}!` : 'Oi!'
  const features = `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 4px;color:#c9c9d4;font-size:14px;line-height:1.9">
    <tr><td style="padding-right:9px;color:#ff9248">●</td><td>Baixar músicas e vídeos do YouTube, Spotify, links ou por nome — MP3/MP4 na qualidade que quiser</td></tr>
    <tr><td style="padding-right:9px;color:#ff9248">●</td><td>Playlists inteiras viram pastas organizadas, baixando em paralelo</td></tr>
    <tr><td style="padding-right:9px;color:#ff9248">●</td><td>Remover fundo com IA, converter, comprimir e criar slideshow das suas fotos</td></tr>
  </table>`

  switch (r.kind) {
    case 'welcome':
      return {
        subject: 'Bem-vindo ao Connection Sound 🎧 seu teste de 3 dias começou',
        html: shell('Seu teste grátis de 3 dias começou — explore tudo!', `
          ${h1(`${oi} Bem-vindo ao Connection Sound.`)}
          <p style="margin:0 0 6px">Seu <b style="color:#fff">teste grátis de 3 dias</b> começou agora. Aproveite para usar tudo, sem limites:</p>
          ${features}
          <p style="margin:14px 0 0">Quando quiser garantir acesso contínuo, é só assinar — leva menos de um minuto:</p>
          ${plans(r.user_id, r.email)}`)
      }
    case 'trial_expiring':
      return {
        subject: '⏳ Seu teste do Connection Sound termina amanhã',
        html: shell('Falta pouco para seu teste acabar — assine e não perca o acesso.', `
          ${h1(`${oi} Seu teste está acabando.`)}
          <p style="margin:0 0 6px">Falta pouco para o fim do seu período grátis. Para continuar baixando músicas, vídeos e usando as ferramentas sem interrupção, garanta sua assinatura:</p>
          ${plans(r.user_id, r.email)}
          <p style="margin:20px 0 0;font-size:13px;color:#8a8a96">Cancele quando quiser, direto no app.</p>`)
      }
    case 'trial_expired':
      return {
        subject: 'Seu teste acabou — reative o Connection Sound em 1 minuto',
        html: shell('Seu teste terminou. Reative agora e volte a baixar tudo.', `
          ${h1(`${oi} Seu teste terminou.`)}
          <p style="margin:0 0 6px">Esperamos que tenha curtido! Para voltar a usar todas as ferramentas, é só assinar — sua conta e tudo continuam aqui te esperando:</p>
          ${plans(r.user_id, r.email)}`)
      }
    case 'winback':
      return {
        subject: 'Sentimos sua falta 🎧 condições pra voltar ao Connection Sound',
        html: shell('Volte ao Connection Sound — está tudo aqui te esperando.', `
          ${h1(`${oi} A gente sentiu sua falta.`)}
          <p style="margin:0 0 6px">O Connection Sound continua evoluindo — downloads rápidos, playlists organizadas e ferramentas de mídia com IA. Que tal voltar?</p>
          ${features}
          <p style="margin:14px 0 0">No checkout dá pra aplicar cupom de desconto, se você tiver um:</p>
          ${plans(r.user_id, r.email)}`)
      }
  }
}

// Avisa o dono quando um cliente novo se cadastra (junto do e-mail de boas-vindas).
async function notifyOwnerSignup(name: string | null, email: string): Promise<void> {
  if (!RESEND) return
  const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const html = `<!doctype html><html><body style="margin:0;background:#07070b;padding:24px;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#111118;border:1px solid #23232e;border-radius:16px;overflow:hidden">
      <tr><td style="height:4px;background:linear-gradient(90deg,#ff9248,#f25312,#111118)"></td></tr>
      <tr><td style="padding:26px 30px;color:#e6e6ee">
        <div style="font-size:13px;color:#ff9248;font-weight:bold;letter-spacing:.3px">CONNECTION SOUND</div>
        <h1 style="margin:8px 0 16px;font-size:22px;color:#fff">👤 Novo cadastro</h1>
        <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.9;color:#c9c9d4">
          <tr><td style="color:#8a8a96;padding-right:14px">Cliente</td><td style="color:#fff">${name ? name + ' · ' : ''}${email}</td></tr>
          <tr><td style="color:#8a8a96;padding-right:14px">Status</td><td style="color:#fff">Iniciou o teste grátis de 3 dias</td></tr>
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
        subject: `👤 Novo cadastro — ${email}`,
        html
      })
    })
  } catch {
    /* best-effort: não interrompe o envio dos e-mails */
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Connection Sound <noreply@connectionsound.com>',
      reply_to: SUPORTE_MAIL,
      to: [to],
      subject,
      html
    })
  })
  if (!r.ok) console.error('resend', r.status, await r.text())
  return r.ok
}

Deno.serve(async (req) => {
  // Proteção: só roda com o segredo do cron (ou chamada manual com o mesmo header).
  const secret = req.headers.get('x-cron-secret') ?? new URL(req.url).searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) return new Response('unauthorized', { status: 401 })

  const url = new URL(req.url)

  // Preview: envia um modelo específico para um e-mail, sem afetar a jornada real.
  const previewTo = url.searchParams.get('to')
  const previewKind = url.searchParams.get('kind') as Kind | null
  if (previewTo && previewKind) {
    const { subject, html } = render({
      user_id: '00000000-0000-0000-0000-000000000000',
      email: previewTo,
      full_name: 'David',
      kind: previewKind
    })
    const ok = await sendEmail(previewTo, `[Preview] ${subject}`, html)
    return new Response(JSON.stringify({ preview: previewKind, to: previewTo, ok }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const dry = url.searchParams.get('dry') === '1'
  const { data, error } = await admin.rpc('users_needing_email')
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const rows = (data ?? []) as Row[]
  let sent = 0
  const results: Record<string, number> = {}
  for (const r of rows) {
    if (!r.email) continue
    const { subject, html } = render(r)
    if (dry) {
      results[r.kind] = (results[r.kind] ?? 0) + 1
      continue
    }
    const ok = await sendEmail(r.email, subject, html)
    if (ok) {
      await admin.from('email_events').upsert({ user_id: r.user_id, kind: r.kind }, { onConflict: 'user_id,kind' })
      sent++
      results[r.kind] = (results[r.kind] ?? 0) + 1
      // Cadastro novo (boas-vindas enviada uma única vez) → avisa o dono.
      if (r.kind === 'welcome') await notifyOwnerSignup(r.full_name, r.email)
    }
  }
  return new Response(JSON.stringify({ candidates: rows.length, sent, dry, byKind: results }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
