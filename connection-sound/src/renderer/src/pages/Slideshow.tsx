import { useState } from 'react'
import { IconPhoto } from '@tabler/icons-react'
import { DropArea } from '@/components/DropArea'
import { MediaRow } from '@/components/MediaRow'
import { useMedia } from '@/lib/useMedia'

export function Slideshow(): JSX.Element {
  const [files, setFiles] = useState<string[]>([])
  const [resolution, setResolution] = useState('1080p')
  const [perPhoto, setPerPhoto] = useState(3)
  const [transition, setTransition] = useState('fade')
  const items = useMedia('slideshow')

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
        hint="ou clique para selecionar — PNG, JPG, WEBP…"
        filters={[{ name: 'Imagens / Zip', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'zip'] }]}
        onFiles={(p) => setFiles((f) => [...f, ...p])}
      />
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
