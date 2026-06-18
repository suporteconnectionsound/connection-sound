// Baixa os arquivos do modelo de remoção de fundo (@imgly/background-removal) para
// empacotar OFFLINE dentro do app. Pega só o modelo isnet_fp16 + o runtime ONNX.
// Os chunks são endereçados por hash; cada um precisa ter o tamanho exato do manifesto.
import { mkdir, writeFile, readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const VER = '1.7.0'
const BASE = `https://staticimgly.com/@imgly/background-removal-data/${VER}/dist/`
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'imgly')

// Recursos que o app realmente usa (modelo + runtime). Os demais modelos ficam de fora.
const WANTED = [
  '/models/isnet_fp16',
  '/onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm',
  '/onnxruntime-web/ort-wasm-simd-threaded.wasm',
  '/onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs',
  '/onnxruntime-web/ort-wasm-simd-threaded.mjs'
]

async function getJson(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`)
  return r.json()
}

async function downloadChunk(hash, expectedSize) {
  const dest = join(OUT, hash)
  if (existsSync(dest)) {
    const s = await stat(dest)
    if (s.size === expectedSize) return 'cache'
  }
  const r = await fetch(BASE + hash)
  if (!r.ok) throw new Error(`HTTP ${r.status} no chunk ${hash}`)
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length !== expectedSize) throw new Error(`Tamanho errado em ${hash}: ${buf.length} != ${expectedSize}`)
  await writeFile(dest, buf)
  return 'ok'
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const res = await getJson(BASE + 'resources.json')

  // grava o manifesto completo (o app só busca os chunks dos recursos que usa)
  await writeFile(join(OUT, 'resources.json'), JSON.stringify(res))

  const jobs = []
  for (const key of WANTED) {
    const entry = res[key]
    if (!entry) throw new Error(`Recurso ausente no manifesto: ${key}`)
    for (const c of entry.chunks) {
      const size = c.offsets[1] - c.offsets[0]
      jobs.push({ hash: c.name, size, key })
    }
  }

  console.log(`Total de chunks: ${jobs.length}`)
  let done = 0
  const POOL = 6
  let i = 0
  async function worker() {
    while (i < jobs.length) {
      const j = jobs[i++]
      const r = await downloadChunk(j.hash, j.size)
      done++
      if (done % 5 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length} (${r})`)
    }
  }
  await Promise.all(Array.from({ length: POOL }, worker))
  console.log('Concluído. Pasta:', OUT)
}

main().catch((e) => {
  console.error('ERRO:', e.message)
  process.exit(1)
})
