import { useLayoutEffect, useRef, useState } from 'react'

export interface SegOption {
  v: string
  label: string
}

interface Props {
  options: SegOption[]
  value: string
  onChange: (v: string) => void
}

export function Segmented({ options, value, onChange }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState({ left: 3, width: 0 })

  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`button[data-v="${value}"]`)
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value, options])

  return (
    <div className="seg" ref={ref}>
      <span className="pill" style={{ left: pill.left, width: pill.width }} />
      {options.map((o) => (
        <button
          key={o.v}
          data-v={o.v}
          className={value === o.v ? 'on' : ''}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
