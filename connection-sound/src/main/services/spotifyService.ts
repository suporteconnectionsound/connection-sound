// Lê metadados públicos do Spotify pela página de embed — SEM credencial/API/app.
// Funciona para faixa, playlist e álbum acessíveis por link (públicos ou não-públicos com link).
// Playlists "tornadas privadas" de verdade exigem login do dono e retornam null.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export interface SpTrack {
  title: string
  artist: string
}

export interface SpResult {
  kind: 'track' | 'playlist' | 'album'
  name: string
  cover?: string
  tracks: SpTrack[]
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyObj = Record<string, any>

export function parseSpotify(url: string): { type: 'track' | 'playlist' | 'album'; id: string } | null {
  const m = url.match(/(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?|spotify:)(track|playlist|album)[/:]([a-zA-Z0-9]+)/i)
  if (!m) return null
  return { type: m[1].toLowerCase() as 'track' | 'playlist' | 'album', id: m[2] }
}

async function fetchEntity(type: string, id: string): Promise<AnyObj | null> {
  const res = await fetch(`https://open.spotify.com/embed/${type}/${id}`, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
  const html = await res.text()
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return null
  try {
    const data = JSON.parse(m[1]) as AnyObj
    return data?.props?.pageProps?.state?.data?.entity ?? null
  } catch {
    return null
  }
}

function artistOf(item: AnyObj): string {
  if (item?.subtitle) return String(item.subtitle)
  if (Array.isArray(item?.artists)) {
    return item.artists
      .map((a: AnyObj) => a?.name)
      .filter(Boolean)
      .join(', ')
  }
  return ''
}

export async function resolveSpotify(url: string): Promise<SpResult | null> {
  const p = parseSpotify(url)
  if (!p) return null
  const ent = await fetchEntity(p.type, p.id)
  if (!ent || !ent.name) return null
  const cover: string | undefined = ent?.visualIdentity?.image?.[0]?.url

  if (p.type === 'track') {
    return { kind: 'track', name: ent.name, cover, tracks: [{ title: ent.name, artist: artistOf(ent) }] }
  }

  const list: AnyObj[] = Array.isArray(ent.trackList) ? ent.trackList : []
  const tracks: SpTrack[] = list
    .map((t) => ({ title: String(t.title || ''), artist: artistOf(t) }))
    .filter((t) => t.title)
  if (tracks.length === 0) return null
  return { kind: p.type === 'album' ? 'album' : 'playlist', name: ent.name, cover, tracks }
}
