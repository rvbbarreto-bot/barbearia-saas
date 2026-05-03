CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE tenant_status AS ENUM ('trial','active','suspended','cancelled');
CREATE TYPE user_role AS ENUM ('platform_admin','tenant_owner','tenant_admin','manager','professional','attendant','viewer');
CREATE TYPE appointment_status AS ENUM ('draft','offered','confirmed','cancelled','completed','no_show');
CREATE TYPE channel AS ENUM ('whatsapp','web','manual','api');

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  trade_name text NOT NULL,
  document text,
  plan_code text NOT NULL DEFAULT 'trial',
  status tenant_status NOT NULL DEFAULT 'trial',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  name text NOT NULL,
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  encrypted_secret text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text,
  phone text NOT NULL,
  email citext,
  whatsapp_opt_in boolean NOT NULL DEFAULT false,
  whatsapp_opt_out boolean NOT NULL DEFAULT false,
  last_interaction_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);

CREATE TABLE professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  calendar_provider text DEFAULT 'internal',
  external_calendar_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  price_cents int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE professional_services (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (professional_id, service_id)
);

CREATE TABLE business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES professionals(id) ON DELETE CASCADE,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  slot_interval_minutes int NOT NULL DEFAULT 30,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id),
  professional_id uuid NOT NULL REFERENCES professionals(id),
  service_id uuid REFERENCES services(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status appointment_status NOT NULL DEFAULT 'draft',
  source channel NOT NULL DEFAULT 'whatsapp',
  external_calendar_event_id text,
  notes text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE UNIQUE INDEX appointments_no_overlap_confirmed
ON appointments (tenant_id, professional_id, starts_at, ends_at)
WHERE status IN ('confirmed','completed');

CREATE TABLE conversation_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  state_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id, state_key)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  channel channel NOT NULL DEFAULT 'whatsapp',
  external_message_id text,
  body text,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, rule_type, version)
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  before jsonb,
  after jsonb,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid AS $$
BEGIN
  RETURN NULLIF(current_setting('app.tenant_id', true), '')::uuid;
END;
$$ LANGUAGE plpgsql STABLE;

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_customers ON customers USING (tenant_id = app_tenant_id());
CREATE POLICY tenant_professionals ON professionals USING (tenant_id = app_tenant_id());
CREATE POLICY tenant_services ON services USING (tenant_id = app_tenant_id());
CREATE POLICY tenant_prof_services ON professional_services USING (tenant_id = app_tenant_id());
CREATE POLICY tenant_business_hours ON business_hours USING (tenant_id = app_tenant_id());
CREATE POLICY tenant_appointments ON appointments USING (tenant_id = app_tenant_id());
CREATE POLICY tenant_states ON conversation_states USING (tenant_id = app_tenant_id());
CREATE POLICY tenant_messages ON messages USING (tenant_id = app_tenant_id());
CREATE POLICY tenant_rules ON rules USING (tenant_id = app_tenant_id());
CREATE POLICY tenant_integrations ON tenant_integrations USING (tenant_id = app_tenant_id());

CREATE INDEX idx_customers_tenant_phone ON customers(tenant_id, phone);
CREATE INDEX idx_appointments_tenant_period ON appointments(tenant_id, starts_at, ends_at);
CREATE INDEX idx_appointments_professional ON appointments(tenant_id, professional_id, starts_at);
CREATE INDEX idx_messages_customer ON messages(tenant_id, customer_id, created_at DESC);
