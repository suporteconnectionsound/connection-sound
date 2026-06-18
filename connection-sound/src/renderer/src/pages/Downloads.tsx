import { useEffect, useRef, useState } from 'react'
import {
  IconSearch,
  IconArrowDown,
  IconFolder,
  IconPlayerPause,
  IconPlayerPlay,
  IconX,
  IconAlertTriangle,
  IconRefresh,
  IconArrowsExchange,
  IconShieldCheck,
  IconLoader2,
  IconList,
  IconLayoutGrid,
  IconTrash,
  IconClipboard
} from '@tabler/icons-react'
import { Segmented } from '@/components/Segmented'
import { QualitySelect } from '@/components/QualitySelect'
import type { DlItem, DlEvent } from '@/lib/download'

const GRADS = [
  'linear-gradient(135deg,#6d28d9,#db2777)',
  'linear-gradient(135deg,#0ea5e9,#22d3ee)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#8b5cf6,#ec4899)',
  'linear-gradient(135deg,#f43f5e,#f59e0b)',
  'linear-gradient(135deg,#3b82f6,#6366f1)'
]
function gradFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return GRADS[Math.abs(h) % GRADS.length]
}

interface Props {
  onToast: (name: string) => void
}

export function Downloads({ onToast }: Props): JSX.Element {
  const [items, setItems] = useState<DlItem[]>([])
  const [query, setQuery] = useState('')
  const [fmt, setFmt] = useState('mp3')
  const [choreo, setChoreo] = useState('of')
  const [qMp3, setQMp3] = useState('320 kbps')
  const [qMp4, setQMp4] = useState('1080p')
  const [tab, setTab] = useState<'run' | 'done'>('run')
  const [busy, setBusy] = useState(false)
  const [dir, setDir] = useState('')
  const seen = useRef<Set<string>>(new Set())

  useEffect(() => {
    const off = window.cs.download.onEvent((p: DlEvent) => {
      if (p.type === 'remove') {
        setItems((prev) => prev.filter((x) => x.id !== p.id))
        return
      }
      const item = p.item
      if (item.state === 'done' && !seen.current.has(item.id)) {
        seen.current.add(item.id)
        onToast(item.title)
      }
      setItems((prev) => {
        const i = prev.findIndex((x) => x.id === item.id)
        if (i >= 0) {
          const cp = [...prev]
          cp[i] = item
          return cp
        }
        return [item, ...prev]
      })
    })
    window.cs.download.defaults().then((d) => setDir(d.dir))
    return off
  }, [onToast])

  function fire(): void {
    const input = query.trim()
    if (!input) return
    window.cs.download.enqueue({ input, format: fmt, quality: fmt === 'mp4' ? qMp4 : qMp3, choreo })
    setQuery('')
    setBusy(true)
    setTimeout(() => setBusy(false), 650)
  }

  async function chooseFolder(): Promise<void> {
    const d = await window.cs.download.chooseFolder()
    if (d) setDir(d)
  }

  const running = items.filter((it) => it.state !== 'done')
  const done = items.filter((it) => it.state === 'done')
  const list = tab === 'run' ? running : done
  const dirLabel = dir ? '…/' + dir.replace(/\\/g, '/').split('/').slice(-1)[0] : '…/Connection Sound'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="topbar">
        <div className="searchrow">
          <label className="search">
            <IconSearch size={18} />
            <input
              value={query}
              placeholder="Buscar por nome ou colar link do Spotify / YouTube…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fire()}
            />
          </label>
          <button className={'btn-dl' + (busy ? ' busy' : '')} onClick={fire}>
            {busy ? <IconLoader2 size={17} /> : <IconArrowDown size={17} />}
            Baixar
          </button>
        </div>
        <div className="opts">
          <Segmented
            options={[
              { v: 'mp3', label: 'MP3' },
              { v: 'mp4', label: 'MP4' }
            ]}
            value={fmt}
            onChange={setFmt}
          />
          <div className={'choreo' + (fmt === 'mp4' ? ' show' : '')}>
            <Segmented
              options={[
                { v: 'of', label: 'Oficial' },
                { v: 'co', label: 'Coreografia' }
              ]}
              value={choreo}
              onChange={setChoreo}
            />
          </div>
          <QualitySelect fmt={fmt} value={fmt === 'mp4' ? qMp4 : qMp3} onChange={fmt === 'mp4' ? setQMp4 : setQMp3} />
          <div className="chip" onClick={chooseFolder} title={dir}>
            <IconFolder size={15} />
            {dirLabel}
          </div>
        </div>
      </div>

      <div className="tabs">
        <div className="tabset">
          <div className={'tab' + (tab === 'run' ? ' on' : '')} onClick={() => setTab('run')}>
            Em andamento <b>{running.length}</b>
          </div>
          <div className={'tab' + (tab === 'done' ? ' on' : '')} onClick={() => setTab('done')}>
            Concluídos <b>{done.length}</b>
          </div>
        </div>
        <div className="toolbar">
          <div className="tbtn ic act">
            <IconList size={16} />
          </div>
          <div className="tbtn ic">
            <IconLayoutGrid size={16} />
          </div>
          <span style={{ width: 1, height: 16, background: 'var(--line)', margin: '0 2px' }} />
          <div className="tbtn" onClick={() => window.cs.download.pauseAll()}>
            <IconPlayerPause size={16} />
            Pausar tudo
          </div>
          <div className="tbtn" onClick={() => window.cs.download.clearDone()}>
            <IconTrash size={16} />
            Limpar concluídos
          </div>
        </div>
      </div>

      <div className="queue" key={tab}>
        {list.length === 0 ? (
          <div className="empty">
            <div className="emptyIcon">
              <IconClipboard size={30} />
            </div>
            <h3>{tab === 'run' ? 'Nada na fila ainda' : 'Nenhum download concluído'}</h3>
            <p>
              Cole um link do Spotify/YouTube ou digite o nome de uma música e clique em <b>Baixar</b>. Vários ao
              mesmo tempo, sem travar.
            </p>
          </div>
        ) : (
          list.map((it) => (
            <Card
              key={it.id}
              it={it}
              onPause={(id) => window.cs.download.control(id, 'pause')}
              onResume={(id) => window.cs.download.control(id, 'resume')}
              onCancel={(id) => window.cs.download.control(id, 'cancel')}
              onRetry={(id) => window.cs.download.control(id, 'retry')}
            />
          ))
        )}
      </div>
    </div>
  )
}

