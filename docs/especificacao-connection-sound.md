# Connection Sound — Especificação Técnica

**Versão:** 1.0 (rascunho para revisão)
**Data:** 2026-06-17
**Plataforma:** Windows 10/11 (desktop)
**Custo de infraestrutura:** R$ 0 (planos gratuitos + binários open source)

---

## 1. Visão geral

Connection Sound é um **kit de mídia desktop** com visual premium (tema escuro, glassmorphism, animações), vendido por assinatura. Reúne:

1. **Downloader** de áudio/vídeo a partir de link (Spotify/YouTube/outras) ou busca por nome.
2. **Modo Coreografia** (vídeo de dança de qualidade, com detecção automática).
3. **Remover fundo** de imagens (IA local).
4. **Conversor** de formatos.
5. **Compressor** inteligente.
6. **Slideshow** estilo "app Fotos" (foto centralizada + fundo desfocado, sem cortar).
7. **Assinatura** (trial 3 dias → R$ 19,99/mês ou R$ 119,99/ano) via Stripe.
8. **Sync** de conta/histórico/preferências no Supabase.
9. **Auto-update** via GitHub Releases.
10. **Página de suporte** (WhatsApp + e-mail).

### 1.1 Escopo e uso legítimo (importante)

A tecnologia de download é de **uso geral** (yt-dlp/ffmpeg, open source). O produto é posicionado e construído para baixar **conteúdo que o usuário tem direito de baixar**: material livre de royalties, domínio público, Creative Commons, podcasts, os próprios uploads do usuário e conteúdo licenciado.

- **Não** será implementado nada que quebre DRM (o áudio do Spotify é criptografado e não é acessado; usamos apenas os **metadados públicos** da API oficial do Spotify, e o download de áudio vem do YouTube por responsabilidade do usuário).
- O app exibirá um **aviso de uso responsável**/termos no primeiro uso, deixando claro que o usuário é responsável por respeitar direitos autorais e os termos das plataformas.

Essa fundação mantém o mesmo craft, a mesma fila e a mesma engenharia, sem depender de circumvenção de proteção.

---

## 2. Stack técnica

| Camada | Tecnologia | Por quê |
|---|---|---|
| Shell desktop | **Electron** | Empacota binários, auto-update pronto, janela custom, webview p/ checkout |
| UI | **React + TypeScript + Vite** | Componentização, tipagem, build rápido |
| Estilo | **Tailwind CSS** + CSS custom | Design system consistente |
| Animações | **Framer Motion** | Shared layout, transições, micro-interações |
| Download | **yt-dlp** (binário) + **aria2c** | Download rápido e robusto, multi-plataforma |
| Mídia | **ffmpeg / ffprobe** (binário) | Conversão, compressão, slideshow, verificação |
| Metadados Spotify | **Spotify Web API** (client credentials) | Nome/artista/capa/ordem da playlist |
| Tags MP3 | **node-id3** | Gravar título/artista/capa no arquivo |
| Remover fundo | **@imgly/background-removal-node** (ONNX local) | 100% local, sem servidor, sem Python |
| Imagens | **sharp** (libvips) + mozjpeg/oxipng | Conversão e compressão sem perda |
| Banco/Auth | **Supabase** (Postgres, Auth, Storage, Edge Functions) | Grátis, login e-mail/senha + Google, webhook |
| Pagamento | **Stripe** (Checkout embutido) | Assinaturas, trial, segurança PCI |
| Atualização | **electron-updater + GitHub Releases** | Auto-update grátis e robusto |
| Empacotamento | **electron-builder** (NSIS, offline) | Instalador único `.exe` |
| Testes | **Vitest** + **Playwright (Electron)** | Unit, integração e e2e reais |

**Decisão-chave:** tudo em **Node/Electron, sem Python**, para um instalador offline confiável.

---

## 3. Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│ Renderer (React)  — UI, animações, estado visual         │
│   páginas: Downloads, Remover fundo, Conversor,          │
│            Compressor, Slideshow, Config, Suporte, Auth  │
└───────────────▲──────────────────────────────────────────┘
                │  IPC tipado (preload bridge)
