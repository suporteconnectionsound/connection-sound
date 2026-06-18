import { useState, type FormEvent } from 'react'
import { IconPlayerPlayFilled, IconLoader2, IconMail, IconLock, IconUser } from '@tabler/icons-react'
import { useAuth } from '@/lib/auth'

function ptError(msg?: string): string {
  if (!msg) return 'Algo deu errado. Tente de novo.'
  const m = msg.toLowerCase()
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Esse e-mail já tem conta. Faça login.'
  if (m.includes('at least 6')) return 'A senha precisa de pelo menos 6 caracteres.'
  if (m.includes('invalid format') || m.includes('unable to validate email')) return 'E-mail inválido.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  return msg
}

export function Login(): JSX.Element {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const r = await signUp(email.trim(), password, name.trim())
        if (r.error) setError(ptError(r.error))
        else if (r.needsConfirm) setInfo('Conta criada! Confirme pelo link no seu e-mail e depois entre.')
      } else {
        const r = await signIn(email.trim(), password)
        if (r.error) setError(ptError(r.error))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="authpage">
      <form className="authcard" onSubmit={submit}>
        <div className="authlogo">
          <IconPlayerPlayFilled size={22} />
        </div>
        <h1>Connection Sound</h1>
        <p className="authsub">{mode === 'login' ? 'Entre na sua conta' : 'Crie sua conta — 3 dias grátis'}</p>

        {mode === 'signup' && (
          <label className="authfield">
            <IconUser size={17} />
            <input placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <label className="authfield">
          <IconMail size={17} />
          <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="authfield">
          <IconLock size={17} />
          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>

        {error && <div className="authmsg err">{error}</div>}
        {info && <div className="authmsg info">{info}</div>}

        <button className="authbtn" disabled={busy}>
          {busy ? <IconLoader2 size={18} className="spin" /> : mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>

        <div className="authtoggle">
          {mode === 'login' ? (
            <>
              Não tem conta?{' '}
              <span
                onClick={() => {
                  setMode('signup')
                  setError('')
                  setInfo('')
                }}
              >
                Criar agora
              </span>
            </>
          ) : (
            <>
              Já tem conta?{' '}
              <span
                onClick={() => {
                  setMode('login')
                  setError('')
                  setInfo('')
                }}
              >
                Entrar
              </span>
            </>
          )}
        </div>
      </form>
    </div>
  )
}
