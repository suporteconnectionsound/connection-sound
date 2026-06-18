import { useState } from 'react'
import { IconArrowsMinimize } from '@tabler/icons-react'
import { DropArea } from '@/components/DropArea'
import { MediaRow } from '@/components/MediaRow'
import { useMedia } from '@/lib/useMedia'

export function Compressor(): JSX.Element {
  const [files, setFiles] = useState<string[]>([])
  const [level, setLevel] = useState<'leve' | 'medio' | 'forte'>('medio')
  const items = useMedia('compress')

  function run(): void {
    if (!files.length) return
    window.cs.media.compress(files, level)
    setFiles([])
  }

  return (
    <div className="mediapage">
      <div className="mhead">
        <h2>Compressor inteligente</h2>
        <p>Reduz o tamanho com perda imperceptível em vídeo e 100% sem perda em PNG. Mostra antes → depois.</p>
      </div>
      <DropArea
        icon={IconArrowsMinimize}
        title="Arraste arquivos aqui"
        hint="ou clique para selecionar — vídeo, imagem ou áudio"
        onFiles={(p) => setFiles((f) => [...f, ...p])}
      />
      {files.length > 0 && (
        <div className="mbar">
          <span className="mcount">{files.length} arquivo(s)</span>
          <label className="tlabel">
            Intensidade
            <select className="tsel" value={level} onChange={(e) => setLevel(e.target.value as 'leve' | 'medio' | 'forte')}>
              <option value="leve">Leve (melhor qualidade)</option>
              <option value="medio">Média (recomendado)</option>
              <option value="forte">Forte (menor tamanho)</option>
            </select>
          </label>
          <button className="dzbtn" onClick={run}>
            Comprimir
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