┌───────────────▼──────────────────────────────────────────┐
│ Main process — serviços isolados                          │
│   • DownloadService (fila, workers, estado por item)      │
│   • SpotifyService (metadados)                            │
│   • ChoreographyRanker (pontuação de vídeos)              │
│   • MediaService (converter/comprimir/remover fundo)      │
│   • SlideshowService (ffmpeg filtergraph)                 │
│   • AuthService (Supabase)                                │
│   • BillingService (Stripe checkout + status)             │
│   • SyncService (histórico/preferências ↔ Supabase)       │
│   • UpdateService (electron-updater)                      │
│   • BinaryManager (localiza/valida yt-dlp, ffmpeg)        │
└───────────────────────────────────────────────────────────┘
        │ child_process            │ HTTPS
   yt-dlp / ffmpeg            Supabase / Stripe / GitHub
```

Cada serviço tem **uma responsabilidade**, interface tipada e é testável isoladamente.

---

## 4. Módulos detalhados

### 4.1 Motor de download
- **Fila com concorrência configurável** (padrão 3–4 simultâneos; `p-limit`/pool de workers). O botão **Baixar nunca trava**: cada item entra como tarefa independente.
- **Máquina de estados por item:** `na fila → buscando → baixando → convertendo → verificando → concluído | erro | pausado | cancelado`.
- **Entrada:** link Spotify, link YouTube, link de outras plataformas suportadas pelo yt-dlp, ou texto (busca).
  - **Texto** → busca no YouTube e mostra resultados (capa/título/artista/duração) para confirmar antes de baixar.
  - **Link** → detecta a fonte e mostra prévia para confirmação.
- **Spotify:** Spotify Web API busca metadados (faixa/playlist); para cada faixa, casa com o melhor resultado no YouTube (título + artista + duração) e baixa via yt-dlp; grava tags + capa.
- **Playlist:** cria **pasta com o nome da playlist** e baixa tudo dentro.
- **Formato:** MP3 (com bitrate selecionável, padrão 320 kbps) ou MP4 (resolução selecionável, padrão "melhor até 1080p"). Conversão por ffmpeg.
- **Progresso ao vivo:** parsing do stdout do yt-dlp/ffmpeg → % , velocidade, ETA, fase (baixando/convertendo).
- **Verificação final:** ao terminar, `ffprobe` confere se o arquivo tem stream válido e duração coerente. **Itens ainda em andamento nunca são marcados como erro.** Relatório de lote: "X ok · Y com erro" e botão **Reprocessar** só os que falharam.
- **Erros tratados com mensagem clara + ação:** link morto, faixa bloqueada por região, formato indisponível, rate-limit/throttling, sem internet, disco cheio, duplicata ("já baixado, baixar de novo?").
- **Ações por item:** pausar, retomar, cancelar, repetir, abrir na pasta, rebaixar em outra qualidade. Ações em lote: pausar tudo, cancelar tudo, limpar concluídos.
- **Histórico:** aba "Concluídos" com busca; sincronizado no Supabase.
- **Performance:** aria2c para download segmentado; concorrência; cache de token Spotify; busca de metadados em paralelo.

### 4.2 Modo Coreografia (detecção automática)
Quando MP4 + Coreografia, busca candidatos no YouTube ("<música> coreografia / dance") e **pontua** cada um:
- **Resolução** (≥720p ganha pontos; <480p penaliza forte).
- **Qualidade de áudio** (bitrate/codec; descarta gravação ao vivo de celular/áudio ruim).
- **Duração** coerente com a faixa (±25%).
- **Canal** (reforço para canais profissionais conhecidos — FitDance, Daniel Saboya, etc. — via lista mantida como **sinal de ranking**, não como filtro fixo).
- **Palavras-chave** no título (coreografia, choreography, dança, dance).
- **Engajamento** (views/likes) como desempate.
- **Limite mínimo de qualidade:** se nenhum candidato passa, **baixa a versão normal** (oficial/áudio) automaticamente, avisando o usuário.

### 4.3 Remover fundo
- Arrasta imagens ou `.zip` → IA local (`@imgly/background-removal-node`, modelo ONNX empacotado) recorta o fundo.
- Saída PNG transparente; lote suportado; prévia antes/depois.

### 4.4 Conversor de formatos
- Áudio/vídeo via ffmpeg (MP3, MP4, WAV, FLAC, AAC, MKV, MOV, etc.); imagens via sharp (PNG, JPG, WEBP).
- Drag-and-drop, lote, escolha de qualidade.

### 4.5 Compressor inteligente
- **Vídeo:** re-encode H.265/AV1 (CRF ajustável) → grande redução com perda imperceptível; alvo de tamanho opcional.
- **Imagem:** compressão **100% sem perda** (oxipng/zopfli para PNG, mozjpeg para JPG) + opção com perda controlada.
- **Áudio:** WAV→FLAC (sem perda) ou re-encode com bitrate.
- Mostra "antes → depois" com % de economia. Rótulos honestos (sem prometer "zero perda" onde não é possível).

### 4.6 Slideshow
- Arrasta fotos ou `.zip` (descompacta automaticamente).
- Para cada foto: **fundo = a própria imagem ampliada e desfocada** (boxblur) cobrindo o quadro; **frente = imagem inteira centralizada, sem corte** (scale "contain").
- **Resolução escolhível** (720p, 1080p, 1440p, 4K) e duração por foto.
- Transições suaves (xfade) entre fotos.
- Exporta **MP4** (e GIF opcional). Sem música (decisão do projeto).
- Renderização via filtergraph único do ffmpeg.

---

## 5. Contas, trial e pagamento

### 5.1 Autenticação (Supabase Auth)
- E-mail/senha **+ "Entrar com Google"**.
- Sessão persistida; revalida ao abrir.

### 5.2 Modelo de dados (Supabase / Postgres)
- `profiles` — id (=auth user), nome, email, `trial_started_at`, `trial_ends_at`, criado_em.
- `subscriptions` — user_id, stripe_customer_id, stripe_subscription_id, status (`trialing|active|past_due|canceled`), price_id, current_period_end.
- `devices` — user_id, device_id, nome, last_seen (controle de PCs e do botão de update por máquina).
- `download_history` — user_id, título, fonte, formato, status, criado_em (sync entre PCs).
- `settings` — user_id, pasta padrão, qualidade, concorrência, idioma.
- Row Level Security (RLS) ligado: cada usuário só lê/escreve o que é seu.

### 5.3 Trial (sem cartão)
- No cadastro: `trial_ends_at = now() + 3 dias`.
- App libera tudo enquanto `subscription.status = active` **ou** trial válido.
- Ao expirar (trial vencido e sem assinatura): **paywall** bloqueia o uso, mostrando os planos e o que o Pro destrava. Upgrade sugerido em momentos naturais (após lote concluído), nunca pop-up irritante.
- Validação **server-side** (consulta Supabase); cache local curto (assinado) para tolerância offline.

### 5.4 Stripe
- **Produtos/preços** (eu crio via API com a sua chave secreta):
  - Produto "Connection Sound Pro"
  - Preço mensal: **R$ 19,99 BRL**, recorrente mensal.
  - Preço anual: **R$ 119,99 BRL**, recorrente anual.
- **Checkout embutido:** o app abre uma `BrowserWindow` interna carregando a Stripe Checkout Session (sem navegador externo). A Stripe cuida da segurança do cartão (PCI).
- **Webhook (Supabase Edge Function `stripe-webhook`):** verifica assinatura do Stripe e trata:
  - `checkout.session.completed` → cria/atualiza `subscriptions`.
  - `customer.subscription.updated` / `deleted` → atualiza status.
  - `invoice.payment_failed` → marca `past_due`.
  - **Eu te entrego a URL do webhook** (formato `https://<projeto>.supabase.co/functions/v1/stripe-webhook`) para você colar no painel da Stripe.

