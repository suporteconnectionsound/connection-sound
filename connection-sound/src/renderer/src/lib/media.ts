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

export type MediaEvent = { type: 'upsert'; item: MediaItem } | { type: 'remove'; id: string }
