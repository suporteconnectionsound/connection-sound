import { IconBrandWhatsapp, IconMail, IconHeadphones } from '@tabler/icons-react'

const WHATS = '5561992437695'
const EMAIL = 'suporteconnectionsound@gmail.com'

export function Support(): JSX.Element {
  const waUrl =
    'https://wa.me/' + WHATS + '?text=' + encodeURIComponent('Olá! Preciso de ajuda com o Connection Sound.')

  return (
    <div className="suppage">
      <div className="suphead">
        <div className="dzicon">
          <IconHeadphones size={30} />
        </div>
        <h2>Suporte</h2>
        <p>Estamos aqui pra ajudar. A resposta mais rápida é pelo WhatsApp.</p>
      </div>

      <div className="supgrid">
        <button className="supcard" onClick={() => window.cs.openExternal(waUrl)}>
          <div className="supicon wa">
            <IconBrandWhatsapp size={24} />
          </div>
          <div className="suptext">
            <b>WhatsApp</b>
            <span>(61) 99243-7695</span>
          </div>
          <span className="supcta">Conversar →</span>
        </button>

        <button className="supcard" onClick={() => window.cs.openExternal('mailto:' + EMAIL)}>
          <div className="supicon">
            <IconMail size={22} />
          </div>
          <div className="suptext">
            <b>E-mail</b>
            <span>{EMAIL}</span>
          </div>
          <span className="supcta">Enviar →</span>
        </button>
      </div>
    </div>
  )
}