---

## 6. Auto-update (GitHub Releases)
- App publicado com `electron-builder` no **GitHub Releases** (repositório seu, gratuito).
- `electron-updater` checa nova versão ao abrir; mostra **botão "Atualizar"**; baixa em segundo plano e instala ao reiniciar.
- **Onde/como (te explico no passo a passo):** criar conta GitHub → criar repositório → eu configuro o publish; cada nova versão = um `release` que todos os PCs detectam sozinhos.

---

## 7. Instalador único (offline)
- **`electron-builder` NSIS**, modo **offline**: um único `.exe` que já traz **tudo** — app, `yt-dlp.exe`, `ffmpeg.exe`/`ffprobe.exe`, `aria2c.exe`, modelo ONNX de remoção de fundo. Instala sem internet.
- **Verificação de integridade:** checksums (SHA-256) de cada binário conferidos no primeiro uso ("verificação de download"). Se algo faltar/corromper, o app baixa/repara o componente e avisa.
- Atalhos no menu iniciar/desktop; desinstalador limpo.
- **Aviso honesto:** sem certificado de assinatura de código (~US$200/ano), o Windows mostra o aviso SmartScreen na 1ª instalação ("Mais informações → Executar assim mesmo"). Dá pra lançar 100% grátis assim.

---

## 8. Suporte
- Página dedicada: **WhatsApp (61) 99243-7695** e **suporteconnectionsound@gmail.com**, com botões de copiar/abrir, FAQ e link "reportar problema" (gera log do app).

