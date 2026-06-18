export type DlState =
  | 'queued'
  | 'probing'
  | 'downloading'
  | 'converting'
  | 'verifying'
  | 'paused'
  | 'done'
  | 'error'

export interface DlItem {
  id: string
  title: string
  src: string
  state: DlState
  pct: number
  speed?: string
  eta?: string
  size?: string
  reason?: string
  thumbnail?: string
  kind: 'track' | 'playlist'
  ok?: number
  err?: number
  total?: number
  format: string
  quality: string
}

export type DlEvent = { type: 'upsert'; item: DlItem } | { type: 'remove'; id: string }
