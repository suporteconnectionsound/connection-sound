import type { PageDef } from '@/lib/pages'

export function Tool({ page }: { page: PageDef }): JSX.Element {
  const Icon = page.icon
  return (
    <div className="toolpage" key={page.id}>
      <div className="dropzone">
        <div className="dzicon">
          <Icon size={32} />
        </div>
        <h2>{page.title}</h2>
        <p>{page.desc}</p>
        <button className="dzbtn">Selecionar arquivos</button>
      </div>
    </div>
  )
}
