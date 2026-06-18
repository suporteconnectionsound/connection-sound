import { useState } from 'react'
import { IconArrowsExchange } from '@tabler/icons-react'
import { DropArea } from '@/components/DropArea'
import { MediaRow } from '@/components/MediaRow'
import { useMedia } from '@/lib/useMedia'

export function Converter(): JSX.Element {
  const [files, setFiles] = useState<string[]>([])
  const [target, setTarget] = useState('mp3')
  const items = useMedia('convert')

  function run(): void {
    if (!files.length) return
    window.cs.media.convert(files, target)
    setFiles([])
  }

  return (
    <div className="mediapage">
      <div className="mhead">
        <h2>Conversor de formatos</h2>
        <p>Arraste áudio, vídeo ou imagem e escolha o formato de saída.</p>
      </div>
      <DropArea
        icon={IconArrowsExchange}
        title="Arraste arquivos aqui"
        hint="ou clique para selecionar — áudio, vídeo e imagem"
        onFiles={(p) => setFiles((f) => [...f, ...p])}
      />
      {files.length > 0 && (
        <div className="mbar">
          <span className="mcount">{files.length} arquivo(s)</span>
          <label className="tlabel">
            Converter para
            <select className="tsel" value={target} onChange={(e) => setTarget(e.target.value)}>
              <optgroup label="Áudio">
                <option value="mp3">MP3</option>
                <option value="wav">WAV</option>
                <option value="flac">FLAC</option>
                <option value="m4a">M4A</option>
                <option value="ogg">OGG</option>
              </optgroup>
              <optgroup label="Vídeo">
                <option value="mp4">MP4</option>
                <option value="mkv">MKV</option>
                <option value="webm">WEBM</option>
              </optgroup>
              <optgroup label="Imagem">
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
                <option value="webp">WEBP</option>
              </optgroup>
            </select>
          </label>
          <button className="dzbtn" onClick={run}>
            Converter
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
