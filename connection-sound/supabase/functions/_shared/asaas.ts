// Wrapper fetch para a API do Asaas v3.
// Sandbox: https://sandbox.asaas.com/api/v3
// Produção: https://www.asaas.com/api/v3
// Auth: header `access_token: $aact_…` (NÃO usa Authorization: Bearer).

export const ASAAS_PLAN_PRICES: Record<string, { value: number; cycle: 'MONTHLY' | 'YEARLY'; label: string }> = {
  month: { value: 19.99, cycle: 'MONTHLY', label: 'Connection Sound Pro — Mensal' },
  year: { value: 119.99, cycle: 'YEARLY', label: 'Connection Sound Pro — Anual' }
}

export const ASAAS_PIX_PRICES: Record<string, { value: number; days: number; label: string }> = {
  month: { value: 19.99, days: 30, label: 'Connection Sound Pro — 30 dias (PIX)' },
  year: { value: 119.99, days: 365, label: 'Connection Sound Pro — 1 ano (PIX)' }
}

export interface AsaasEnv {
  apiKey: string
  baseUrl: string
}

export function asaasEnv(): AsaasEnv {
  const apiKey = Deno.env.get('ASAAS_API_KEY') ?? ''
  const env = (Deno.env.get('ASAAS_ENV') ?? 'sandbox').toLowerCase()
  const baseUrl = env === 'production' ? 'https://www.asaas.com/api/v3' : 'https://sandbox.asaas.com/api/v3'
  return { apiKey, baseUrl }
}

export class AsaasError extends Error {
  constructor(public status: number, public body: unknown, msg: string) {
    super(msg)
  }
}

/** Faz uma chamada à API do Asaas. Lê JSON quando possível. */
export async function asaas<T = unknown>(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | boolean | undefined> } = {}
): Promise<T> {
  const { apiKey, baseUrl } = asaasEnv()
  if (!apiKey) throw new AsaasError(500, null, 'ASAAS_API_KEY ausente no cofre')
  const url = new URL(baseUrl + path)
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v === undefined || v === null) continue
      url.searchParams.set(k, String(v))
    }
  }
  const headers = new Headers(init.headers)
  headers.set('access_token', apiKey)
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(url.toString(), { ...init, headers })
  const text = await res.text()
  let body: unknown = text
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    /* mantém string */
  }
  if (!res.ok) {
    const msg =
      (body && typeof body === 'object' && 'errors' in body && Array.isArray((body as { errors?: unknown[] }).errors)
        ? ((body as { errors: { description?: string }[] }).errors[0]?.description ?? '')
        : '') || `Asaas HTTP ${res.status}`
    throw new AsaasError(res.status, body, msg)
  }
  return body as T
}

/** Procura um cliente existente pelo e-mail. Asaas não tem GET por email —
 *  então buscamos e filtramos (em sandbox/produção normalmente há poucos). */
export async function findCustomerByEmail(email: string): Promise<string | null> {
  const res = await asaas<{ data?: { id: string; email?: string }[] }>('/customers', {
    query: { email, limit: 1 }
  })
  const found = (res.data ?? []).find((c) => (c.email ?? '').toLowerCase() === email.toLowerCase())
  return found?.id ?? null
}

export interface AsaasCustomer {
  id: string
  name: string
  email?: string
}

export async function ensureCustomer(email: string, name: string): Promise<string> {
  const existing = await findCustomerByEmail(email)
  if (existing) return existing
  const created = await asaas<AsaasCustomer>('/customers', {
    method: 'POST',
    body: JSON.stringify({ name, email })
  })
  return created.id
}
