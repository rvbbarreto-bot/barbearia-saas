BEGIN;

CREATE TABLE IF NOT EXISTS customer_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plate text,
  normalized_plate text,
  brand text,
  model text,
  color text,
  vehicle_type text NOT NULL DEFAULT 'car'
    CHECK (vehicle_type IN ('car','motorcycle','pickup','suv','van','truck','other')),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, normalized_plate)
);

CREATE INDEX IF NOT EXISTS idx_customer_vehicles_customer
  ON customer_vehicles (tenant_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_vehicles_search
  ON customer_vehicles (tenant_id, is_active, normalized_plate, model);

CREATE TABLE IF NOT EXISTS car_wash_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES customer_vehicles(id) ON DELETE RESTRICT,
  stage text NOT NULL DEFAULT 'scheduled'
    CHECK (stage IN ('scheduled','arrived','washing','quality_check','ready','delivered','cancelled','no_show')),
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  estimated_ready_at timestamptz,
  ready_notified_at timestamptz,
  delivered_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, appointment_id)
);

CREATE INDEX IF NOT EXISTS idx_car_wash_jobs_board
  ON car_wash_jobs (tenant_id, stage, stage_changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_car_wash_jobs_vehicle
  ON car_wash_jobs (tenant_id, vehicle_id, created_at DESC);

CREATE TABLE IF NOT EXISTS car_wash_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES car_wash_jobs(id) ON DELETE CASCADE,
  checklist_type text NOT NULL DEFAULT 'arrival'
    CHECK (checklist_type IN ('arrival','delivery')),
  items jsonb NOT NULL DEFAULT '{}',
  notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, job_id, checklist_type)
);

ALTER TABLE customer_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_vehicles FORCE ROW LEVEL SECURITY;
ALTER TABLE car_wash_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE car_wash_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE car_wash_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE car_wash_checklists FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_customer_vehicles ON customer_vehicles;
CREATE POLICY tenant_isolation_customer_vehicles ON customer_vehicles
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_car_wash_jobs ON car_wash_jobs;
CREATE POLICY tenant_isolation_car_wash_jobs ON car_wash_jobs
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_car_wash_checklists ON car_wash_checklists;
CREATE POLICY tenant_isolation_car_wash_checklists ON car_wash_checklists
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

COMMIT;
