import type { DlEvent } from './download'
import type { MediaEvent } from './media'

export {}

declare global {
  interface Window {
    cs: {
      minimize: () => void
      maximize: () => void
      close: () => void
      openExternal: (url: string) => void
      openPath: (p: string) => void
      showItem: (p: string) => void
      getPathForFile: (file: File) => string
      pickFiles: (filters?: { name: string; extensions: string[] }[]) => Promise<string[]>
      readFile: (path: string) => Promise<Uint8Array>
      bgSave: (src: string, bytes: Uint8Array) => Promise<string>
      openCheckout: (url: string) => Promise<string>
      download: {
        enqueue: (payload: { input: string; format: string; quality: string; choreo?: string }) => Promise<void>
        control: (id: string, action: 'pause' | 'resume' | 'cancel' | 'retry') => void
        pauseAll: () => void
        clearDone: () => void
        defaults: () => Promise<{ dir: string }>
        chooseFolder: () => Promise<string | null>
        onEvent: (cb: (payload: DlEvent) => void) => () => void
      }
      media: {
        convert: (files: string[], target: string) => Promise<void>
        compress: (files: string[], level: 'leve' | 'medio' | 'forte') => Promise<void>
        slideshow: (inputs: string[], resolution: string, perPhoto: number, transition: string) => Promise<void>
        onEvent: (cb: (payload: MediaEvent) => void) => () => void
      }
      tools: {
        check: () => Promise<unknown>
      }
    }
  }
}
