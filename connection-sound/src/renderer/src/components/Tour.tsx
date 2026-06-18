import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { IconArrowRight, IconArrowLeft, IconX, IconSparkles, IconCheck } from '@tabler/icons-react'
import type { PageId } from '@/lib/pages'

type Placement = 'top' | 'bottom' | 'left' | 'right' | 'auto' | 'center'

interface Step {
  page?: PageId
  selector?: string
  title: string
  body: string
  placement?: Placement
}

// Guia visual de primeiro uso. NÃO executa nada de verdade — só destaca e explica.
const STEPS: Step[] = [
  {
    title: 'Bem-vindo ao Connection Sound 🎧',
    body: 'Em menos de um minuto eu te mostro tudo que dá pra fazer aqui. Pode pular quando quiser.',
    placement: 'center'
  },
  {
    page: 'downloads',
    selector: '[data-id="downloads"]',
    title: 'Este é o menu',
    body: 'Todas as ferramentas ficam aqui na lateral. Vou passar por cada uma com você.',
    placement: 'right'
  },
  {
    page: 'downloads',
    selector: '.search',
    title: 'Baixar música e vídeo',
    body: 'Cole um link do Spotify ou do YouTube — ou só digite o nome da música. Playlists inteiras também funcionam.',
    placement: 'bottom'
  },
  {
    page: 'downloads',
    selector: '.opts',
    title: 'Formato e qualidade',
    body: 'Escolha MP3 (áudio) ou MP4 (vídeo) e a qualidade. No MP4 dá pra pegar a versão oficial ou de coreografia.',
    placement: 'bottom'
  },
  {
    page: 'downloads',
    selector: '.btn-dl',
    title: 'É só clicar em Baixar',
    body: 'Dá pra enfileirar vários ao mesmo tempo sem travar. O progresso de cada um aparece logo abaixo.',
    placement: 'left'
  },
  {
    page: 'bg',
    selector: '.dropzone',
    title: 'Remover fundo',
    body: 'Arraste uma imagem (ou um .zip) aqui. A IA roda no seu PC e recorta o fundo — sem internet e sem marca d’água. Tem modo Pessoa e modo Objeto/Logo.',
    placement: 'auto'
  },
  {
    page: 'conv',
    selector: '.dropzone',
    title: 'Conversor de formatos',
    body: 'Arraste áudio, vídeo ou imagem e converta entre MP3, MP4, WAV, FLAC, PNG, JPG e mais.',
    placement: 'auto'
  },
  {
    page: 'comp',
    selector: '.dropzone',
    title: 'Compressor inteligente',
    body: 'Reduz o tamanho dos arquivos — imperceptível em vídeo e sem perda em imagem. Ele mostra o antes → depois.',
    placement: 'auto'
  },
  {
    page: 'slide',
    selector: '.dropzone',
    title: 'Slideshow',
    body: 'Transforma suas fotos num vídeo com a foto centralizada e fundo desfocado dela mesma. Você escolhe a resolução.',
    placement: 'auto'
  },
  {
    page: 'set',
    selector: '.setcard',
    title: 'Configurações',
    body: 'Troque a pasta onde tudo é salvo e confira o status das ferramentas. Tudo (yt-dlp, FFmpeg) já vem embutido.',
    placement: 'auto'
  },
  {
    selector: '.account',
    title: 'Seu teste grátis',
    body: 'Aqui você acompanha os dias do teste. Quando quiser, assine o Pro pra continuar com tudo liberado.',
    placement: 'top'
  },
  {
    title: 'Pronto pra começar! 🚀',
    body: 'Explore à vontade. Se precisar de ajuda, o Suporte está no menu. Bom proveito!',
    placement: 'center'
  }
]

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

interface Props {
  currentPage: PageId
  onNavigate: (id: PageId) => void
  onClose: () => void
}

const PAD = 8
const CARD_W = 340

