import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const api = {
  minimize: (): void => ipcRenderer.send('win:minimize'),
  maximize: (): void => ipcRenderer.send('win:maximize'),
  close: (): void => ipcRenderer.send('win:close'),
  openExternal: (url: string): void => ipcRenderer.send('shell:open', url),

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

  tools: {
    check: (): Promise<unknown> => ipcRenderer.invoke('tools:check')
  }
}

contextBridge.exposeInMainWorld('cs', api)

export type CsApi = typeof api
