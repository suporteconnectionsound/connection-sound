import { useEffect, useState } from 'react'
import { IconRefresh, IconLoader2, IconCrown, IconBan, IconMail } from '@tabler/icons-react'
import { adminApi, type AdminStats, type AdminRow } from '@/lib/admin'

function money(v: number, currency: string): string {
  try {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: (currency || 'BRL').toUpperCase() })
  } catch {
    return 'R$ ' + v.toFixed(2)
  }
}
function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return d.getFullYear() > 2090 ? 'permanente' : d.toLocaleDateString('pt-BR')
}
function tipo(r: AdminRow): string {
  if (r.status === 'active' && r.paid) return 'Pago'
  if (r.status === 'active' && !r.paid) return 'Permanente/Manual'
  if (r.status === 'trialing') return 'Teste'
  if (r.status === 'past_due') return 'Atrasado'
  if (r.status === 'canceled') return 'Cancelado'
  return r.status
}

export function Admin(): JSX.Element {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [rows, setRows] = useState<AdminRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  const [grantEmail, setGrantEmail] = useState('')
  const [grantDays, setGrantDays] = useState('permanente')
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailMsg, setEmailMsg] = useState('')

  async function load(): Promise<void> {
    setLoading(true)
    try {
      const [s, l] = await Promise.all([adminApi.stats(), adminApi.list()])
      setStats(s)
      setRows(l.rows.sort((a, b) => (a.email ?? '').localeCompare(b.email ?? '')))
    } catch (e) {
      setMsg('Erro ao carregar: ' + ((e as Error).message ?? ''))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function doGrant(): Promise<void> {
    if (!grantEmail.trim()) return
    setBusy('grant')
    setMsg('')
    try {
      await adminApi.grant(grantEmail.trim(), grantDays === 'permanente' ? undefined : Number(grantDays))
      setMsg(`Acesso concedido a ${grantEmail}`)
      setGrantEmail('')
      await load()
    } catch (e) {
      setMsg('Erro: ' + ((e as Error).message ?? ''))
    } finally {
      setBusy('')
    }
  }
  async function doRevoke(email: string | null): Promise<void> {
    if (!email) return
    setBusy('revoke' + email)
    setMsg('')
    try {
      await adminApi.revoke(email)
      await load()
    } catch (e) {
      setMsg('Erro: ' + ((e as Error).message ?? ''))
    } finally {
      setBusy('')
    }
  }
  async function doEmail(): Promise<void> {
    if (!emailTo.trim() || !emailMsg.trim()) return
    setBusy('email')
    setMsg('')
    try {
      await adminApi.email(emailTo.trim(), emailSubject.trim() || 'Connection Sound', emailMsg.trim())
      setMsg(`E-mail enviado para ${emailTo}`)
      setEmailMsg('')
    } catch (e) {
      setMsg('Erro ao enviar: ' + ((e as Error).message ?? ''))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="adminpage">
      <div className="adminhead">
        <h2>Painel Admin</h2>
        <button className="tbtn" onClick={load}>
          <IconRefresh size={16} /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="adminloading">
          <IconLoader2 size={26} className="spin" />
        </div>
      ) : (
        <>
          <div className="adminstats">
            <Stat label="Faturamento" value={stats ? money(stats.revenue, stats.currency) : '—'} accent />
            <Stat label="Pagantes ativos" value={String(stats?.activePaid ?? 0)} />
            <Stat label="Permanentes" value={String(stats?.permanent ?? 0)} />
            <Stat label="Em teste" value={String(stats?.trialing ?? 0)} />
            <Stat label="Total de contas" value={String(stats?.totalAccounts ?? 0)} />
          </div>

          <div className="admincard">
            <h3>Conceder acesso</h3>
            <div className="adminrow">
              <input className="adminin" placeholder="e-mail do usuário" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} />
              <select className="tsel" value={grantDays} onChange={(e) => setGrantDays(e.target.value)}>
                <option value="permanente">Permanente</option>
                <option value="30">+30 dias</option>
                <option value="90">+90 dias</option>
                <option value="365">+365 dias</option>
              </select>
              <button className="adminbtn" onClick={doGrant} disabled={busy === 'grant'}>
                {busy === 'grant' ? <IconLoader2 size={15} className="spin" /> : <><IconCrown size={15} /> Conceder</>}
              </button>
            </div>
          </div>

          <div className="admincard">
            <h3>Assinaturas ({rows.length})</h3>
            <div className="admintable">
              <div className="adminth">
                <span>E-mail</span><span>Status</span><span>Tipo</span><span>Válido até</span><span></span>
              </div>
              {rows.map((r) => (
                <div className="admintr" key={r.user_id}>
                  <span className="amail" title={r.email ?? ''}>{r.email ?? '—'}</span>
                  <span><i className={'dot ' + r.status} /> {r.status}</span>
                  <span>{tipo(r)}</span>
                  <span>{fmtDate(r.current_period_end)}</span>
                  <span>
                    {r.status !== 'canceled' && (
                      <button className="amini" title="Revogar" onClick={() => doRevoke(r.email)} disabled={busy === 'revoke' + r.email}>
                        {busy === 'revoke' + r.email ? <IconLoader2 size={13} className="spin" /> : <IconBan size={13} />}
                      </button>
                    )}
                  </span>
                </div>
              ))}
              {rows.length === 0 && <div className="adminempty">Nenhuma assinatura ainda.</div>}
            </div>
          </div>

          <div className="admincard">
            <h3>Enviar e-mail (pela marca)</h3>
            <div className="adminrow">
              <input className="adminin" placeholder="para (e-mail)" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
              <input className="adminin" placeholder="assunto" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
            </div>
            <textarea className="adminta" placeholder="Escreva a mensagem…" value={emailMsg} onChange={(e) => setEmailMsg(e.target.value)} />
            <button className="adminbtn" onClick={doEmail} disabled={busy === 'email'}>
              {busy === 'email' ? <IconLoader2 size={15} className="spin" /> : <><IconMail size={15} /> Enviar</>}
            </button>
          </div>

          {msg && <div className="authmsg info" style={{ maxWidth: 560 }}>{msg}</div>}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }): JSX.Element {
  return (
    <div className={'astat' + (accent ? ' accent' : '')}>
      <div className="alabel">{label}</div>
      <div className="avalue">{value}</div>
    </div>
  )
}