export function Tour({ currentPage, onNavigate, onClose }: Props): JSX.Element {
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardH, setCardH] = useState(190)

  const step = STEPS[idx]
  const last = idx === STEPS.length - 1

  // Mede o elemento-alvo do passo atual (com retentativas, esperando a navegação/render).
  const measure = useCallback((selector?: string) => {
    if (!selector) {
      setRect(null)
      return () => {}
    }
    let tries = 0
    let timer: ReturnType<typeof setTimeout>
    let stopped = false
    const tick = (): void => {
      if (stopped) return
      const el = document.querySelector(selector)
      if (el) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
          return
        }
      }
      if (tries++ < 14) timer = setTimeout(tick, 90)
      else setRect(null)
    }
    tick()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (step.page && step.page !== currentPage) onNavigate(step.page)
    // espera o render/transição da página antes de medir
    const delay = step.page && step.page !== currentPage ? 300 : 60
    let cleanup = (): void => {}
    const t = setTimeout(() => {
      cleanup = measure(step.selector)
    }, delay)
    return () => {
      clearTimeout(t)
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx])

  // Recalcula em redimensionamento.
  useEffect(() => {
    const onResize = (): void => {
      if (step.selector) measure(step.selector)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [step.selector, measure])

  // Teclado: Esc pula, Enter/→ avança, ← volta.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx])

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight)
  }, [idx, rect])

  function next(): void {
    if (last) onClose()
    else setIdx((i) => Math.min(STEPS.length - 1, i + 1))
  }
  function prev(): void {
    setIdx((i) => Math.max(0, i - 1))
  }

  const placement: Placement = step.placement ?? 'auto'
  const card = cardPosition(rect, placement, cardH)
  const spot = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null

  return (
    <div className="tour-root">
      {/* captura cliques pra nada acontecer por baixo (guia só visual) */}
      <div className="tour-catch" style={{ background: spot ? 'transparent' : 'rgba(7,7,9,.82)' }} />

      {spot && (
        <div
          className="tour-spot"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
        />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          ref={cardRef}
          className={'tour-card' + (card.place === 'center' ? ' center' : '')}
          style={{ top: card.top, left: card.left, width: CARD_W }}
          initial={{ opacity: 0, scale: 0.96, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <div className="tour-card-head">
            <span className="tour-badge">
              <IconSparkles size={13} /> Guia rápido
            </span>
            <button className="tour-skip" onClick={onClose} title="Pular guia">
              Pular <IconX size={13} />
            </button>
          </div>

          <h3 className="tour-title">{step.title}</h3>
          <p className="tour-body">{step.body}</p>

          <div className="tour-foot">
            <div className="tour-dots">
              {STEPS.map((_, i) => (
                <i key={i} className={i === idx ? 'on' : i < idx ? 'done' : ''} />
              ))}
            </div>
            <div className="tour-btns">
              {idx > 0 && (
                <button className="tour-btn ghost" onClick={prev}>
                  <IconArrowLeft size={15} /> Voltar
                </button>
              )}
              <button className="tour-btn primary" onClick={next}>
                {last ? (
                  <>
                    Começar <IconCheck size={15} />
                  </>
                ) : (
                  <>
                    Próximo <IconArrowRight size={15} />
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="tour-step">
            {idx + 1} de {STEPS.length}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// Calcula a posição do card a partir do alvo + lado preferido, fixando dentro da tela.
function cardPosition(
  rect: Rect | null,
  placement: Placement,
  cardH: number
): { top: number; left: number; place: Placement } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const gap = 14
  const pad = 14

  if (!rect || placement === 'center') {
    return { top: vh / 2 - cardH / 2, left: vw / 2 - CARD_W / 2, place: 'center' }
  }

  let place = placement
  if (place === 'auto') {
    const right = vw - (rect.left + rect.width)
    const left = rect.left
    const bottom = vh - (rect.top + rect.height)
    const top = rect.top
    const best = Math.max(right, left, bottom, top)
    place = best === right ? 'right' : best === left ? 'left' : best === bottom ? 'bottom' : 'top'
  }

  let top = 0
  let left = 0
  if (place === 'bottom') {
    top = rect.top + rect.height + gap
    left = rect.left + rect.width / 2 - CARD_W / 2
  } else if (place === 'top') {
    top = rect.top - cardH - gap
    left = rect.left + rect.width / 2 - CARD_W / 2
  } else if (place === 'right') {
    top = rect.top + rect.height / 2 - cardH / 2
    left = rect.left + rect.width + gap
  } else {
    // left
    top = rect.top + rect.height / 2 - cardH / 2
    left = rect.left - CARD_W - gap
  }

  // fixa dentro da viewport
  top = Math.max(pad, Math.min(top, vh - cardH - pad))
  left = Math.max(pad, Math.min(left, vw - CARD_W - pad))
  return { top, left, place }
}
