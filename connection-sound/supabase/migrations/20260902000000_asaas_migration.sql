-- Migração: Stripe → Asaas.
-- Renomeia colunas legadas e adiciona campos opcionais para auditoria.
-- Idempotente: pode rodar mais de uma vez sem erro.

DO $$
BEGIN
  -- stripe_customer_id → asaas_customer_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'stripe_customer_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'asaas_customer_id'
  ) THEN
    ALTER TABLE subscriptions RENAME COLUMN stripe_customer_id TO asaas_customer_id;
  END IF;

  -- stripe_subscription_id → asaas_subscription_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'stripe_subscription_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'asaas_subscription_id'
  ) THEN
    ALTER TABLE subscriptions RENAME COLUMN stripe_subscription_id TO asaas_subscription_id;
  END IF;
END $$;

-- Coluna nova opcional: último payment avulso (auditoria de PIX).
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS asaas_payment_id text;

-- Índices úteis para o webhook reconciliar pelo customer_id.
CREATE INDEX IF NOT EXISTS subscriptions_asaas_customer_idx ON subscriptions (asaas_customer_id)
  WHERE asaas_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscriptions_asaas_subscription_idx ON subscriptions (asaas_subscription_id)
  WHERE asaas_subscription_id IS NOT NULL;
