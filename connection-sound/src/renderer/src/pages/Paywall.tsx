import { useState } from 'react'
import { IconCheck, IconLoader2, IconRefresh, IconLogout } from '@tabler/icons-react'
import { useAuth } from '@/lib/auth'
import { startCheckout } from '@/lib/billing'

export function Paywall(): JSX.Element {
  const { signOut, refresh, user } = useAuth()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function assinar(plan: 'month' | 'year'): Promise<void> {
    setBusy(plan)
    setMsg('')
    const r = await startCheckout(plan)
    if (r === 'success') {
      setMsg('Pagamento recebido! Ativando sua assinatura…')
      for (let i = 0; i < 6; i++) {
        await new Promise((res) => setTimeout(res, 1500))
        await refresh()
      }
    } else if (r === 'error') {
      setMsg('Não consegui abrir o checkout agora. Tente de novo em instantes.')
    }
    setBusy(null)
  }

  return (
    <div className="paywall">
      <div className="pwhead">
        <h1>Seu teste grátis terminou</h1>
        <p>Assine o Connection Sound Pro pra continuar baixando músicas, removendo fundo, slideshow e tudo mais.</p>
      </div>

      <div className="pwplans">
        <div className="pwplan">
          <div className="pwname">Mensal</div>
          <div className="pwprice">
            R$ 19,99<span>/mês</span>
          </div>
          <button className="pwbtn" onClick={() => assinar('month')} disabled={!!busy}>
            {busy === 'month' ? <IconLoader2 size={16} className="spin" /> : 'Assinar mensal'}
          </button>
        </div>
        <div className="pwplan featured">
          <div className="pwbadge">Melhor valor · 50% off</div>
          <div className="pwname">Anual</div>
          <div className="pwprice">
            R$ 119,99<span>/ano</span>
          </div>
          <button className="pwbtn primary" onClick={() => assinar('year')} disabled={!!busy}>
            {busy === 'year' ? <IconLoader2 size={16} className="spin" /> : 'Assinar anual'}
          </button>
        </div>
      </div>

      <ul className="pwfeatures">
        <li>
          <IconCheck size={15} /> Downloads ilimitados — Spotify, YouTube, playlists
        </li>
        <li>
          <IconCheck size={15} /> Coreografia, remover fundo, conversor, compressor, slideshow
        </li>
        <li>
          <IconCheck size={15} /> Atualizações e suporte da marca
        </li>
      </ul>

      {msg && <div className="authmsg info" style={{ maxWidth: 460 }}>{msg}</div>}

      <div className="pwfoot">
        <span onClick={refresh}>
          <IconRefresh size={14} /> Já assinei — atualizar
        </span>
        <span onClick={signOut}>
          <IconLogout size={14} /> Sair ({user?.email})
        </span>
      </div>
    </div>
  )
}
