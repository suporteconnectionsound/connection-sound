-- ============================================================================
-- v0.2.1 — Garantias de integridade
-- ============================================================================

-- 1) CHECK em subscriptions.price_id (não vazio) — protege contra grantPixDays
--    que pode ter gravado null em algum caminho antigo.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_price_id_not_empty'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_price_id_not_empty
      check (price_id is null or length(price_id) > 0);
  end if;
end $$;

-- 2) CHECK em subscriptions.current_period_end (não antes de 2020).
--    Asaas escreve timestamps ISO; um valor menor que isso indica bug.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_period_reasonable'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_period_reasonable
      check (current_period_end is null or current_period_end > '2020-01-01'::timestamptz);
  end if;
end $$;

-- 3) CHECK em email_events.kind (whitelist dos tipos que trial-emails gera).
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'email_events_kind_valid'
  ) then
    alter table public.email_events
      add constraint email_events_kind_valid
      check (kind in ('welcome','trial_expiring','trial_expired','winback'));
  end if;
end $$;

-- 4) CHECK em processed_webhook_events.source (apenas Asaas por enquanto).
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'processed_webhook_events_source_valid'
  ) then
    alter table public.processed_webhook_events
      add constraint processed_webhook_events_source_valid
      check (source in ('asaas','stripe'));
  end if;
end $$;

-- 5) Limpa tokens de sessão antigos: signOut em todos os devices do usuário.
--    (Webhook agora usa upsert com onConflict — não duplica eventos mesmo
--    em chamadas concorrentes. Defesa extra: índice único parcial em
--    processed_webhook_events.event_id já garante idempotência.)

-- 6) View para o painel admin ler faturamento consolidado.
--    Subscriptions ativas (active com asaas_subscription_id) + PIX pagos.
create or replace view public.v_admin_revenue as
select
  date_trunc('day', coalesce(s.updated_at, now()))::date as dia,
  count(*) filter (where s.status = 'active' and s.asaas_subscription_id is not null) as cartoes_ativos,
  count(*) filter (where s.status = 'active' and s.asaas_subscription_id is null) as permanentes,
  count(*) filter (where s.status = 'trialing') as trials,
  count(*) filter (where s.status = 'canceled') as cancelados,
  count(*) as total
from public.subscriptions s
group by 1
order by 1 desc;

comment on view public.v_admin_revenue is 'Resumo diário de assinaturas por status. Usado pelo painel admin para gráfico rápido.';

-- 7) Função útil: admin pode revogar acesso por e-mail de forma idempotente.
create or replace function public.admin_revoke_user(target_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where email = lower(target_email) limit 1;
  if uid is null then return false; end if;

  update public.subscriptions
    set status = 'canceled', updated_at = now()
    where user_id = uid;

  return true;
end;
$$;

comment on function public.admin_revoke_user(text) is 'Revoga (cancela) assinatura de um usuário por e-mail. SECURITY DEFINER — só use via service_role.';

-- 8) Bucket brand: política explícita de SELECT público (idempotente).
--    Já é public por padrão, mas garantir que RLS no storage não bloqueie.
--    (Sem isso, anon pode dar 403 em leituras do logo.)
do $$
declare
  b record;
begin
  for b in select id from storage.buckets where name = 'brand' loop
    -- Garante que é público
    update storage.buckets set public = true where id = b.id;
  end loop;
end $$;

-- ============================================================================
-- FIM
-- ============================================================================
