import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { IconCheck, IconRefresh } from '@tabler/icons-react'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar } from '@/components/Sidebar'
import { AuthGate } from '@/components/AuthGate'
import { Tour } from '@/components/Tour'
import { useAuth } from '@/lib/auth'
import { Downloads } from '@/pages/Downloads'
import { RemoveBg } from '@/pages/RemoveBg'
import { Converter } from '@/pages/Converter'
import { Compressor } from '@/pages/Compressor'
import { Slideshow } from '@/pages/Slideshow'
import { Support } from '@/pages/Support'
import { Settings } from '@/pages/Settings'
import { Admin } from '@/pages/Admin'
import { Paywall } from '@/pages/Paywall'
import type { PageId } from '@/lib/pages'

interface ToastMsg {
  id: number
  name: string
}

// Mantém a página montada (só esconde) para o estado não se perder ao trocar de aba.
function PageBox({ show, children }: { show: boolean; children: ReactNode }): JSX.Element {
  return (
    <div className="pagebox" style={{ display: show ? 'flex' : 'none' }}>
      {children}
    </div>
  )
}

export default function App(): JSX.Element {
  const [page, setPage] = useState<PageId>('downloads')
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const [updateReady, setUpdateReady] = useState(false)
  const [showTour, setShowTour] = useState(false)
  const [showPaywall, setShowPaywall] = useState(false)
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
            <Sidebar current={page} onNavigate={setPage} onOpenPaywall={() => setShowPaywall(true)} />
            <section className="content">
              {/* Ferramentas ficam montadas: o que você fez fica salvo até fechar o app */}
              <PageBox show={page === 'downloads'}>
                <Downloads onToast={pushToast} />
              </PageBox>
              <PageBox show={page === 'bg'}>
                <RemoveBg />
              </PageBox>
              <PageBox show={page === 'conv'}>
                <Converter />
              </PageBox>
              <PageBox show={page === 'comp'}>
                <Compressor />
              </PageBox>
              <PageBox show={page === 'slide'}>
                <Slideshow />
              </PageBox>
              {page === 'set' && <Settings />}
              {page === 'sup' && <Support />}
              {page === 'admin' && <Admin />}
            </section>
          </div>
        </AuthGate>

        {showTour && hasAccess && (
          <Tour currentPage={page} onNavigate={setPage} onClose={finishTour} />
        )}

        {showPaywall && <Paywall onClose={() => setShowPaywall(false)} />}

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
