import { IconLoader2, IconCheck, IconAlertTriangle, IconFolder, IconPlayerPlay } from '@tabler/icons-react'
import type { MediaItem } from '@/lib/media'

export function MediaRow({ it }: { it: MediaItem }): JSX.Element {
  const cls = 'card cardIn ' + (it.state === 'done' ? 'done' : it.state === 'error' ? 'err' : '')
  return (
    <div className={cls}>
      <div className="cover folder">
        {it.state === 'processing' && <IconLoader2 size={18} className="spin" />}
        {it.state === 'done' && <IconCheck size={18} style={{ color: 'var(--green)' }} />}
        {it.state === 'error' && <IconAlertTriangle size={18} style={{ color: 'var(--red)' }} />}
      </div>
      <div className="meta">
        <div className="title">{it.name}</div>
        {it.state === 'processing' && (
          <div className="prog">
            <div className="track">
              <div className="fill" style={{ width: it.pct + '%' }} />
            </div>
            <div className="phase dl">Processando</div>
          </div>
        )}
        {it.state === 'done' && (
          <div className="subline">
            {it.sizeBefore && it.sizeAfter
              ? `${it.sizeBefore} → ${it.sizeAfter}`
              : it.sizeAfter
                ? `${it.sizeAfter} · pronto`
                : 'pronto'}
          </div>
        )}
        {it.state === 'error' && <div className="subline er">{it.reason}</div>}
      </div>
      <div className="right">
        {it.state === 'processing' && <span className="pct">{Math.round(it.pct)}%</span>}
        {it.state === 'done' && it.outputFile && (
          <>
            <button className="iact" title="Abrir" onClick={() => window.cs.openPath(it.outputFile as string)}>
              <IconPlayerPlay size={15} />
            </button>
            <button className="iact" title="Mostrar na pasta" onClick={() => window.cs.showItem(it.outputFile as string)}>
              <IconFolder size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
