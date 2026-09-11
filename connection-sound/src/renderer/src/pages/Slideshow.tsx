import { useState } from 'react'
import { IconPhoto, IconAlertTriangle } from '@tabler/icons-react'
import { DropArea } from '@/components/DropArea'
import { MediaRow } from '@/components/MediaRow'
import { useMedia } from '@/lib/useMedia'

// Limites de segurança: protege a memória do app e o ffmpeg de virar pamonha.
// 200 fotos a 5 MB cada = ~1 GB em RAM só pra decodificar.
const MAX_FILES = 200
const MAX_BYTES = 500 * 1024 * 1024

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
  return Math.max(1, Math.round(n / 1024)) + ' KB'
}

export function Slideshow(): JSX.Element {
  const [files, setFiles] = useState<string[]>([])
  const [resolution, setResolution] = useState('1080p')
  const [perPhoto, setPerPhoto] = useState(3)
  const [transition, setTransition] = useState('fade')
  const [error, setError] = useState('')
  const items = useMedia('slideshow')

  async function addFiles(paths: string[]): Promise<void> {
    setError('')
    const next = [...files, ...paths]
    if (next.length > MAX_FILES) {
      setError(`Limite de ${MAX_FILES} fotos por slideshow. Você tem ${next.length}.`)
      return
    }
    const stats = await window.cs.statFiles(next)
    const total = stats.reduce((s, f) => s + (f.size || 0), 0)
    if (total > MAX_BYTES) {
      setError(
        `Tamanho total ${fmtBytes(total)} passa do limite (${fmtBytes(MAX_BYTES)}). Reduza a quantidade ou use fotos menores.`
      )
      return
    }
    setFiles(next)
  }

  function run(): void {
    if (!files.length) return
    window.cs.media.slideshow(files, resolution, perPhoto, transition)
    setFiles([])
  }

  return (
    <div className="mediapage">
      <div className="mhead">
        <h2>Slideshow</h2>
        <p>Foto centralizada com fundo desfocado dela mesma, sem cortar. Arraste fotos ou um .zip.</p>
      </div>
      <DropArea
        icon={IconPhoto}
        title="Arraste fotos ou um .zip"
        hint={`ou clique para selecionar — PNG, JPG, WEBP… (até ${MAX_FILES} fotos / ${fmtBytes(MAX_BYTES)})`}
        filters={[{ name: 'Imagens / Zip', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'zip'] }]}
        onFiles={addFiles}
      />
      {error && (
        <div className="authmsg err" style={{ maxWidth: 560 }}>
          <IconAlertTriangle size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          {error}
        </div>
      )}
      {files.length > 0 && (
        <div className="mbar">
          <span className="mcount">{files.length} item(ns)</span>
          <label className="tlabel">
            Resolução
            <select className="tsel" value={resolution} onChange={(e) => setResolution(e.target.value)}>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
              <option value="1440p">1440p</option>
              <option value="4K">4K</option>
              <option value="Quadrado 1080">Quadrado (1080)</option>
              <option value="Vertical 1080x1920">Vertical (Stories)</option>
            </select>
          </label>
          <label className="tlabel">
            Tempo/foto
            <select className="tsel" value={perPhoto} onChange={(e) => setPerPhoto(Number(e.target.value))}>
              <option value={2}>2s</option>
              <option value={3}>3s</option>
              <option value={4}>4s</option>
              <option value={5}>5s</option>
            </select>
          </label>
          <label className="tlabel">
            Transição
            <select className="tsel" value={transition} onChange={(e) => setTransition(e.target.value)}>
              <option value="fade">Fade</option>
              <option value="dissolve">Dissolver</option>
              <option value="slideleft">Deslizar</option>
              <option value="wiperight">Cortina</option>
              <option value="circleopen">Círculo</option>
            </select>
          </label>
          <button className="dzbtn" onClick={run}>
            Gerar slideshow
          </button>
        </div>
      )}
      <div className="mresults">
        {items.map((it) => (
          <MediaRow key={it.id} it={it} />
        ))}
      </div>
    </div>
  )
}
