import type { ReactNode } from 'react'
import { IconLoader2 } from '@tabler/icons-react'
import { useAuth } from '@/lib/auth'
import { Login } from '@/pages/Login'
import { Paywall } from '@/pages/Paywall'

// Em modo dev (npm run dev) pula a autenticação para facilitar testes locais.
const DEV_SKIP = import.meta.env.DEV

export function AuthGate({ children }: { children: ReactNode }): JSX.Element {
  const { loading, dataReady, session, hasAccess } = useAuth()

  if (DEV_SKIP) return <>{children}</>

  if (loading) {
    return (
      <div className="authpage">
        <IconLoader2 size={30} className="spin" style={{ color: 'var(--acc)' }} />
      </div>
    )
  }
  if (!session) return <Login />
  // Tem sessão mas os dados ainda não carregaram → espera (não mostra paywall por engano).
  if (!dataReady) {
    return (
      <div className="authpage">
        <IconLoader2 size={30} className="spin" style={{ color: 'var(--acc)' }} />
      </div>
    )
  }
  if (!hasAccess) return <Paywall />
  return <>{children}</>
}
