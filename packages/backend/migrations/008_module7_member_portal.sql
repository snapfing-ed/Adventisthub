BEGIN;

-- ── 1. Claim Status Enum ───────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE profile_claim_status AS ENUM (
    'PENDING',
    'VERIFIED',
    'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Officer-Issued Profile Claim Invites (Optional Fast-Track Linking) ──
CREATE TABLE IF NOT EXISTS profile_claim_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE NOT NULL,
  issued_to_contact TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  redeemed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_invites_tenant ON profile_claim_invites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_claim_invites_person ON profile_claim_invites(person_id);
CREATE INDEX IF NOT EXISTS idx_claim_invites_code ON profile_claim_invites(invite_code);

-- ── 3. Member / Student Profile Claim Requests ─────────────────────────────
CREATE TABLE IF NOT EXISTS profile_claim_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,

  verification_method TEXT NOT NULL DEFAULT 'EMAIL_OR_PHONE_MATCH', -- INVITE_CODE | EMAIL_OR_PHONE_MATCH | MANUAL_REVIEW
  submitted_identifier TEXT,
  status profile_claim_status NOT NULL DEFAULT 'PENDING',
  review_notes TEXT,

  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_requests_tenant_status
  ON profile_claim_requests(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_requests_user
  ON profile_claim_requests(user_id);

DROP TRIGGER IF EXISTS trg_claim_requests_updated_at ON profile_claim_requests;
CREATE TRIGGER trg_claim_requests_updated_at
BEFORE UPDATE ON profile_claim_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 4. Self-Service Contact Update Audit Trail ─────────────────────────────
CREATE TABLE IF NOT EXISTS member_contact_update_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_updates_tenant_person
  ON member_contact_update_logs(tenant_id, person_id, created_at DESC);

-- ── 5. Strict Multi-Tenant Row-Level Security (FORCE RLS) ──────────────────
ALTER TABLE profile_claim_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_claim_invites FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_claim_invites_isolation_policy ON profile_claim_invites;
CREATE POLICY profile_claim_invites_isolation_policy ON profile_claim_invites
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

ALTER TABLE profile_claim_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_claim_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_claim_requests_isolation_policy ON profile_claim_requests;
CREATE POLICY profile_claim_requests_isolation_policy ON profile_claim_requests
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

ALTER TABLE member_contact_update_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_contact_update_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_contact_update_logs_isolation_policy ON member_contact_update_logs;
CREATE POLICY member_contact_update_logs_isolation_policy ON member_contact_update_logs
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

COMMIT;
