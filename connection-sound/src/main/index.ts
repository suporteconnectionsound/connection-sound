import { app, BrowserWindow, ipcMain, shell, dialog, protocol } from 'electron'
import { join, dirname, basename, extname } from 'path'
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import { readFile } from 'fs/promises'
import { DownloadService, type EnqueuePayload } from './services/downloadService'
import { MediaService } from './services/mediaService'
import { checkTools } from './services/binaryManager'
import { autoUpdater } from 'electron-updater'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null
let downloads: DownloadService | null = null
let media: MediaService | null = null
let checkoutWindow: BrowserWindow | null = null

// Protocolo local para servir o modelo de remoção de fundo embutido (offline).
// Precisa ser registrado ANTES do app ficar pronto.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'csassets',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true }
  }
])

// Pasta com os arquivos do modelo (@imgly). Em produção via extraResources; em dev no projeto.
function imglyDir(): string {
  const candidates = [join(process.resourcesPath || '', 'imgly'), join(app.getAppPath(), 'resources', 'imgly')]
  for (const c of candidates) if (existsSync(c)) return c
  return candidates[0]
}

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

  // Bug fix: antes a janela só abria de verdade no ready-to-show, que em alguns sistemas
  // dispara antes do React pintar conteúdo (ou nunca dispara direito). Resultado: a
  // primeira abertura ficava em tela vazia até o usuário fechar e abrir de novo.
  // Estratégia: mostrar assim que o conteúdo terminar de carregar (did-finish-load),
  // com um fallback de segurança em ready-to-show e um timeout curto pra não prender.
  let firstShown = false
  const showNow = (): void => {
    if (firstShown || win.isDestroyed()) return
    firstShown = true
    if (!win.isVisible()) win.show()
    win.focus()
  }
  win.webContents.on('did-finish-load', showNow)
  win.once('ready-to-show', showNow)
  // Fallback duro: se nenhum evento disparar em 1.5s, mostra assim mesmo.
  setTimeout(showNow, 1500)

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
  // Serve os arquivos do modelo de remoção de fundo a partir do disco (sem internet).
  protocol.handle('csassets', async (request) => {
    try {
      const file = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '')
      const dir = imglyDir()
      const full = join(dir, file)
      if (!full.startsWith(dir)) return new Response('forbidden', { status: 403 })
      const data = await readFile(full)
      const type = file.endsWith('.json')
        ? 'application/json'
        : file.endsWith('.wasm')
          ? 'application/wasm'
          : file.endsWith('.mjs')
            ? 'text/javascript'
            : 'application/octet-stream'
      return new Response(new Uint8Array(data), {
        headers: { 'content-type': type, 'access-control-allow-origin': '*' }
      })
    } catch {
      return new Response('not found', { status: 404 })
    }
  })

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
  ipcMain.handle('file:stat', (_e, paths: unknown) => {
    if (!Array.isArray(paths)) return [] as { path: string; size: number }[]
    const out: { path: string; size: number }[] = []
    for (const p of paths) {
      if (typeof p !== 'string') continue
      try {
        out.push({ path: p, size: statSync(p).size })
      } catch {
        out.push({ path: p, size: 0 })
      }
    }
    return out
  })
  ipcMain.handle('bg:save', (_e, d: { src: string; bytes: Uint8Array }) => {
    const out = join(dirname(d.src), `${basename(d.src, extname(d.src))} (sem fundo).png`)
    writeFileSync(out, Buffer.from(d.bytes))
    return out
  })

  // Checkout da Stripe numa janela embutida (sem navegador externo).
  ipcMain.handle('billing:checkout', (_e, url: unknown) => {
    if (!mainWindow || typeof url !== 'string' || !/^https:\/\//i.test(url)) return Promise.resolve('error')
    // Já existe um checkout aberto? Foca nele e ignora o pedido duplicado (evita várias janelas).
    if (checkoutWindow && !checkoutWindow.isDestroyed()) {
      checkoutWindow.focus()
      return Promise.resolve('cancel')
    }
    return new Promise<string>((resolve) => {
      const win = new BrowserWindow({
        width: 480,
        height: 760,
        parent: mainWindow ?? undefined,
        // NÃO usar modal: janela modal que demora a carregar congela o app inteiro.
        show: false,
        title: 'Pagamento — Connection Sound',
        backgroundColor: '#0b0b0e',
        autoHideMenuBar: true,
        webPreferences: { sandbox: true }
      })
      checkoutWindow = win
      let done = false
      let shown = false
      let loadGuard: ReturnType<typeof setTimeout>

      const showWin = (): void => {
        if (!win.isDestroyed() && !shown) {
          shown = true
          win.show()
        }
      }
      const finish = (result: string): void => {
        if (done) return
        done = true
        clearTimeout(loadGuard)
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
      // Página carregou: mostra a janela e cancela a trava (o usuário pode demorar pagando).
      win.webContents.on('did-finish-load', () => {
        showWin()
        clearTimeout(loadGuard)
      })
      // Falha real de carregamento (ignora ERR_ABORTED = -3, que ocorre nos redirects que cancelamos).
      win.webContents.on('did-fail-load', (_e, code, _desc, _u, isMainFrame) => {
        if (isMainFrame && code !== -3) finish('error')
      })
      win.on('closed', () => {
        checkoutWindow = null
        clearTimeout(loadGuard)
        if (!done) {
          done = true
          resolve('closed')
        }
      })
      win.once('ready-to-show', showWin)
      // Garante exibição mesmo se ready-to-show demorar, e nunca deixa o botão preso.
      setTimeout(showWin, 1500)
      loadGuard = setTimeout(() => finish('error'), 25000)
      win.loadURL(url).catch(() => finish('error'))
    })
  })

  ipcMain.on('update:install', () => autoUpdater.quitAndInstall())

  createWindow()

  if (!isDev) {
    autoUpdater.on('update-downloaded', () => mainWindow?.webContents.send('update:downloaded'))
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
