-- Connection Sound — esquema inicial do banco
-- Rode isto no Supabase: SQL Editor -> New query -> colar -> Run

-- ============ TABELAS ============

-- Perfil do usuário + controle de trial
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  trial_started_at timestamptz default now(),
  trial_ends_at timestamptz default (now() + interval '3 days'),
  created_at timestamptz default now()
);

-- Assinatura (escrita pelo webhook da Stripe; usuário só lê)
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'none', -- none | trialing | active | past_due | canceled
  price_id text,
  current_period_end timestamptz,
  updated_at timestamptz default now()
);

-- Dispositivos do usuário (controle de PCs + botão de update)
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  device_id text not null,
  name text,
  last_seen timestamptz default now(),
  unique (user_id, device_id)
);

-- Histórico de downloads (sincroniza entre PCs)
create table if not exists public.download_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text,
  source text,
  format text,
  status text,
  created_at timestamptz default now()
);

-- Preferências do usuário
create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  download_dir text,
  quality text,
  concurrency int default 4,
  language text default 'pt-BR'
);

-- ============ SEGURANÇA (RLS) ============
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.devices enable row level security;
alter table public.download_history enable row level security;
alter table public.settings enable row level security;

-- Cada usuário só acessa os próprios dados
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Assinatura: usuário só LÊ (quem escreve é o webhook via service_role)
drop policy if exists "read own sub" on public.subscriptions;
create policy "read own sub" on public.subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "own devices" on public.devices;
create policy "own devices" on public.devices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own history" on public.download_history;
create policy "own history" on public.download_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ TRIGGER: cria perfil + inicia trial de 3 dias no cadastro ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;

  insert into public.subscriptions (user_id, status)
  values (new.id, 'trialing')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
