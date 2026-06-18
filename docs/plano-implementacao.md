# Connection Sound — Plano de Implementação

Plano fase a fase. Cada fase tem tarefas, arquivos-chave e **critério de pronto** (precisa estar funcionando e testado antes de avançar).

Stack confirmada: **electron-vite + React + TypeScript + Tailwind + Framer Motion + Zustand**, binários `yt-dlp`/`ffmpeg`/`aria2c`, IA local de fundo (ONNX), Supabase, Stripe, GitHub Releases, empacotamento `electron-builder` (NSIS offline).

---

## Estrutura de pastas do app

```
connection-sound/
├─ electron/
│  ├─ main/            # processo principal, janela, ciclo de vida
│  ├─ preload/         # bridge IPC tipada
│  └─ services/        # download, spotify, choreography, media, slideshow,
│                      # auth, billing, sync, update, binaries
├─ src/                # renderer (React)
│  ├─ design/          # tokens, tema, estilos globais
│  ├─ components/      # TitleBar, Sidebar, SearchBar, QueueCard, DropZone…
│  ├─ pages/           # Downloads, RemoveBg, Converter, Compressor,
│  │                   # Slideshow, Settings, Support, Auth, Paywall
│  ├─ store/           # estado (Zustand)
│  └─ lib/             # cliente IPC, formatadores
├─ resources/          # icon.png, bin/ (binários), models/ (ONNX)
├─ tests/              # unit, integração, e2e
├─ electron-builder.yml
├─ electron.vite.config.ts
└─ package.json
```

---

## Fase 1 — Fundação e design system  ✅ critério: app abre com a casca animada da v2
- [ ] Scaffold electron-vite + React + TS; ESLint + Prettier.
- [ ] Tailwind + tokens de design (cores, tipografia Inter/JetBrains Mono, raios, sombras, easings) extraídos do protótipo aprovado.
- [ ] Janela custom (frameless) + controles (min/max/close) + aurora de fundo.
- [ ] `TitleBar`, `Sidebar` (nav com indicador deslizante), layout base, sistema de `toasts`, drag-and-drop global.
- [ ] Roteamento entre páginas (placeholder nas ainda não feitas).
- [ ] Componentes base: botões, segmented control, chips, inputs com foco animado.
- **Pronto quando:** `npm run dev` abre a janela idêntica ao protótipo, navegação e animações funcionando.

## Fase 2 — Motor de download (YouTube + busca por nome)  ✅
- [ ] `BinaryManager`: localiza/baixa/valida `yt-dlp`, `ffmpeg`, `aria2c` (checksum SHA-256).
- [ ] `DownloadService`: fila com concorrência, máquina de estados por item, eventos de progresso via IPC.
- [ ] Parsing de progresso do yt-dlp/ffmpeg (%, velocidade, ETA, fase).
- [ ] Busca por nome (resultados com capa/título/duração) + prévia de confirmação ao colar link.
- [ ] MP3 (bitrate) / MP4 (resolução) + tags id3 + capa.
- [ ] Playlist → cria pasta com nome da playlist.
- [ ] Verificação final por `ffprobe` (não marca erro em item em andamento) + relatório de lote + reprocessar falhas.
- [ ] Tratamento de erros (região, link morto, rate-limit, sem internet, disco cheio, duplicata) com ação clara.
- [ ] Ações por item e em lote; histórico (aba Concluídos).
- **Pronto quando:** baixa em paralelo vídeos de teste (Creative Commons), converte, verifica e trata erros — com testes.

## Fase 3 — Spotify (metadados) + Coreografia  ✅
- [ ] `SpotifyService`: client-credentials, metadados de faixa/playlist, casamento com YouTube.
- [ ] `ChoreographyRanker`: pontuação (resolução, áudio, duração, canal, palavras-chave, engajamento) + fallback p/ versão normal.
- [ ] Lista mantida de canais profissionais como sinal de ranking.
- **Pronto quando:** baixar playlist do Spotify gera pasta + faixas certas; modo coreografia escolhe bom vídeo ou cai no fallback — com testes do ranker.

## Fase 4 — Ferramentas de mídia  ✅
- [ ] `MediaService.removeBackground` (ONNX local) — lote + prévia.
- [ ] `MediaService.convert` (ffmpeg/sharp) — áudio/vídeo/imagem.
- [ ] `MediaService.compress` — vídeo H.265/AV1, imagem sem perda, WAV→FLAC; "antes→depois".
- [ ] `SlideshowService` — fundo desfocado da própria imagem, foto centralizada sem corte, resolução escolhível, transições xfade, export MP4/GIF.
- [ ] Drag-and-drop (arquivos e .zip) em todas as ferramentas.
- **Pronto quando:** cada ferramenta processa arquivos reais corretamente — com testes de integração.

## Fase 5 — Contas, trial e pagamento  ✅
- [ ] Supabase: tabelas (`profiles`, `subscriptions`, `devices`, `download_history`, `settings`) + RLS.
- [ ] `AuthService`: e-mail/senha + Google; sessão persistida.
- [ ] Lógica de trial (3 dias, sem cartão) + paywall + cache offline assinado.
- [ ] `BillingService`: criar produtos/preços na Stripe; Checkout embutido (BrowserWindow).
- [ ] Edge Function `stripe-webhook` (verifica assinatura, atualiza `subscriptions`). **Entregar URL do webhook.**
- [ ] `SyncService`: histórico/preferências ↔ Supabase.
- **Pronto quando:** cadastro → trial → paywall → pagamento de teste → status ativo, tudo sincronizado.

## Fase 6 — Auto-update + instalador offline  ✅
- [ ] `electron-builder.yml` (NSIS, offline, bundla binários + modelo).
- [ ] Verificação de integridade no 1º uso (checksums) + reparo.
- [ ] `UpdateService` (electron-updater) + publish no GitHub Releases + botão "Atualizar".
- **Pronto quando:** instalador único instala offline; app detecta e aplica update de teste.

## Fase 7 — Suporte, polimento, testes finais  ✅
- [ ] Página de Suporte (WhatsApp/e-mail, FAQ, exportar log).
- [ ] Aviso de uso responsável (1º uso).
- [ ] Passe de polimento de animações/microcopy/acessibilidade (WCAG AA).
- [ ] Suíte E2E (Playwright Electron) dos fluxos principais + checklist de QA.
- **Pronto quando:** suíte de testes verde e QA manual sem erros.

---

## Contas necessárias (Fases 5–6)
Supabase (URL + anon + service_role), Stripe (secret + publishable), GitHub (repo de releases). Guio a criação na hora.

## Versionamento
Git inicializado no repositório; commits por fase/feature.
