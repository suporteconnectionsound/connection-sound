import { spawn } from 'child_process'
import { join, basename, extname, dirname } from 'path'
import { existsSync, mkdirSync, mkdtempSync, statSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import AdmZip from 'adm-zip'
import { tools } from './binaryManager'

export type MediaOp = 'convert' | 'compress' | 'slideshow'
export type MediaState = 'queued' | 'processing' | 'done' | 'error'

export interface MediaItem {
  id: string
  name: string
  op: MediaOp
  state: MediaState
  pct: number
  outputFile?: string
  reason?: string
  sizeBefore?: string
  sizeAfter?: string
}

type Sink = (payload: { type: 'upsert'; item: MediaItem } | { type: 'remove'; id: string }) => void

const uid = (): string => 'm' + Math.random().toString(36).slice(2, 9)
const IMG = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tiff', '.heic']
const AUDIO = ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wma']
const VIDEO = ['.mp4', '.mkv', '.mov', '.webm', '.avi', '.flv', '.m4v']

const RES: Record<string, [number, number]> = {
  '720p': [1280, 720],
  '1080p': [1920, 1080],
  '1440p': [2560, 1440],
  '4K': [3840, 2160],
  'Quadrado 1080': [1080, 1080],
  'Vertical 1080x1920': [1080, 1920]
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return Math.max(1, Math.round(bytes / 1024)) + ' KB'
}
function ext(p: string): string {
  return extname(p).toLowerCase()
}
function category(p: string): 'image' | 'audio' | 'video' | 'other' {
  const e = ext(p)
  if (IMG.includes(e)) return 'image'
  if (AUDIO.includes(e)) return 'audio'
  if (VIDEO.includes(e)) return 'video'
  return 'other'
}

export class MediaService {
  constructor(private sink: Sink) {}

  private emit(item: MediaItem): void {
    this.sink({ type: 'upsert', item })
  }

  /** Roda ffmpeg, parseia "time=" no stderr p/ progresso. */
  private runFfmpeg(args: string[], totalSec: number, onPct?: (pct: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(tools.ffmpeg, ['-y', '-hide_banner', ...args], { windowsHide: true })
      let err = ''
      proc.stderr.on('data', (d: Buffer) => {
        const s = d.toString()
        err += s
        if (onPct && totalSec > 0) {
          const m = s.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/)
          if (m) {
            const sec = +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])
            onPct(Math.min(99, Math.round((sec / totalSec) * 100)))
          }
        }
      })
      proc.on('error', (e) => reject(new Error(`ffmpeg não encontrado: ${e.message}`)))
      proc.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          // Extrai a última linha de erro útil do stderr para diagnóstico
          const lines = err.split('\n').map((l) => l.trim()).filter(Boolean)
          const lastErr = lines.reverse().find((l) => /error|invalid|failed|unable|cannot|no such/i.test(l))
          reject(new Error(lastErr || err.slice(-300) || 'erro desconhecido'))
        }
      })
    })
  }

  private probeDuration(file: string): Promise<number> {
    return new Promise((resolve) => {
      const proc = spawn(tools.ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
        windowsHide: true
      })
      let out = ''
      proc.stdout.on('data', (d: Buffer) => (out += d.toString()))
      proc.on('close', () => resolve(parseFloat(out.trim()) || 0))
      proc.on('error', () => resolve(0))
    })
  }

  // ---------- CONVERTER ----------
  async convert(files: string[], target: string): Promise<void> {
    for (const file of files) {
      const id = uid()
      const item: MediaItem = { id, name: basename(file), op: 'convert', state: 'processing', pct: 0 }
      this.emit(item)
      try {
        const out = join(dirname(file), `${basename(file, extname(file))}.${target}`)
        const args = this.convertArgs(file, target, out)
        const total = category(file) === 'image' ? 0 : await this.probeDuration(file)
        await this.runFfmpeg(args, total, (p) => this.emit({ ...item, pct: p }))
        item.state = 'done'
        item.pct = 100
        item.outputFile = out
        item.sizeAfter = existsSync(out) ? fmtSize(statSync(out).size) : undefined
        this.emit(item)
      } catch (e) {
        item.state = 'error'
        item.reason = e instanceof Error ? e.message.slice(0, 200) : 'Falha ao converter'
        this.emit(item)
      }
    }
  }

  private convertArgs(input: string, target: string, out: string): string[] {
    const t = target.toLowerCase()
    const cat = category(input)
    const a = ['-i', input]
    if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus'].includes(t)) {
      a.push('-vn')
      if (t === 'mp3') a.push('-c:a', 'libmp3lame', '-q:a', '0')
      else if (t === 'wav') a.push('-c:a', 'pcm_s16le')
      else if (t === 'flac') a.push('-c:a', 'flac')
      else if (t === 'opus' || t === 'ogg') a.push('-c:a', 'libopus', '-b:a', '192k')
      else a.push('-c:a', 'aac', '-b:a', '256k')
    } else if (['mp4', 'mkv', 'mov'].includes(t)) {
      if (cat === 'audio') {
        // áudio → container de vídeo: cria tela preta com o áudio
        a.push('-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=30', '-shortest')
        a.push('-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '192k', '-pix_fmt', 'yuv420p')
      } else {
        a.push('-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-threads', '0', '-c:a', 'aac', '-b:a', '192k', '-pix_fmt', 'yuv420p')
      }
    } else if (t === 'webm') {
      a.push('-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-cpu-used', '5', '-c:a', 'libopus')
    } else if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(t)) {
      if (cat === 'video' || cat === 'audio') a.push('-frames:v', '1')
      if (t === 'png') a.push('-compression_level', '6')
      else if (t === 'jpg' || t === 'jpeg') a.push('-q:v', '2')
      else if (t === 'webp') a.push('-c:v', 'libwebp', '-quality', '90')
      else if (t === 'bmp') a.push('-pix_fmt', 'bgr24')
    }
    a.push(out)
    return a
  }

  // ---------- COMPRESSOR ----------
  async compress(files: string[], level: 'leve' | 'medio' | 'forte' = 'medio'): Promise<void> {
    const crf = level === 'leve' ? 24 : level === 'forte' ? 30 : 27
    for (const file of files) {
      const id = uid()
      const before = existsSync(file) ? statSync(file).size : 0
      const item: MediaItem = { id, name: basename(file), op: 'compress', state: 'processing', pct: 0, sizeBefore: fmtSize(before) }
      this.emit(item)
      try {
        const cat = category(file)
        const e = ext(file)
        const out = join(dirname(file), `${basename(file, e)} (comprimido)${cat === 'video' ? '.mp4' : e}`)
        let args: string[]
        let total = 0
        if (cat === 'video') {
          total = await this.probeDuration(file)
          // Tenta H.265; se falhar (codec ausente), cai para H.264 que é mais compatível
          args = ['-i', file, '-c:v', 'libx265', '-crf', String(crf), '-preset', 'fast', '-c:a', 'aac', '-b:a', '128k', '-tag:v', 'hvc1', out]
        } else if (cat === 'image') {
          if (e === '.png') {
            args = ['-i', file, '-compression_level', '6', out]
          } else {
            args = ['-i', file, '-q:v', String(level === 'forte' ? 8 : 4), out]
          }
        } else if (cat === 'audio') {
          args = ['-i', file, '-c:a', 'libmp3lame', '-b:a', level === 'forte' ? '128k' : '192k', out]
        } else {
          throw new Error('tipo não suportado')
        }
        await this.runFfmpeg(args, total, (p) => this.emit({ ...item, pct: p }))
        const after = existsSync(out) ? statSync(out).size : 0
        item.state = 'done'
        item.pct = 100
        item.outputFile = out
        item.sizeAfter = fmtSize(after)
        this.emit(item)
      } catch (e) {
        item.state = 'error'
        item.reason = e instanceof Error ? e.message.slice(0, 200) : 'Falha ao comprimir'
        this.emit(item)
      }
    }
  }

  // ---------- SLIDESHOW ----------
  private resolveImages(inputs: string[]): string[] {
    const imgs: string[] = []
    for (const p of inputs) {
      if (ext(p) === '.zip' && existsSync(p)) {
        try {
          const zip = new AdmZip(p)
          const dest = mkdtempSync(join(tmpdir(), 'cs-zip-'))
          zip.extractAllTo(dest, true)
          const walk = (dir: string): void => {
            for (const f of readdirSync(dir, { withFileTypes: true })) {
              const full = join(dir, f.name)
              if (f.isDirectory()) walk(full)
              else if (IMG.includes(ext(full))) imgs.push(full)
            }
          }
          walk(dest)
        } catch {
          /* ignora zip inválido */
        }
      } else if (IMG.includes(ext(p))) {
        imgs.push(p)
      }
    }
    return imgs
      .sort((a, b) => basename(a).localeCompare(basename(b), undefined, { numeric: true }))
      .slice(0, 100) // limite de segurança: máximo 100 imagens por slideshow
  }

  async slideshow(
    inputs: string[],
    opts: { resolution: string; perPhoto: number; transition: string; outDir: string }
  ): Promise<void> {
    const id = uid()
    const item: MediaItem = { id, name: 'Slideshow', op: 'slideshow', state: 'processing', pct: 0 }
    this.emit(item)
    try {
      const images = this.resolveImages(inputs)
      if (images.length === 0) throw new Error('sem imagens')
      const [W, H] = RES[opts.resolution] || RES['1080p']
      const D = Math.max(1, opts.perPhoto || 3)
      const T = images.length > 1 ? 0.8 : 0
      const fps = 30
      const transition = opts.transition || 'fade'

      const inputArgs: string[] = []
      const filters: string[] = []
      const dur = images.length > 1 ? D + T : D
      images.forEach((img, i) => {
        inputArgs.push('-loop', '1', '-t', String(dur), '-i', img)
        // Usa split para poder usar o stream de entrada em dois filtros diferentes
        // (sem split, ffmpeg retorna erro "Input link already used by some other filter")
        filters.push(
          `[${i}:v]split[sa${i}][sb${i}];` +
            `[sa${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=22:2,setsar=1[bg${i}];` +
            `[sb${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[fg${i}];` +
            `[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,format=yuv420p,fps=${fps}[v${i}]`
        )
      })

      let lastLabel = '[v0]'
      if (images.length > 1) {
        for (let k = 1; k < images.length; k++) {
          const outL = k === images.length - 1 ? '[vout]' : `[x${k}]`
          // Offset correto para xfades encadeados: cada imagem aparece D segundos antes da transição.
          // Para k>1 precisa compensar os T segundos sobrepostos das transições anteriores.
          const offset = D * k + T * (k - 1)
          filters.push(`${lastLabel}[v${k}]xfade=transition=${transition}:duration=${T}:offset=${offset}${outL}`)
          lastLabel = outL
        }
      } else {
        lastLabel = '[v0]'
      }

      if (!existsSync(opts.outDir)) mkdirSync(opts.outDir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const out = join(opts.outDir, `Slideshow ${stamp}.mp4`)
      const total = images.length * D

      const args = [
        ...inputArgs,
        '-filter_complex',
        filters.join(';'),
        '-map',
        lastLabel,
        '-r',
        String(fps),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        out
      ]
      await this.runFfmpeg(args, total, (p) => this.emit({ ...item, pct: p }))
      item.state = 'done'
      item.pct = 100
      item.outputFile = out
      item.name = `Slideshow · ${images.length} fotos`
      item.sizeAfter = existsSync(out) ? fmtSize(statSync(out).size) : undefined
      this.emit(item)
    } catch (e) {
      item.state = 'error'
      item.reason = e instanceof Error ? e.message.slice(0, 200) : 'Falha ao gerar slideshow'
      this.emit(item)
    }
  }
}
