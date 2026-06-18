import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join, dirname, basename, extname } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { DownloadService, type EnqueuePayload } from './services/downloadService'
import { MediaService } from './services/mediaService'
import { checkTools } from './services/binaryManager'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null
let downloads: DownloadService | null = null
let media: MediaService | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#070709',
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  mainWindow = win

  win.on('ready-to-show', () => win.show())
  win.on('closed', () => {
    mainWindow = null
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  ipcMain.on('win:minimize', () => win.minimize())
  ipcMain.on('win:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()))
  ipcMain.on('win:close', () => win.close())

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const defaultDir = join(app.getPath('downloads'), 'Connection Sound')
  downloads = new DownloadService((payload) => {
    mainWindow?.webContents.send('download:event', payload)
  }, defaultDir)

  ipcMain.on('shell:open', (_e, url: unknown) => {
    if (typeof url === 'string' && /^(https?:|mailto:)/i.test(url)) shell.openExternal(url)
  })

  ipcMain.handle('download:enqueue', async (_e, payload: EnqueuePayload) => {
    await downloads?.enqueue(payload)
  })
  ipcMain.on('download:control', (_e, data: { id: string; action: 'pause' | 'resume' | 'cancel' | 'retry' }) => {
    downloads?.control(data.id, data.action)
  })
  ipcMain.on('download:pauseAll', () => downloads?.pauseAll())
  ipcMain.on('download:clearDone', () => downloads?.clearDone())
  ipcMain.handle('download:defaults', () => ({ dir: downloads?.getDir() ?? defaultDir }))
  ipcMain.handle('download:chooseFolder', async () => {
    if (!mainWindow) return null
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    downloads?.setDir(r.filePaths[0])
    return r.filePaths[0]
  })
  ipcMain.handle('tools:check', () => checkTools())

  media = new MediaService((payload) => {
    mainWindow?.webContents.send('media:event', payload)
  })
  ipcMain.handle('media:convert', (_e, d: { files: string[]; target: string }) => media?.convert(d.files, d.target))
  ipcMain.handle('media:compress', (_e, d: { files: string[]; level: 'leve' | 'medio' | 'forte' }) =>
    media?.compress(d.files, d.level)
  )
  ipcMain.handle('media:slideshow', (_e, d: { inputs: string[]; resolution: string; perPhoto: number; transition: string }) =>
    media?.slideshow(d.inputs, {
      resolution: d.resolution,
      perPhoto: d.perPhoto,
      transition: d.transition,
      outDir: defaultDir
    })
  )
  ipcMain.handle('dialog:pickFiles', async (_e, filters?: { name: string; extensions: string[] }[]) => {
    if (!mainWindow) return []
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'], filters })
    return r.canceled ? [] : r.filePaths
  })
  ipcMain.on('shell:openPath', (_e, p: unknown) => {
    if (typeof p === 'string') shell.openPath(p)
  })
  ipcMain.on('shell:showItem', (_e, p: unknown) => {
    if (typeof p === 'string') shell.showItemInFolder(p)
  })

  ipcMain.handle('file:read', (_e, p: string) => readFileSync(p))
  ipcMain.handle('bg:save', (_e, d: { src: string; bytes: Uint8Array }) => {
    const out = join(dirname(d.src), `${basename(d.src, extname(d.src))} (sem fundo).png`)
    writeFileSync(out, Buffer.from(d.bytes))
    return out
  })

  // Checkout da Stripe numa janela embutida (sem navegador externo).
  ipcMain.handle('billing:checkout', (_e, url: unknown) => {
    if (!mainWindow || typeof url !== 'string' || !/^https:\/\//i.test(url)) return Promise.resolve('error')
    return new Promise<string>((resolve) => {
      const win = new BrowserWindow({
        width: 480,
        height: 760,
        parent: mainWindow ?? undefined,
        modal: true,
        show: false,
        title: 'Pagamento — Connection Sound',
        backgroundColor: '#0b0b0e',
        autoHideMenuBar: true,
        webPreferences: { sandbox: true }
      })
      let done = false
      const finish = (result: string): void => {
        if (done) return
        done = true
        resolve(result)
        if (!win.isDestroyed()) win.close()
      }
      const inspect = (u: string): void => {
        if (u.includes('cs-success')) finish('success')
        else if (u.includes('cs-cancel')) finish('cancel')
      }
      win.webContents.on('will-redirect', (e, u) => {
        if (u.includes('cs-success') || u.includes('cs-cancel')) e.preventDefault()
        inspect(u)
      })
      win.webContents.on('will-navigate', (e, u) => {
        if (u.includes('cs-success') || u.includes('cs-cancel')) e.preventDefault()
        inspect(u)
      })
      win.on('closed', () => {
        if (!done) {
          done = true
          resolve('closed')
        }
      })
      win.once('ready-to-show', () => win.show())
      win.loadURL(url)
    })
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
