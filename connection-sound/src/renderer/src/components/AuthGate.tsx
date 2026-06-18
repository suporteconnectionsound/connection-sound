import type { ReactNode } from 'react'
import { IconLoader2 } from '@tabler/icons-react'
import { useAuth } from '@/lib/auth'
import { Login } from '@/pages/Login'
import { Paywall } from '@/pages/Paywall'

export function AuthGate({ children }: { children: ReactNode }): JSX.Element {
  const { loading, session, hasAccess } = useAuth()

  if (loading) {
    return (
      <div className="authpage">
        <IconLoader2 size={30} className="spin" style={{ color: 'var(--acc)' }} />
      </div>
    )
  }
  if (!session) return <Login />
  if (!hasAccess) return <Paywall />
  return <>{children}</>
}
