-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Base Tables
CREATE TABLE tenants (
    tenant_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- Nullable if using SAML/OIDC exclusively
    full_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_tenants (
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    PRIMARY KEY (user_id, tenant_id)
);

CREATE TABLE patients (
    patient_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    mrn VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Row-Level Security (RLS) Configuration
-- Enable RLS on Tenant-Scoped Tables
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY; 

-- Define RLS Isolation Policy using Session Variables
CREATE POLICY tenant_isolation_patient_policy ON patients
    FOR ALL
    USING (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
        OR
        current_setting('app.is_superadmin', true) = 'true'
    )
    WITH CHECK (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID
    );

-- Helper Stored Procedure for Setting Request Context (Called per Transaction)
CREATE OR REPLACE FUNCTION set_tenant_context(
    p_tenant_id UUID,
    p_user_id UUID,
    p_is_superadmin BOOLEAN DEFAULT FALSE
) RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_tenant_id', p_tenant_id::text, true);
    PERFORM set_config('app.current_user_id', p_user_id::text, true);
    PERFORM set_config('app.is_superadmin', p_is_superadmin::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Initial Seed Data
INSERT INTO tenants (tenant_id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Default System Tenant');
-- Seed admin with Argon2id hash for 'Admin123!'
-- Note: Replace with actual generated hash in python
INSERT INTO users (user_id, email, password_hash, full_name) VALUES ('00000000-0000-0000-0000-000000000002', 'admin@sapayanfaskes.com', '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RTRXp9x...', 'System Admin');
INSERT INTO user_tenants (user_id, tenant_id, role) VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'superadmin');
