import { useEffect, useRef, useState } from 'react'
import { IconMusic, IconVideo, IconChevronDown, IconCheck } from '@tabler/icons-react'

const MP3_OPTS = ['320 kbps', '256 kbps', '192 kbps', '128 kbps']
const MP4_OPTS = ['4K', '1440p', '1080p', '720p', '480p']

interface Props {
  fmt: string
  value: string
  onChange: (v: string) => void
}

export function QualitySelect({ fmt, value, onChange }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const opts = fmt === 'mp4' ? MP4_OPTS : MP3_OPTS

  useEffect(() => {
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div className="qsel" ref={ref}>
      <button className="chip" onClick={() => setOpen((o) => !o)}>
        {fmt === 'mp4' ? <IconVideo size={15} /> : <IconMusic size={15} />}
        {value}
        <IconChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {open && (
        <div className="qmenu">
          {opts.map((o) => (
            <div
              key={o}
              className={'qopt' + (o === value ? ' on' : '')}
              onClick={() => {
                onChange(o)
                setOpen(false)
              }}
            >
              <span>{o}</span>
              {o === value && <IconCheck size={14} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
