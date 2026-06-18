import { useLayoutEffect, useRef, useState } from 'react'
import { IconLogout } from '@tabler/icons-react'
import { PAGES, type PageDef, type PageId } from '@/lib/pages'
import { useAuth } from '@/lib/auth'
import { ADMIN_EMAIL } from '@/lib/admin'

const GROUPS: PageDef['group'][] = ['Biblioteca', 'Ferramentas', 'Conta']

interface Props {
  current: PageId
  onNavigate: (id: PageId) => void
  onOpenPaywall: () => void
}

export function Sidebar({ current, onNavigate, onOpenPaywall }: Props): JSX.Element {
  const navRef = useRef<HTMLElement>(null)
  const [ind, setInd] = useState({ y: 0, h: 40, visible: false })
  const { profile, user, isPro, trialDaysLeft, signOut } = useAuth()
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Você'
  const initials = displayName.slice(0, 2).toUpperCase()
  const trialPct = isPro ? 100 : Math.min(100, Math.max(0, (trialDaysLeft / 3) * 100))
  const isAdmin = (user?.email ?? '').toLowerCase() === ADMIN_EMAIL

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const active = nav.querySelector<HTMLElement>(`a[data-id="${current}"]`)
    if (!active) {
      setInd((s) => ({ ...s, visible: false }))
      return
    }
    const navBox = nav.getBoundingClientRect()
    const box = active.getBoundingClientRect()
    setInd({ y: box.top - navBox.top, h: box.height, visible: true })
  }, [current])

  return (
    <aside className="sidebar">
      <nav className="nav" ref={navRef}>
        <div
          className="nav-indicator"
          style={{ transform: `translateY(${ind.y}px)`, height: ind.h, opacity: ind.visible ? 1 : 0 }}
        />
        {GROUPS.map((group) => (
          <div className="navgroup" key={group}>
            <div className="lbl">{group}</div>
            {PAGES.filter((p) => p.group === group && (p.id !== 'admin' || isAdmin)).map((p) => {
              const Icon = p.icon
              return (
                <a
                  key={p.id}
                  data-id={p.id}
                  className={current === p.id ? 'on' : ''}
                  onClick={() => onNavigate(p.id)}
                >
                  <Icon size={18} />
                  {p.label}
                </a>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="account">
        <div className="row">
          <div className="av">{initials}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="nm">{displayName}</div>
            <div className="sub">{isPro ? 'Connection Sound Pro' : `Teste · ${trialDaysLeft} ${trialDaysLeft === 1 ? 'dia' : 'dias'}`}</div>
          </div>
          <button className="logout" onClick={signOut} title="Sair">
            <IconLogout size={15} />
          </button>
        </div>
        {isPro ? (
          <div className="tt" style={{ marginTop: 8 }}>Assinatura ativa ✓</div>
        ) : (
          <>
            <div className="trialbar">
              <i style={{ width: trialPct + '%' }} />
            </div>
            <div className="tt">
              {trialDaysLeft > 0 ? (
                <>
                  Teste termina em <b>{trialDaysLeft} {trialDaysLeft === 1 ? 'dia' : 'dias'}</b>
                </>
              ) : (
                'Teste terminado'
              )}
            </div>
            <button className="btn-acc" onClick={onOpenPaywall}>Assinar Pro</button>
          </>
        )}
      </div>
    </aside>
  )
}
