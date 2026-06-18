import { useCallback, useEffect, useRef, useState } from 'react'
import { IconCheck, IconRefresh } from '@tabler/icons-react'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar } from '@/components/Sidebar'
import { AuthGate } from '@/components/AuthGate'
import { Tour } from '@/components/Tour'
import { useAuth } from '@/lib/auth'
import { Downloads } from '@/pages/Downloads'
import { Tool } from '@/pages/Tool'
import { RemoveBg } from '@/pages/RemoveBg'
import { Converter } from '@/pages/Converter'
import { Compressor } from '@/pages/Compressor'
import { Slideshow } from '@/pages/Slideshow'
import { Support } from '@/pages/Support'
import { Settings } from '@/pages/Settings'
import { Admin } from '@/pages/Admin'
import { PAGES, type PageId } from '@/lib/pages'

interface ToastMsg {
  id: number
  name: string
}

export default function App(): JSX.Element {
  const [page, setPage] = useState<PageId>('downloads')
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const [updateReady, setUpdateReady] = useState(false)
  const [showTour, setShowTour] = useState(false)
  const toastId = useRef(0)
  const { user, hasAccess, loading } = useAuth()

  useEffect(() => window.cs.onUpdateDownloaded(() => setUpdateReady(true)), [])

  // Guia de primeiro uso: só na primeira vez que o usuário entra com acesso.
  useEffect(() => {
    if (loading || !user || !hasAccess) return
    const key = 'cs_onboarded_' + user.id
    if (!localStorage.getItem(key)) setShowTour(true)
  }, [loading, user, hasAccess])

  const finishTour = useCallback(() => {
    if (user) localStorage.setItem('cs_onboarded_' + user.id, '1')
    setShowTour(false)
  }, [user])

  const pushToast = useCallback((name: string) => {
    const id = toastId.current++
    setToasts((t) => [...t, { id, name }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  // Bloqueia o navegador de abrir arquivos soltos fora das zonas de drop.
  useEffect(() => {
    const prevent = (e: DragEvent): void => e.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  const current = PAGES.find((p) => p.id === page) as (typeof PAGES)[number]

  function renderPage(): JSX.Element {
    switch (page) {
      case 'downloads':
        return <Downloads onToast={pushToast} />
      case 'bg':
        return <RemoveBg />
      case 'conv':
        return <Converter />
      case 'comp':
        return <Compressor />
      case 'slide':
        return <Slideshow />
      case 'sup':
        return <Support />
      case 'set':
        return <Settings />
      case 'admin':
        return <Admin />
      default:
        return <Tool page={current} />
    }
  }

  return (
    <>
      <div className="aurora">
        <i className="a" />
        <i className="b" />
      </div>
      <div className="app">
        <TitleBar />
        <AuthGate>
          <div className="body">
            <Sidebar current={page} onNavigate={setPage} />
            <section className="content">{renderPage()}</section>
          </div>
        </AuthGate>

        {showTour && hasAccess && (
          <Tour currentPage={page} onNavigate={setPage} onClose={finishTour} />
        )}

        {updateReady && (
          <div className="updatebar">
            <span>
              <IconRefresh size={15} /> Atualização pronta
            </span>
            <button onClick={() => window.cs.installUpdate()}>Reiniciar agora</button>
          </div>
        )}

        <div className="toasts">
          {toasts.map((t) => (
            <div className="toast" key={t.id}>
              <div className="tic">
                <IconCheck size={18} />
              </div>
              <div className="tx">
                <b>Download concluído</b>
                <span>{t.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
