import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'

const api = {
  minimize: (): void => ipcRenderer.send('win:minimize'),
  maximize: (): void => ipcRenderer.send('win:maximize'),
  close: (): void => ipcRenderer.send('win:close'),
  openExternal: (url: string): void => ipcRenderer.send('shell:open', url),
  openPath: (p: string): void => ipcRenderer.send('shell:openPath', p),
  showItem: (p: string): void => ipcRenderer.send('shell:showItem', p),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  pickFiles: (filters?: { name: string; extensions: string[] }[]): Promise<string[]> =>
    ipcRenderer.invoke('dialog:pickFiles', filters),
  statFiles: (paths: string[]): Promise<{ path: string; size: number }[]> =>
    ipcRenderer.invoke('file:stat', paths),
  readFile: (path: string): Promise<Uint8Array> => ipcRenderer.invoke('file:read', path),
  bgSave: (src: string, bytes: Uint8Array): Promise<string> => ipcRenderer.invoke('bg:save', { src, bytes }),
  openCheckout: (url: string): Promise<string> => ipcRenderer.invoke('billing:checkout', url),
  installUpdate: (): void => ipcRenderer.send('update:install'),
  onUpdateDownloaded: (cb: () => void): (() => void) => {
    const l = (): void => cb()
    ipcRenderer.on('update:downloaded', l)
    return () => ipcRenderer.removeListener('update:downloaded', l)
  },

  download: {
    enqueue: (payload: { input: string; format: string; quality: string; choreo?: string }): Promise<void> =>
      ipcRenderer.invoke('download:enqueue', payload),
    control: (id: string, action: 'pause' | 'resume' | 'cancel' | 'retry'): void =>
      ipcRenderer.send('download:control', { id, action }),
    pauseAll: (): void => ipcRenderer.send('download:pauseAll'),
    clearDone: (): void => ipcRenderer.send('download:clearDone'),
    defaults: (): Promise<{ dir: string }> => ipcRenderer.invoke('download:defaults'),
    chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('download:chooseFolder'),
    onEvent: (cb: (payload: unknown) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: unknown): void => cb(payload)
      ipcRenderer.on('download:event', listener)
      return () => ipcRenderer.removeListener('download:event', listener)
    }
  },

  media: {
    convert: (files: string[], target: string): Promise<void> =>
      ipcRenderer.invoke('media:convert', { files, target }),
    compress: (files: string[], level: 'leve' | 'medio' | 'forte'): Promise<void> =>
      ipcRenderer.invoke('media:compress', { files, level }),
    slideshow: (inputs: string[], resolution: string, perPhoto: number, transition: string): Promise<void> =>
      ipcRenderer.invoke('media:slideshow', { inputs, resolution, perPhoto, transition }),
    onEvent: (cb: (payload: unknown) => void): (() => void) => {
      const listener = (_e: IpcRendererEvent, payload: unknown): void => cb(payload)
      ipcRenderer.on('media:event', listener)
      return () => ipcRenderer.removeListener('media:event', listener)
    }
  },

  tools: {
    check: (): Promise<unknown> => ipcRenderer.invoke('tools:check')
  }
}

contextBridge.exposeInMainWorld('cs', api)

export type CsApi = typeof api
