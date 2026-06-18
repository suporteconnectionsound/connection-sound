import { useLayoutEffect, useRef, useState } from 'react'
import { PAGES, type PageDef, type PageId } from '@/lib/pages'

const GROUPS: PageDef['group'][] = ['Biblioteca', 'Ferramentas', 'Conta']

interface Props {
  current: PageId
  onNavigate: (id: PageId) => void
}

export function Sidebar({ current, onNavigate }: Props): JSX.Element {
  const navRef = useRef<HTMLElement>(null)
  const [ind, setInd] = useState({ y: 0, h: 40, visible: false })

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
            {PAGES.filter((p) => p.group === group).map((p) => {
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
          <div className="av">DL</div>
          <div>
            <div className="nm">David</div>
            <div className="sub">12 faixas baixadas</div>
          </div>
        </div>
        <div className="trialbar">
          <i />
        </div>
        <div className="tt">
          Teste termina em <b>2 dias</b>
        </div>
        <button className="btn-acc">Assinar Pro</button>
      </div>
    </aside>
  )
}
