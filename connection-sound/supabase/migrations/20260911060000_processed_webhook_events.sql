-- Dedupe persistente para webhooks do Asaas.
-- O `Set` em memória perde entre cold starts, então o mesmo evento pode ser
-- processado duas vezes. Aqui gravamos (event_id, source) e usamos upsert
-- atômico: se a linha já existia, onConflict não insere nada e o .select()
-- retorna 0 linhas → é duplicado.
create table if not exists public.processed_webhook_events (
  event_id text primary key,
  source text not null default 'asaas',
  created_at timestamptz not null default now()
);

create index if not exists processed_webhook_events_created_idx
  on public.processed_webhook_events (created_at);

-- Limpeza: apaga eventos com mais de 30 dias (job pg_cron, se quiser agendar).
-- Por ora, deixo o índice pra permitir delete barato em batch.

-- Sem RLS — a função usa service_role, ignora políticas.
alter table public.processed_webhook_events enable row level security;
drop policy if exists "service_role full access" on public.processed_webhook_events;
create policy "service_role full access" on public.processed_webhook_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
