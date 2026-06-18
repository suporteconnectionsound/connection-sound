import { useState } from 'react'
import { IconCheck, IconLoader2, IconRefresh, IconLogout, IconX, IconCreditCard, IconBarcode } from '@tabler/icons-react'
import { useAuth } from '@/lib/auth'
import { startCheckout, type PayMethod } from '@/lib/billing'

interface Props {
  // Quando vem de dentro do app (durante o teste), o paywall é um overlay fechável.
  onClose?: () => void
}

export function Paywall({ onClose }: Props): JSX.Element {
  const { signOut, refresh, user } = useAuth()
  const [busy, setBusy] = useState<string | null>(null)
  const [method, setMethod] = useState<PayMethod>('card')
  const [msg, setMsg] = useState('')
  const isBoleto = method === 'boleto'

  async function assinar(plan: 'month' | 'year'): Promise<void> {
    if (busy) return
    setBusy(plan)
    setMsg('')
    const r = await startCheckout(plan, method)
    if (isBoleto) {
      // Boleto compensa em até 1 dia útil — o acesso é liberado pelo webhook depois.
      if (r === 'success' || r === 'closed') {
        setMsg(
          'Boleto gerado! Pague pelo app do seu banco. Assim que compensar (até 1 dia útil), seu acesso é liberado automaticamente. Também enviamos o boleto pro seu e-mail.'
        )
      } else if (r === 'error') {
        setMsg('Não consegui abrir o checkout agora. Tente de novo em instantes.')
      }
    } else if (r === 'success') {
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

  const content = (
    <div className="paywall">
      <div className="pwhead">
        <h1>{onClose ? 'Assine o Connection Sound Pro' : 'Seu teste grátis terminou'}</h1>
        <p>Continue baixando músicas, removendo fundo, slideshow e tudo mais — sem limites.</p>
      </div>

      {/* Forma de pagamento */}
      <div className="pwmethod">
        <button className={'pwmtab' + (method === 'card' ? ' on' : '')} onClick={() => setMethod('card')}>
          <IconCreditCard size={16} /> Cartão
          <span>renova automático</span>
        </button>
        <button className={'pwmtab' + (method === 'boleto' ? ' on' : '')} onClick={() => setMethod('boleto')}>
          <IconBarcode size={16} /> Boleto
          <span>à vista, sem renovação</span>
        </button>
      </div>

      <div className="pwplans">
        <div className="pwplan">
          <div className="pwname">{isBoleto ? '30 dias' : 'Mensal'}</div>
          <div className="pwprice">
            R$ 19,99<span>{isBoleto ? '/30 dias' : '/mês'}</span>
          </div>
          <button className="pwbtn" onClick={() => assinar('month')} disabled={!!busy}>
            {busy === 'month' ? (
              <IconLoader2 size={16} className="spin" />
            ) : isBoleto ? (
              'Pagar com Boleto'
            ) : (
              'Assinar mensal'
            )}
          </button>
        </div>
        <div className="pwplan featured">
          <div className="pwbadge">Melhor valor · 50% off</div>
          <div className="pwname">{isBoleto ? '1 ano' : 'Anual'}</div>
          <div className="pwprice">
            R$ 119,99<span>/ano</span>
          </div>
          <button className="pwbtn primary" onClick={() => assinar('year')} disabled={!!busy}>
            {busy === 'year' ? (
              <IconLoader2 size={16} className="spin" />
            ) : isBoleto ? (
              'Pagar com Boleto'
            ) : (
              'Assinar anual'
            )}
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

      {isBoleto && (
        <div className="pwnote">
          O boleto compensa em até 1 dia útil. Assim que o pagamento cair, o acesso é liberado automaticamente pelo
          período escolhido. Depois é só gerar outro pra renovar.
        </div>
      )}

      {msg && (
        <div className="authmsg info" style={{ maxWidth: 460 }}>
          {msg}
        </div>
      )}

      <div className="pwfoot">
        <span onClick={refresh}>
          <IconRefresh size={14} /> Já paguei — atualizar
        </span>
        {!onClose && (
          <span onClick={signOut}>
            <IconLogout size={14} /> Sair ({user?.email})
          </span>
        )}
      </div>
    </div>
  )

  if (onClose) {
    return (
      <div className="pwoverlay" onClick={onClose}>
        <div className="pwmodal" onClick={(e) => e.stopPropagation()}>
          <button className="pwclose" onClick={onClose} title="Fechar">
            <IconX size={18} />
          </button>
          {content}
        </div>
      </div>
    )
  }
  return content
}
