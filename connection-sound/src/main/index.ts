import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { DownloadService, type EnqueuePayload } from './services/downloadService'
import { checkTools } from './services/binaryManager'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null
let downloads: DownloadService | null = null

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

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
