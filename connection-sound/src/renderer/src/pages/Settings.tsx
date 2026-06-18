import { useEffect, useState } from 'react'
import {
  IconFolder,
  IconCheck,
  IconX,
  IconLoader2,
  IconRefresh,
  IconSettings,
  IconTool,
  IconDownload
} from '@tabler/icons-react'

interface ToolStatus {
  name: string
  path: string
  ok: boolean
  version?: string
}

export function Settings(): JSX.Element {
  const [dir, setDir] = useState('')
  const [tools, setTools] = useState<ToolStatus[] | null>(null)
  const [loadingTools, setLoadingTools] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.cs.download.defaults().then((d) => setDir(d.dir))
    runCheck()
  }, [])

  async function changeFolder(): Promise<void> {
    const d = await window.cs.download.chooseFolder()
    if (d) {
      setDir(d)
      flash()
    }
  }

  function flash(): void {
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  async function runCheck(): Promise<void> {
    setLoadingTools(true)
    try {
      const r = await window.cs.tools.check()
      setTools(r as ToolStatus[])
    } finally {
      setLoadingTools(false)
    }
  }

  return (
    <div className="mediapage">
      <div className="mhead">
        <h2>Configurações</h2>
        <p>Pasta de downloads, ferramentas e diagnóstico do sistema.</p>
      </div>

      {/* ── Downloads ────────────────────────────────────────── */}
      <div className="setcard">
        <div className="setcard-head">
          <IconDownload size={17} style={{ color: 'var(--orange)' }} />
          <span>Pasta de downloads</span>
          {saved && (
            <span className="setsaved">
              <IconCheck size={13} /> Salvo
            </span>
          )}
        </div>
        <div className="setrow">
          <div className="setpath">
            <IconFolder size={14} style={{ flexShrink: 0, color: 'var(--txt3)' }} />
            <span title={dir}>{dir || 'Escolha uma pasta…'}</span>
          </div>
          <button className="setbtn" onClick={changeFolder}>
            Mudar pasta
          </button>
        </div>
        <p className="sethint">
          Os arquivos baixados e os resultados do conversor/compressor vão para esta pasta.
        </p>
      </div>

      {/* ── Ferramentas ──────────────────────────────────────── */}
      <div className="setcard">
        <div className="setcard-head">
          <IconTool size={17} style={{ color: 'var(--orange)' }} />
          <span>Ferramentas</span>
          <button
            className="setbtn sm"
            onClick={runCheck}
            disabled={loadingTools}
            style={{ marginLeft: 'auto' }}
          >
            {loadingTools ? <IconLoader2 size={13} className="spin" /> : <IconRefresh size={13} />}
            Verificar
          </button>
        </div>

        {loadingTools && !tools && (
          <div className="setloading">
            <IconLoader2 size={18} className="spin" style={{ color: 'var(--orange)' }} />
            Verificando ferramentas…
          </div>
        )}

        {tools && (
          <div className="toollist">
            {tools.map((t) => (
              <div key={t.name} className={'toolrow' + (t.ok ? '' : ' err')}>
                <div className="toolicon">
                  {t.ok ? (
                    <IconCheck size={14} style={{ color: 'var(--green)' }} />
                  ) : (
                    <IconX size={14} style={{ color: 'var(--red)' }} />
                  )}
                </div>
                <div className="toolmeta">
                  <div className="toolname">{t.name}</div>
                  <div className="toolver">{t.ok ? t.version : 'Não encontrado — ' + t.path}</div>
                </div>
                <div className={'toolstatus ' + (t.ok ? 'ok' : 'er')}>{t.ok ? 'OK' : 'Falha'}</div>
              </div>
            ))}
          </div>
        )}

        <p className="sethint">
          yt-dlp, ffmpeg e ffprobe estão embutidos no app e não precisam estar instalados no sistema.
        </p>
      </div>

      {/* ── App ──────────────────────────────────────────────── */}
      <div className="setcard">
        <div className="setcard-head">
          <IconSettings size={17} style={{ color: 'var(--orange)' }} />
          <span>Sobre</span>
        </div>
        <div className="setrow">
          <span className="setlabel">Versão</span>
          <span className="setval">Connection Sound 0.1.1</span>
        </div>
        <div className="setrow">
          <span className="setlabel">Motor de download</span>
          <span className="setval">yt-dlp + FFmpeg (embutidos)</span>
        </div>
        <div className="setrow">
          <span className="setlabel">Remoção de fundo</span>
          <span className="setval">@imgly/background-removal — IS-Net (processamento local)</span>
        </div>
      </div>
    </div>
  )
}
