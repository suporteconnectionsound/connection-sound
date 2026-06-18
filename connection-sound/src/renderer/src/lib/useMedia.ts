import { useEffect, useState } from 'react'
import type { MediaItem, MediaOp, MediaEvent } from './media'

export function useMedia(op: MediaOp): MediaItem[] {
  const [items, setItems] = useState<MediaItem[]>([])
  useEffect(() => {
    return window.cs.media.onEvent((p: MediaEvent) => {
      if (p.type === 'remove') {
        setItems((prev) => prev.filter((i) => i.id !== p.id))
        return
      }
      if (p.item.op !== op) return
      setItems((prev) => {
        const i = prev.findIndex((x) => x.id === p.item.id)
        if (i >= 0) {
          const c = [...prev]
          c[i] = p.item
          return c
        }
        return [p.item, ...prev]
      })
    })
  }, [op])
  return items
}
