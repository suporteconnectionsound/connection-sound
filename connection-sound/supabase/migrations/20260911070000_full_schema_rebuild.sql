-- ============================================================================
-- Connection Sound — Schema completo reconstruído
-- Projeto: uirwbnwvutvqdpcevjge (novo)
-- Gerado em: 2026-09-11
--
-- Origem: leitura do código das Edge Functions (asaas-webhook, admin,
-- trial-emails, asaas-create-checkout, asaas-check-payment) + lib supabase.ts
-- + lib auth.tsx. Não há dump do projeto antigo disponível.
--
-- O QUE ESTÁ AQUI (vs projeto antigo):
--   Tabelas: subscriptions, profiles, devices, download_history, settings,
--            email_events, processed_webhook_events
--   Função:  users_needing_email (reconstruída a partir de trial-emails/index.ts)
--   Trigger: handle_new_user (cria profile + trial_ends_at na criação do user)
--   RLS:     policies de leitura/escrita por papel (anon, authenticated, service_role)
--   Índices: parciais em asaas_customer_id / asaas_subscription_id (asaas_migration)
--
-- IDEMPOTÊNCIA: tudo com IF NOT EXISTS / DO $$ pra rodar mais de uma vez sem erro.
-- ============================================================================

-- ─────────────── ENUMs ────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum (
      'pending', 'trialing', 'active', 'past_due', 'canceled', 'expired'
    );
  end if;
end $$;

-- ─────────────── Tabela: profiles ────────────────────────────────────────────
-- Espelha auth.users com metadados do app (trial, nome).
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text,
  full_name        text,
  trial_started_at timestamptz,
  trial_ends_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (lower(email));

