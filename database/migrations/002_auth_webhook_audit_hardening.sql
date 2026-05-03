ALTER TABLE tenants
ADD COLUMN webhook_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex');

ALTER TABLE users
ADD CONSTRAINT users_tenant_email_unique UNIQUE (tenant_id, email);

CREATE INDEX idx_users_tenant_email_active ON users(tenant_id, email, is_active);
