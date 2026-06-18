import { useCallback, useEffect, useRef, useState } from 'react'
import { IconCheck, IconCloudUpload } from '@tabler/icons-react'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar } from '@/components/Sidebar'
import { Downloads } from '@/pages/Downloads'
import { Tool } from '@/pages/Tool'
import { Support } from '@/pages/Support'
import { Settings } from '@/pages/Settings'
import { PAGES, type PageId } from '@/lib/pages'

interface ToastMsg {
  id: number
  name: string
}

export default function App(): JSX.Element {
  const [page, setPage] = useState<PageId>('downloads')
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const [dropping, setDropping] = useState(false)
  const dragCount = useRef(0)
  const toastId = useRef(0)

  const pushToast = useCallback((name: string) => {
    const id = toastId.current++
    setToasts((t) => [...t, { id, name }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  useEffect(() => {
    const onEnter = (e: DragEvent): void => {
      e.preventDefault()
      dragCount.current++
      setDropping(true)
    }
    const onOver = (e: DragEvent): void => e.preventDefault()
    const onLeave = (): void => {
      dragCount.current--
      if (dragCount.current <= 0) {
        dragCount.current = 0
        setDropping(false)
      }
    }
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      dragCount.current = 0
      setDropping(false)
      const f = e.dataTransfer?.files?.[0]
      pushToast(f ? f.name : 'Arquivo adicionado')
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [pushToast])

  const current = PAGES.find((p) => p.id === page) as (typeof PAGES)[number]

  return (
    <>
      <div className="aurora">
        <i className="a" />
        <i className="b" />
      </div>
      <div className="app">
        <TitleBar />
        <div className="body">
          <Sidebar current={page} onNavigate={setPage} />
          <section className="content">
            {page === 'downloads' ? (
              <Downloads onToast={pushToast} />
            ) : page === 'sup' ? (
              <Support />
            ) : page === 'set' ? (
              <Settings />
            ) : (
              <Tool page={current} />
            )}
          </section>
        </div>

        {dropping && (
          <div className="drop">
            <div className="dropcard">
              <IconCloudUpload size={46} />
              <b>Solte para adicionar</b>
              <span>Arquivos, fotos ou .zip</span>
            </div>
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