-- ─────────────── Tabela: subscriptions ───────────────────────────────────────
-- Estado da assinatura por usuário. 1 linha por user_id (one-to-one).
-- price_id é livre (text) — admin/grant usa 'manual' ou 'permanente', Asaas usa
-- 'asaas_monthly' | 'asaas_yearly' | 'asaas_pix_30d' | 'asaas_pix_365d'.
create table if not exists public.subscriptions (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  asaas_customer_id     text,
  asaas_subscription_id text,
  asaas_payment_id      text,
  status                public.subscription_status not null default 'pending',
  price_id              text,
  current_period_end    timestamptz,
  updated_at            timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

-- Índices parciais — só linhas com IDs Asaas populados.
create index if not exists subscriptions_asaas_customer_idx
  on public.subscriptions (asaas_customer_id)
  where asaas_customer_id is not null;

create index if not exists subscriptions_asaas_subscription_idx
  on public.subscriptions (asaas_subscription_id)
  where asaas_subscription_id is not null;

create index if not exists subscriptions_status_idx
  on public.subscriptions (status);

-- ─────────────── Tabela: devices ─────────────────────────────────────────────
-- Dispositivos onde o app está instalado (limite de 2 do plano).
create table if not exists public.devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  device_name  text,
  os           text,
  app_version  text,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists devices_user_idx on public.devices (user_id);

-- ─────────────── Tabela: download_history ────────────────────────────────────
-- Histórico de downloads (somente o que o usuário fez, sem conteúdo).
create table if not exists public.download_history (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,                    -- 'mp3' | 'mp4' | 'pix' | 'playlist' | 'search'
  source     text,                            -- 'youtube' | 'spotify' | 'search'
  title      text,
  url        text,
  bytes      bigint,
  success    boolean not null default true,
  error      text,
  created_at timestamptz not null default now()
);

create index if not exists download_history_user_idx on public.download_history (user_id, created_at desc);

-- ─────────────── Tabela: settings ────────────────────────────────────────────
-- Preferências do usuário (qualidade padrão, pasta de downloads, etc).
create table if not exists public.settings (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  default_quality_mp3  text default '320',
  default_quality_mp4  text default '1080',
  default_format       text default 'mp3',
  download_folder      text,
  notify_complete      boolean not null default true,
  updated_at           timestamptz not null default now()
);

-- ─────────────── Tabela: email_events ────────────────────────────────────────
-- Log de e-mails enviados pela jornada de trial (idempotência da trial-emails).
create table if not exists public.email_events (
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,                  -- 'welcome' | 'trial_expiring' | 'trial_expired' | 'winback'
  sent_at    timestamptz not null default now(),
  primary key (user_id, kind)
);

create index if not exists email_events_kind_idx on public.email_events (kind);

-- ─────────────── Tabela: processed_webhook_events ───────────────────────────
-- Dedupe persistente dos webhooks do Asaas (claimEvent).
create table if not exists public.processed_webhook_events (
  event_id   text primary key,
  source     text not null default 'asaas',
  created_at timestamptz not null default now()
);

create index if not exists processed_webhook_events_created_idx
  on public.processed_webhook_events (created_at);

-- ─────────────── Função: handle_new_user ─────────────────────────────────────
-- Trigger em auth.users: cria profile + subscription pendente + settings,
-- inicia trial de 3 dias. Espelha o comportamento esperado pelo app.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trial_end timestamptz := now() + interval '3 days';
begin
  insert into public.profiles (id, email, full_name, trial_started_at, trial_ends_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    now(),
    trial_end
  )
  on conflict (id) do nothing;

  insert into public.subscriptions (user_id, status)
  values (new.id, 'trialing')
  on conflict (user_id) do nothing;

  insert into public.settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────── Função: users_needing_email ─────────────────────────────────
-- Retorna linhas que precisam receber e-mail automático agora.
-- trial-emails/index.ts:206 chama admin.rpc('users_needing_email').
--
-- Regras (reconstruídas do comentário em trial-emails):
--   welcome         → profile com trial_started_at recente (≤ 5 min) e sem email_events.welcome
--   trial_expiring  → trial_ends_at entre agora e agora+24h, sem email_events.trial_expiring
--   trial_expired   → trial_ends_at entre (agora-24h) e agora, sem email_events.trial_expired, e sem assinatura ativa
--   winback         → sem assinatura ativa e sem email_events.winback e criado há > 30 dias
create or replace function public.users_needing_email()
returns table (
  user_id uuid,
  email   text,
  full_name text,
  kind    text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query

  -- welcome (logo após cadastro, ≤ 5 min)
  select p.id, p.email, p.full_name, 'welcome'::text as kind
  from public.profiles p
  where p.trial_started_at >= now() - interval '5 minutes'
    and not exists (
      select 1 from public.email_events e
      where e.user_id = p.id and e.kind = 'welcome'
    )
    and p.email is not null

  union all

  -- trial_expiring (termina em até 24h)
  select p.id, p.email, p.full_name, 'trial_expiring'::text
  from public.profiles p
  where p.trial_ends_at is not null
    and p.trial_ends_at between now() and now() + interval '24 hours'
    and not exists (
      select 1 from public.email_events e
      where e.user_id = p.id and e.kind = 'trial_expiring'
    )
    and p.email is not null

  union all

  -- trial_expired (acabou nas últimas 24h, sem assinatura ativa)
  select p.id, p.email, p.full_name, 'trial_expired'::text
  from public.profiles p
  left join public.subscriptions s on s.user_id = p.id
  where p.trial_ends_at is not null
    and p.trial_ends_at between now() - interval '24 hours' and now()
    and (s.status is null or s.status in ('pending','canceled','expired'))
    and not exists (
      select 1 from public.email_events e
      where e.user_id = p.id and e.kind = 'trial_expired'
    )
    and p.email is not null

  union all

  -- winback (sem assinatura ativa, conta > 30d, nunca recebeu winback)
  select p.id, p.email, p.full_name, 'winback'::text
  from public.profiles p
  left join public.subscriptions s on s.user_id = p.id
  where p.created_at < now() - interval '30 days'
    and (s.status is null or s.status in ('pending','canceled','expired'))
    and not exists (
      select 1 from public.email_events e
      where e.user_id = p.id and e.kind = 'winback'
    )
    and p.email is not null;
end;
$$;

-- ─────────────── RLS ─────────────────────────────────────────────────────────
-- Habilita RLS em todas as tabelas.
alter table public.profiles             enable row level security;
alter table public.subscriptions        enable row level security;
alter table public.devices              enable row level security;
alter table public.download_history     enable row level security;
alter table public.settings             enable row level security;
alter table public.email_events         enable row level security;
alter table public.processed_webhook_events enable row level security;

-- profiles: usuário lê/atualiza o próprio; service_role tem acesso total.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (auth.uid() = id);

-- subscriptions: usuário lê a própria; service_role tem acesso total.
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select using (auth.uid() = user_id);

-- devices: usuário lê/insere/atualiza/deleta o próprio.
drop policy if exists devices_all_own on public.devices;
create policy devices_all_own on public.devices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- download_history: usuário lê/insere os próprios.
drop policy if exists download_history_select_own on public.download_history;
create policy download_history_select_own on public.download_history
  for select using (auth.uid() = user_id);

drop policy if exists download_history_insert_self on public.download_history;
create policy download_history_insert_self on public.download_history
  for insert with check (auth.uid() = user_id);

-- settings: usuário lê/atualiza o próprio.
drop policy if exists settings_all_own on public.settings;
create policy settings_all_own on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- email_events: service_role lê/insere; ninguém mais.
drop policy if exists email_events_service_role on public.email_events;
create policy email_events_service_role on public.email_events
  for all to service_role using (true) with check (true);

-- processed_webhook_events: só service_role.
drop policy if exists processed_webhook_events_service_role on public.processed_webhook_events;
create policy processed_webhook_events_service_role on public.processed_webhook_events
  for all to service_role using (true) with check (true);

-- ─────────────── Grants ──────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated, service_role;

grant select on public.profiles         to anon, authenticated;
grant update on public.profiles         to authenticated;
grant insert on public.profiles         to authenticated;

grant select on public.subscriptions    to anon, authenticated;

grant select, insert, update, delete on public.devices      to authenticated;
grant select, insert, update          on public.download_history to authenticated;
grant select, insert, update          on public.settings     to authenticated;

-- service_role recebe tudo (padrão do Supabase).
-- ─────────────── Helper: updated_at auto-update ──────────────────────────────
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.tg_touch_updated_at();

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.tg_touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.tg_touch_updated_at();

drop trigger if exists devices_touch on public.devices;
create trigger devices_touch before update on public.devices
  for each row execute function public.tg_touch_updated_at();

-- ─────────────── Comentários ─────────────────────────────────────────────────
comment on table public.profiles is 'Mirror de auth.users com metadados do app (trial, nome).';
comment on table public.subscriptions is 'Estado da assinatura por usuário (Asaas + admin/grant).';
comment on table public.devices is 'Dispositivos onde o app está instalado.';
comment on table public.download_history is 'Histórico de downloads (sem conteúdo).';
comment on table public.settings is 'Preferências do usuário.';
comment on table public.email_events is 'Log de e-mails enviados pela jornada de trial.';
comment on table public.processed_webhook_events is 'Dedupe persistente de webhooks do Asaas.';
comment on function public.users_needing_email() is 'Lista perfis+kind que precisam de e-mail automático. Chamada por trial-emails via pg_cron.';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
