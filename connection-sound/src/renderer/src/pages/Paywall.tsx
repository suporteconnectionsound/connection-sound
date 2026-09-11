import { useEffect, useRef, useState } from 'react'
import {
  IconCheck,
  IconLoader2,
  IconRefresh,
  IconLogout,
  IconX,
  IconCreditCard,
  IconBrandGoogle,
  IconCopy,
  IconClock
} from '@tabler/icons-react'
import { useAuth } from '@/lib/auth'
import {
  startPix,
  startCard,
  openCardCheckout,
  checkPayment,
  type PixData,
  type PayMethod
} from '@/lib/billing'

interface Props {
  // Quando vem de dentro do app (durante o teste), o paywall é um overlay fechável.
  onClose?: () => void
}

function fmtCountdown(target: string | null): string {
  if (!target) return '—'
  const ms = new Date(target).getTime() - Date.now()
  if (ms <= 0) return 'expirado'
  const min = Math.floor(ms / 60000)
  const sec = Math.floor((ms % 60000) / 1000)
  return `${min}:${String(sec).padStart(2, '0')}`
}

export function Paywall({ onClose }: Props): JSX.Element {
  const { signOut, refresh, user } = useAuth()
  const [busy, setBusy] = useState<string | null>(null)
  const [method, setMethod] = useState<PayMethod>('card')
  const [msg, setMsg] = useState('')
  // PIX em andamento (mostra QR e faz polling)
  const [pix, setPix] = useState<PixData | null>(null)
  const [pixStatus, setPixStatus] = useState<'pending' | 'received' | 'expired' | 'error'>('pending')
  const [now, setNow] = useState(Date.now())
  const pollRef = useRef<number | null>(null)
  const tickRef = useRef<number | null>(null)

  // Tick do cronômetro do PIX
  useEffect(() => {
    if (!pix) return
    tickRef.current = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current)
    }
  }, [pix])

  // Polling do status do PIX (a cada 5s, até 5 min)
  useEffect(() => {
    if (!pix || pixStatus !== 'pending') return
    let tries = 0
    const tick = async (): Promise<void> => {
      tries++
      const r = await checkPayment(pix.paymentId)
      if (r?.status === 'RECEIVED' || r?.status === 'CONFIRMED') {
        setPixStatus('received')
        await refresh()
        setMsg('✅ Pagamento confirmado! Liberando seu acesso…')
        if (pollRef.current) {
          window.clearInterval(pollRef.current)
          pollRef.current = null
        }
        // Overlay (durante o teste): fecha sozinho.
        onClose?.()
        return
      }
      // Limite: 5 min (60 tentativas × 5s)
      if (tries >= 60) {
        setPixStatus('expired')
        if (pollRef.current) {
          window.clearInterval(pollRef.current)
          pollRef.current = null
        }
      }
    }
    pollRef.current = window.setInterval(() => void tick(), 5000)
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [pix, pixStatus, refresh, onClose])

  async function handlePix(plan: 'month' | 'year'): Promise<void> {
    if (busy) return
    setBusy(plan)
    setMsg('')
    setPixStatus('pending')
    const r = await startPix(plan)
    if (!r) {
      setMsg('Não consegui gerar o PIX agora. Tente de novo em instantes.')
      setBusy(null)
      return
    }
    setPix(r)
    setBusy(null)
  }

  async function handleCard(plan: 'month' | 'year'): Promise<void> {
    if (busy) return
    setBusy(plan)
    setMsg('')
    const r = await startCard(plan)
    if (!r) {
      setMsg('Não consegui abrir o checkout agora. Tente de novo em instantes.')
      setBusy(null)
      return
    }
    const result = await openCardCheckout(r.checkoutUrl)
    if (result === 'success') {
      setMsg('✅ Pagamento confirmado! Ativando sua assinatura…')
      for (let i = 0; i < 6; i++) {
        await new Promise((res) => setTimeout(res, 1500))
        await refresh()
      }
      onClose?.()
    } else if (result === 'cancel' || result === 'closed') {
      setMsg('Checkout fechado antes de concluir. Sem cobrança feita.')
    } else {
      setMsg('Não consegui abrir o checkout agora. Tente de novo em instantes.')
    }
    setBusy(null)
  }

  function copyBrCode(): void {
    if (!pix?.brCode) return
    void navigator.clipboard.writeText(pix.brCode)
    setMsg('Código PIX copiado!')
  }

  function fecharPix(): void {
    if (pollRef.current) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
    setPix(null)
    setPixStatus('pending')
    setMsg('')
  }

  const isPixMethod = method === 'pix'

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
        <button className={'pwmtab' + (method === 'pix' ? ' on' : '')} onClick={() => setMethod('pix')}>
          <IconBrandGoogle size={16} /> PIX
          <span>à vista, sem renovação</span>
        </button>
      </div>

      {pix ? (
        <div className="pixbox">
          <div className="pixtitle">
            {pixStatus === 'received' ? '✅ Pagamento confirmado!' : 'Escaneie o QR Code para pagar'}
          </div>
          {pix.qrCodeBase64 && (
            <img
              className="pixqr"
              src={`data:image/png;base64,${pix.qrCodeBase64}`}
              alt="QR Code do PIX"
              width={200}
              height={200}
            />
          )}
          {pixStatus === 'pending' && (
            <div className="pixtimer">
              <IconClock size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              Expira em {fmtCountdown(pix.expiresAt ?? new Date(Date.now() + 24 * 3600 * 1000).toISOString())}
            </div>
          )}
          {pixStatus === 'expired' && (
            <div className="authmsg err">PIX expirado. Clique em "Fechar" e tente de novo.</div>
          )}
          {pixStatus === 'received' && (
            <div className="authmsg ok">Acesso liberado! Já pode fechar e voltar ao app.</div>
          )}
          <div className="pixcopy">
            <code>{pix.brCode}</code>
            <button className="dzbtn" onClick={copyBrCode}>
              <IconCopy size={14} /> Copiar código
            </button>
          </div>
          <button className="pwbtn" onClick={fecharPix}>
            Fechar
          </button>
        </div>
      ) : (
        <>
          <div className="pwplans">
            <div className="pwplan">
              <div className="pwname">{isPixMethod ? '30 dias' : 'Mensal'}</div>
              <div className="pwprice">
                R$ 19,99<span>{isPixMethod ? '/30 dias' : '/mês'}</span>
              </div>
              <button
                className="pwbtn"
                onClick={() => (isPixMethod ? handlePix('month') : handleCard('month'))}
                disabled={!!busy}
              >
                {busy === 'month' ? (
                  <IconLoader2 size={16} className="spin" />
                ) : isPixMethod ? (
                  'Pagar com PIX'
                ) : (
                  'Assinar mensal'
                )}
              </button>
            </div>
            <div className="pwplan featured">
              <div className="pwbadge">Melhor valor · 50% off</div>
              <div className="pwname">{isPixMethod ? '1 ano' : 'Anual'}</div>
              <div className="pwprice">
                R$ 119,99<span>/ano</span>
              </div>
              <button
                className="pwbtn primary"
                onClick={() => (isPixMethod ? handlePix('year') : handleCard('year'))}
                disabled={!!busy}
              >
                {busy === 'year' ? (
                  <IconLoader2 size={16} className="spin" />
                ) : isPixMethod ? (
                  'Pagar com PIX'
                ) : (
                  'Assinar anual'
                )}
              </button>
            </div>
          </div>
        </>
      )}

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

      {isPixMethod && !pix && (
        <div className="pwnote">
          O PIX é confirmado em segundos. Assim que o pagamento cair, o acesso é liberado automaticamente.
        </div>
      )}

      {msg && !pix && (
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
