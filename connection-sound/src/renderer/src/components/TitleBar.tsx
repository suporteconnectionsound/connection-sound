import { IconPlayerPlayFilled } from '@tabler/icons-react'

export function TitleBar(): JSX.Element {
  return (
    <div className="titlebar">
      <div className="brand">
        <span className="logo">
          <IconPlayerPlayFilled size={11} />
        </span>
        <b>Connection Sound</b>
      </div>
      <div className="winbtns">
        <span className="c1" onClick={() => window.cs.minimize()} title="Minimizar" />
        <span className="c2" onClick={() => window.cs.maximize()} title="Maximizar" />
        <span className="c3" onClick={() => window.cs.close()} title="Fechar" />
      </div>
    </div>
  )
}
