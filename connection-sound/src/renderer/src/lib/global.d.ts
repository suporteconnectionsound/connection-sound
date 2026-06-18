import type { DlEvent } from './download'

export {}

declare global {
  interface Window {
    cs: {
      minimize: () => void
      maximize: () => void
      close: () => void
      openExternal: (url: string) => void
      download: {
        enqueue: (payload: { input: string; format: string; quality: string; choreo?: string }) => Promise<void>
        control: (id: string, action: 'pause' | 'resume' | 'cancel' | 'retry') => void
        pauseAll: () => void
        clearDone: () => void
        defaults: () => Promise<{ dir: string }>
        chooseFolder: () => Promise<string | null>
        onEvent: (cb: (payload: DlEvent) => void) => () => void
      }
      tools: {
        check: () => Promise<unknown>
      }
    }
  }
}