---

## 9. Estratégia de testes (testes reais)
- **Unit (Vitest):** ranker de coreografia, máquina de estados, parsing de progresso, formatação, lógica de trial/paywall.
- **Integração:** download real de assets **Creative Commons/domínio público** de teste; conversão; remoção de fundo; slideshow; verificação por ffprobe.
- **E2E (Playwright for Electron):** fluxos de download, paywall, login, ferramentas, drag-and-drop.
- **Checklist de QA manual** por release + verificação de erros/estados de borda.

---

## 10. Ordem de construção (fases)
1. **Fundação:** projeto Electron+React+TS, design system (cores, tipografia, componentes, animações da v2 aprovada), casca (janela, sidebar, nav deslizante, drag-and-drop global, toasts).
2. **Motor de download** (YouTube + nome) com fila paralela, estados, progresso, verificação, playlist→pasta, MP3/MP4.
3. **Spotify** (metadados) + **Coreografia** (ranker).
4. **Ferramentas de mídia:** remover fundo, conversor, compressor, slideshow.
5. **Contas + assinatura:** Supabase Auth, trial, paywall, Stripe checkout, webhook, sync.
6. **Auto-update** + **instalador offline** + verificação de integridade.
7. **Suporte**, polimento de animações, testes e QA final.

Cada fase entrega algo **funcionando e testado** antes da próxima.

---

## 11. O que preciso de você (tudo grátis — passo a passo na hora)
Como você ainda não tem nenhuma conta, vou te guiar para criar e me passar:
1. **Supabase:** URL do projeto + `anon key` + `service_role key`.
2. **Stripe:** `Secret key` + `Publishable key` (modo teste primeiro, depois produção).
3. **GitHub:** conta + repositório para os releases.

Eu configuro produtos/preços na Stripe, o webhook (te devolvo a URL), as tabelas no Supabase e o publish do GitHub.

---

## 12. Riscos e decisões assumidas
- **SmartScreen** sem certificado pago (item 7) — lançamento gratuito mostra aviso na 1ª vez.
- **Disponibilidade de fontes** depende de plataformas externas; mitigado com tratamento de erro robusto e retry.
- **Qualidade de áudio** via YouTube é ótima (até ~256 kbps), não idêntica ao master do Spotify.
- **Compressão "sem perda"** só é literal em imagem e WAV→FLAC; vídeo é "perda imperceptível".
- **Plano gratuito Supabase** tem limites (500 MB DB, cotas) — suficiente para começar; escala paga depois se necessário.