function Card({
  it,
  onPause,
  onResume,
  onCancel,
  onRetry
}: {
  it: DlItem
  onPause: (id: string) => void
  onResume: (id: string) => void
  onCancel: (id: string) => void
  onRetry: (id: string) => void
}): JSX.Element {
  const coverStyle = it.thumbnail
    ? { backgroundImage: `url(${it.thumbnail})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: gradFor(it.id) }

  if (it.kind === 'playlist') {
    const okW = it.total ? ((it.ok ?? 0) / it.total) * 100 : 0
    const erW = it.total ? ((it.err ?? 0) / it.total) * 100 : 0
    return (
      <div className="card cardIn">
        <div className="cover folder">
          <IconFolder size={19} />
        </div>
        <div className="meta">
          <div className="title">{it.title}</div>
          <div className="prog">
            <div className="track">
              <div className="fill split">
                <div className="seg-ok" style={{ width: okW + '%' }} />
                <div className="seg-er" style={{ width: erW + '%' }} />
              </div>
            </div>
            <div className="phase" style={{ color: 'var(--txt2)' }}>
              {(it.ok ?? 0) + (it.err ?? 0)}/{it.total ?? 0}
              {it.err ? ` · ${it.err} com erro` : ''}
            </div>
          </div>
        </div>
        <div className="right">
          {it.state === 'error' && it.err ? (
            <button className="pillbtn er" onClick={() => onRetry(it.id)}>
              <IconRefresh size={13} />
              Reprocessar {it.err}
            </button>
          ) : it.state === 'done' ? (
            <div className="statetag ok">Concluído</div>
          ) : (
            <span className="pct">{Math.round(it.pct)}%</span>
          )}
        </div>
      </div>
    )
  }

  if (it.state === 'error') {
    return (
      <div className="card err cardIn">
        <div className="cover" style={coverStyle}>
          <span className="selo er">
            <IconAlertTriangle size={10} />
          </span>
        </div>
        <div className="meta">
          <div className="titrow">
            <div className="title">{it.title}</div>
          </div>
          <div className="subline er">{it.reason}</div>
        </div>
        <div className="right">
          <button className="pillbtn er" onClick={() => onRetry(it.id)}>
            <IconRefresh size={13} />
            Tentar de novo
          </button>
        </div>
      </div>
    )
  }

  if (it.state === 'done') {
    return (
      <div className="card done cardIn">
        <div className="cover" style={coverStyle}>
          <span className="selo ok">
            <svg className="check" viewBox="0 0 24 24">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </span>
        </div>
        <div className="meta">
          <div className="title" style={{ color: '#d6d6da' }}>
            {it.title}
          </div>
          <div className="subline">
            {it.format === 'mp4' ? 'MP4' : 'MP3'} · {it.quality}
            {it.size ? ` · ${it.size} MB` : ''} · verificado
          </div>
        </div>
        <div className="right">
          <div className="statetag ok">Concluído</div>
        </div>
      </div>
    )
  }

  const isSearch = it.state === 'queued' || it.state === 'probing'
  const isConv = it.state === 'converting' || it.state === 'verifying'

  const selo = isSearch ? (
    <span className="selo busy">
      <IconLoader2 size={10} />
    </span>
  ) : it.state === 'verifying' ? (
    <span className="selo cv">
      <IconShieldCheck size={10} />
    </span>
  ) : it.state === 'converting' ? (
    <span className="selo cv">
      <IconArrowsExchange size={10} />
    </span>
  ) : it.state === 'paused' ? (
    <span className="selo pa">
      <IconPlayerPause size={10} />
    </span>
  ) : (
    <span className="selo dl">
      <IconArrowDown size={10} />
    </span>
  )

  const phaseText =
    it.state === 'probing' || it.state === 'queued'
      ? 'Buscando fonte…'
      : it.state === 'verifying'
        ? 'Verificando'
        : it.state === 'converting'
          ? `Convertendo · ${it.format === 'mp4' ? 'MP4' : 'MP3'}`
          : it.state === 'paused'
            ? 'Pausado'
            : 'Baixando'

  const phaseClass = isConv ? 'phase cv' : it.state === 'paused' ? 'phase pa' : 'phase dl'
  const fillClass = 'fill' + (isConv ? ' cv' : it.state === 'paused' ? ' pa' : '')

  return (
    <div className="card cardIn">
      <div className="cover" style={coverStyle}>
        {selo}
      </div>
      <div className="meta">
        <div className="titrow">
          <div className="title">{it.title}</div>
          {it.src && <span className="srcchip">{it.src}</span>}
        </div>
        <div className="prog">
          <div className="track">
            {!isSearch && <div className={fillClass} style={{ width: (isConv ? 100 : it.pct) + '%' }} />}
          </div>
          <div className={phaseClass}>
            {isSearch && <IconLoader2 size={13} className="spin" />}
            {phaseText}
          </div>
        </div>
      </div>
      <div className="right">
        {it.state === 'downloading' && (
          <div className="pctbox">
            <span className="pct">{Math.round(it.pct)}%</span>
            {it.speed && <span className="spd">{it.speed}</span>}
          </div>
        )}
        {isConv && <span className="pct">{Math.round(it.pct)}%</span>}
        {it.state === 'paused' && (
          <button className="iact" onClick={() => onResume(it.id)} title="Retomar">
            <IconPlayerPlay size={15} />
          </button>
        )}
        {(it.state === 'downloading' || isSearch) && (
          <div className="acts">
            {it.state === 'downloading' && (
              <button className="iact" onClick={() => onPause(it.id)} title="Pausar">
                <IconPlayerPause size={15} />
              </button>
            )}
            <button className="iact" onClick={() => onCancel(it.id)} title="Cancelar">
              <IconX size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
