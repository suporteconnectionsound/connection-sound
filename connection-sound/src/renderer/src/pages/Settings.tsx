import { IconSettings } from '@tabler/icons-react'

export function Settings(): JSX.Element {
  return (
    <div className="suppage">
      <div className="suphead">
        <div className="dzicon">
          <IconSettings size={30} />
        </div>
        <h2>Configurações</h2>
        <p>
          Pasta de downloads, qualidade padrão, paralelismo, idioma e atualizações chegam junto com o motor de
          download e a conta (próximas fases).
        </p>
      </div>
    </div>
  )
}
