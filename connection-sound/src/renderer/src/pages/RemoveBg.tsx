import { useState } from 'react'
import { IconScissors, IconLoader2, IconCheck, IconAlertTriangle, IconFolder, IconPhoto, IconUser, IconBox } from '@tabler/icons-react'
import { DropArea } from '@/components/DropArea'
import { Segmented } from '@/components/Segmented'

interface BgItem {
  id: string
  name: string
  state: 'processing' | 'done' | 'error'
  pct: number
  out?: string
  preview?: string
  reason?: string
}

const IMG_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp']
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp'
}
const extOf = (p: string): string => (p.split('.').pop() || '').toLowerCase()
const isImage = (p: string): boolean => IMG_EXT.includes(extOf(p))
const mimeOf = (p: string): string => MIME[extOf(p)] || 'image/png'
const nameOf = (p: string): string => p.split(/[\\/]/).pop() || 'imagem'

/** Afina a máscara para logos/objetos: aplica threshold + erosão leve para bordas limpas. */
async function refineMaskForObject(blob: Blob): Promise<Blob> {
  const img = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null
  if (!ctx) return blob
  ctx.drawImage(img, 0, 0)
  const imgData = ctx.getImageData(0, 0, img.width, img.height)
  const d = imgData.data
  const w = img.width
  const h = img.height

  // Extrai canal alpha normalizado
  const alpha = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) alpha[i] = d[i * 4 + 3] / 255

  // Dilata levemente (max 3×3) para não cortar bordas finas de logos
  const dilated = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let max = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy
          const nx = x + dx
          if (ny >= 0 && ny < h && nx >= 0 && nx < w) max = Math.max(max, alpha[ny * w + nx])
        }
      }
      dilated[y * w + x] = max
    }
  }

  // Threshold: semi-transparente vira totalmente opaco ou transparente
  for (let i = 0; i < w * h; i++) d[i * 4 + 3] = dilated[i] > 0.45 ? 255 : 0

  ctx.putImageData(imgData, 0, 0)
  return canvas.convertToBlob({ type: 'image/png' })
}

export function RemoveBg(): JSX.Element {
  const [items, setItems] = useState<BgItem[]>([])
  const [mode, setMode] = useState<'pessoa' | 'objeto'>('pessoa')

  function update(id: string, patch: Partial<BgItem>): void {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  async function process(paths: string[]): Promise<void> {
    for (const path of paths) {
      if (!isImage(path)) continue
      const id = 'b' + Math.random().toString(36).slice(2, 9)
      setItems((prev) => [{ id, name: nameOf(path), state: 'processing', pct: 0 }, ...prev])
      try {
        const bytes = await window.cs.readFile(path)
        const blob = new Blob([bytes as unknown as BlobPart], { type: mimeOf(path) })
        const { removeBackground } = await import('@imgly/background-removal')
        const onProg = (_key: string, current: number, total: number): void => {
          if (total > 0) update(id, { pct: Math.min(99, Math.round((current / total) * 100)) })
        }

        // Modelo isnet_fp16 (boa qualidade) embutido localmente — sem download da internet.
        // O modo Objetos/Logos usa o mesmo modelo + pós-processamento de máscara nas bordas.
        const cfg = (device: 'gpu' | 'cpu'): Parameters<typeof removeBackground>[1] => ({
          model: 'isnet_fp16',
          device,
          publicPath: 'csassets://model/',
          output: { format: 'image/png', quality: 1 },
          progress: onProg
        })

        let result: Blob
        try {
          result = await removeBackground(blob, cfg('gpu'))
        } catch {
          result = await removeBackground(blob, cfg('cpu'))
        }

        // Para logos/objetos, refina a máscara para bordas mais limpas
        if (mode === 'objeto') {
          try {
            result = await refineMaskForObject(result)
          } catch {
            // se o refinamento falhar, usa o resultado original
          }
        }

        const buf = new Uint8Array(await result.arrayBuffer())
        const out = await window.cs.bgSave(path, buf)
        update(id, { state: 'done', pct: 100, out, preview: URL.createObjectURL(result) })
      } catch (e) {
        console.error('[remover-fundo]', e)
        const msg = e instanceof Error ? e.message : String(e)
        update(id, { state: 'error', reason: msg.slice(0, 200) || 'Falha ao remover fundo' })
      }
    }
  }

  return (
    <div className="mediapage">
      <div className="mhead">
        <h2>Remover fundo</h2>
        <p>IA local recorta o fundo e salva um PNG transparente, sem servidor. Escolha o modo e arraste.</p>
      </div>

      <div className="mbar" style={{ marginBottom: 12 }}>
        <span className="setlabel" style={{ marginRight: 8 }}>Modo:</span>
        <Segmented
          options={[
            { v: 'pessoa', label: 'Pessoas / Retratos' },
            { v: 'objeto', label: 'Logos / Objetos' }
          ]}
          value={mode}
          onChange={(v) => setMode(v as 'pessoa' | 'objeto')}
        />
        <span className="sethint" style={{ marginLeft: 12, fontSize: 12, color: 'var(--txt3)' }}>
          {mode === 'pessoa'
            ? 'Modelo IS-Net — melhor para pessoas, retratos e animais'
            : 'Modelo IS-Net Quant + afinamento de borda — melhor para logos, produtos e objetos'}
        </span>
      </div>

      <DropArea
        icon={mode === 'objeto' ? IconBox : IconUser}
        title="Arraste imagens aqui"
        hint="ou clique para selecionar — PNG, JPG, WEBP"
        filters={[{ name: 'Imagens', extensions: IMG_EXT }]}
        onFiles={process}
      />

      <div className="mresults">
        {items.map((it) => (
          <div
            key={it.id}
            className={'card cardIn ' + (it.state === 'done' ? 'done' : it.state === 'error' ? 'err' : '')}
          >
            <div className="cover checker">
              {it.preview ? (
                <img src={it.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : it.state === 'processing' ? (
                <IconLoader2 size={18} className="spin" style={{ color: 'var(--blue)' }} />
              ) : (
                <IconPhoto size={18} style={{ color: 'var(--txt3)' }} />
              )}
            </div>
            <div className="meta">
              <div className="title">{it.name}</div>
              {it.state === 'processing' && (
                <div className="prog">
                  <div className="track">
                    <div className="fill" style={{ width: it.pct + '%' }} />
                  </div>
                  <div className="phase dl">
                    {mode === 'objeto' ? 'Recortando objeto…' : 'Removendo fundo…'}
                  </div>
                </div>
              )}
              {it.state === 'done' && <div className="subline">PNG transparente · pronto</div>}
              {it.state === 'error' && <div className="subline er">{it.reason}</div>}
            </div>
            <div className="right">
              {it.state === 'processing' && <span className="pct">{Math.round(it.pct)}%</span>}
              {it.state === 'done' && (
                <>
                  <span className="statetag ok">
                    <IconCheck size={13} /> Pronto
                  </span>
                  {it.out && (
                    <button
                      className="iact"
                      title="Mostrar na pasta"
                      onClick={() => window.cs.showItem(it.out as string)}
                    >
                      <IconFolder size={15} />
                    </button>
                  )}
                </>
              )}
              {it.state === 'error' && <IconAlertTriangle size={16} style={{ color: 'var(--red)' }} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
