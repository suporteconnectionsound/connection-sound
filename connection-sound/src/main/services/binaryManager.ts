import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'

const pexec = promisify(execFile)

function binDir(): string {
  const candidates = [
    join(app.getAppPath(), 'resources', 'bin'),
    join(process.resourcesPath || '', 'bin')
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return candidates[0]
}

function pick(fileName: string, fallback: string): string {
  const p = join(binDir(), fileName)
  return existsSync(p) ? p : fallback
}

export const tools = {
  ytdlp: pick('yt-dlp.exe', 'yt-dlp'),
  ffmpeg: pick('ffmpeg.exe', 'ffmpeg'),
  ffprobe: pick('ffprobe.exe', 'ffprobe'),
  aria2c: pick('aria2c.exe', 'aria2c')
}

/** Caminho do aria2c se estiver disponível (download multi-conexão, bem mais rápido). */
export function aria2cPath(): string | null {
  const p = join(binDir(), 'aria2c.exe')
  return existsSync(p) ? p : null
}

/** Caminho da pasta do ffmpeg empacotado, se existir (para passar ao yt-dlp). */
export function bundledFfmpegDir(): string | null {
  const p = join(binDir(), 'ffmpeg.exe')
  return existsSync(p) ? binDir() : null
}

export interface ToolStatus {
  name: string
  path: string
  ok: boolean
  version?: string
}

async function probeVersion(name: string, bin: string, args: string[]): Promise<ToolStatus> {
  try {
    const { stdout, stderr } = await pexec(bin, args, { windowsHide: true, timeout: 8000 })
    const out = (stdout || stderr || '').trim()
    const version = out.split('\n')[0]?.slice(0, 60)
    return { name, path: bin, ok: true, version }
  } catch {
    return { name, path: bin, ok: false }
  }
}

export async function checkTools(): Promise<ToolStatus[]> {
  return Promise.all([
    probeVersion('yt-dlp', tools.ytdlp, ['--version']),
    probeVersion('ffmpeg', tools.ffmpeg, ['-version']),
    probeVersion('ffprobe', tools.ffprobe, ['-version'])
  ])
}
