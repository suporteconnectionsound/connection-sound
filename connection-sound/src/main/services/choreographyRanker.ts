import { execFile } from 'child_process'
import { promisify } from 'util'

const pexec = promisify(execFile)

export interface Candidate {
  id?: string
  url?: string
  title?: string
  uploader?: string
  channel?: string
  duration?: number
  view_count?: number
}

/** Canais profissionais conhecidos (substrings, minúsculas). Lista extensível. */
const PRO_CHANNELS = [
  'fitdance',
  'fit dance',
  'daniel saboya',
  'cia daniel saboya',
  'cia. daniel saboya',
  'mete dança',
  'mete danca',
  'dan dance',
  'rebolation',
  'coreógrafo',
  'free dance'
]

const POS_TITLE = /coreografia|choreograph|coregraf|\bdance\b|dança|danca/i
const NEG_TITLE = /lyric|letra|\baudio\b|áudio|slowed|reverb|\b8d\b|karaoke|instrumental|\bcover\b|remix|sped up|nightcore/i
const LIVE = /ao vivo|\blive\b/i

/** Pontua um candidato de vídeo de coreografia. Função pura (testável isoladamente).
 *  `query` = nome da música buscada; usado para garantir que é a MÚSICA certa
 *  (evita pegar coreografia de outra música do mesmo canal). */
export function scoreCandidate(c: Candidate, query = ''): number {
  let s = 0
  const title = (c.title || '').toLowerCase()
  const ch = (c.uploader || c.channel || '').toLowerCase()

  if (PRO_CHANNELS.some((p) => ch.includes(p))) s += 6
  if (POS_TITLE.test(title)) s += 3
  if (/tutorial|aula|passo a passo|coreografia oficial/.test(title)) s += 1
  if (NEG_TITLE.test(title)) s -= 3
  if (LIVE.test(title)) s -= 2

  const d = c.duration || 0
  if (d >= 60 && d <= 600) s += 2
  else if (d > 0) s -= 2

  const v = c.view_count || 0
  s += Math.min(2, Math.log10(v + 1) / 3)

  // Casamento com o nome da música: prioriza o título que realmente bate com a busca.
  // Stop-words e palavras curtas demais viram ruído; aceita 2+ letras pra não perder
  // casos reais ("Malu", "Tiê", "Pabllo").
  const STOP = new Set(['de', 'da', 'do', 'e', 'a', 'o', 'as', 'os', 'em', 'no', 'na', 'pra', 'para'])
  const qWords = [
    ...new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !STOP.has(w))
    )
  ]
  if (qWords.length) {
    const matched = qWords.filter((w) => title.includes(w)).length
    const ratio = matched / qWords.length
    s += ratio * 4 // até +4 quando o título bate bem com a música buscada
    // Só pune quando REALMENTE quase nada bate (≥75% das palavras não casam).
    if (ratio < 0.25) s -= 5
  }
  // Fallback: 1 palavra só (ex.: "Evidências") → exige canal profissional OU POS_TITLE.
  // Sem isso o ranker prefere vídeo aleatório só porque tem "coreografia" no título.

  return s
}

/** Escolhe o melhor candidato acima de um limiar; senão null (→ fallback p/ versão normal).
 *  Quando a busca tem 1 palavra só, exige um sinal mais forte (canal pro OU coreografia
 *  no título) — caso contrário o ranker prefere o primeiro vídeo genérico de dança. */
export function pickBest(entries: Candidate[], query = '', threshold = 3): Candidate | null {
  const STOP = new Set(['de', 'da', 'do', 'e', 'a', 'o', 'as', 'os', 'em', 'no', 'na', 'pra', 'para'])
  const qWords = [
    ...new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !STOP.has(w))
    )
  ]
  const singleWord = qWords.length <= 1
  // Threshold mínimo mais alto evita pegar coreografia de música errada.
  const effectiveThreshold = singleWord ? Math.max(threshold, 6) : Math.max(threshold, 5)

  let best: Candidate | null = null
  let bestScore = -Infinity
  for (const e of entries) {
    if (!e) continue
    const sc = scoreCandidate(e, query)
    if (sc > bestScore) {
      bestScore = sc
      best = e
    }
  }
  return best && bestScore >= effectiveThreshold ? best : null
}

export class ChoreographyRanker {
  constructor(private ytdlp: string) {}

  async rank(query: string): Promise<{ url: string; title: string } | null> {
    try {
      const { stdout } = await pexec(
        this.ytdlp,
        ['-J', '--flat-playlist', '--no-warnings', '--ignore-config', `ytsearch12:${query} coreografia`],
        { windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 45000 }
      )
      const j = JSON.parse(stdout)
      const entries: Candidate[] = j.entries || []
      const best = pickBest(entries, query)
      if (!best) return null
      return {
        url: best.url || `https://www.youtube.com/watch?v=${best.id}`,
        title: best.title || query
      }
    } catch {
      return null
    }
  }
}
