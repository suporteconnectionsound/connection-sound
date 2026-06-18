import { useState, type DragEvent } from 'react'
import type { Icon as TablerIcon } from '@tabler/icons-react'

interface Props {
  onFiles: (paths: string[]) => void
  filters?: { name: string; extensions: string[] }[]
  title: string
  hint: string
  icon: TablerIcon
}

export function DropArea({ onFiles, filters, title, hint, icon: Icon }: Props): JSX.Element {
  const [over, setOver] = useState(false)

  function handleDrop(e: DragEvent): void {
    e.preventDefault()
    e.stopPropagation()
    setOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => {
        try {
          return window.cs.getPathForFile(f)
        } catch {
          return ''
        }
      })
      .filter(Boolean)
    if (paths.length) onFiles(paths)
  }

  async function pick(): Promise<void> {
    const paths = await window.cs.pickFiles(filters)
    if (paths.length) onFiles(paths)
  }

  return (
    <div
      className={'dropzone' + (over ? ' over' : '')}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      onClick={pick}
    >
      <div className="dzicon">
        <Icon size={32} />
      </div>
      <h2>{title}</h2>
      <p>{hint}</p>
      <button className="dzbtn" onClick={(e) => { e.stopPropagation(); pick() }}>
        Selecionar arquivos
      </button>
    </div>
  )
}
