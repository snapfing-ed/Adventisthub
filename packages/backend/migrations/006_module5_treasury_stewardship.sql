BEGIN;

-- ── 1. Stewardship & Treasury Enums ────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE fund_category AS ENUM (
    'TITHE',
    'CONFERENCE_OFFERING',
    'LOCAL_BUDGET',
    'PROJECT_PLEDGE',
    'CAMP_MEETING',
    'PCM_CHAPTER_FUND'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contribution_status AS ENUM (
    'DRAFT',
    'POSTED',
    'VOIDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE remittance_status AS ENUM (
    'PENDING',
    'SUBMITTED',
    'RECONCILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Funds / Chart of Stewardship Accounts ───────────────────────────────
CREATE TABLE IF NOT EXISTS funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category fund_category NOT NULL,
  is_trust_fund BOOLEAN NOT NULL DEFAULT FALSE,
  target_amount NUMERIC(14, 2),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_funds_tenant_active
  ON funds(tenant_id, is_active, category);

-- ── 3. Contributions / Tithe & Offering Receipts ───────────────────────────
CREATE TABLE IF NOT EXISTS contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  contribution_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Nullable person_id supports both named member/student receipts and loose/anonymous Sabbath offerings
  person_id UUID REFERENCES persons(id) ON DELETE SET NULL,
  contributor_label TEXT,

  payment_method TEXT NOT NULL DEFAULT 'CASH',
  reference_code TEXT,
  currency TEXT NOT NULL DEFAULT 'ZMW',
  total_amount NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0),
  status contribution_status NOT NULL DEFAULT 'POSTED',
  notes TEXT,

  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  posted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  voided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS idx_contributions_tenant_date
  ON contributions(tenant_id, contribution_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contributions_person
  ON contributions(person_id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contributions_status
  ON contributions(tenant_id, status);

-- ── 4. Itemized Receipt Line Items ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contribution_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contribution_id UUID NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  fund_id UUID NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contrib_lines_contribution
  ON contribution_line_items(contribution_id);
CREATE INDEX IF NOT EXISTS idx_contrib_lines_tenant_fund
  ON contribution_line_items(tenant_id, fund_id);

-- ── 5. Monthly / Periodic Conference & Field Remittances ───────────────────
CREATE TABLE IF NOT EXISTS remittances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reporting_period TEXT NOT NULL, -- e.g., "2026-11"
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  service_year_id UUID REFERENCES service_years(id) ON DELETE SET NULL,

  tithe_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  conference_offering_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_trust_due NUMERIC(14, 2) NOT NULL DEFAULT 0,
  remitted_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,

  remittance_date DATE,
  reference_number TEXT,
  destination_entity TEXT DEFAULT 'Conference / Field Treasury',
  status remittance_status NOT NULL DEFAULT 'PENDING',
  notes TEXT,

  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, reporting_period)
);

CREATE INDEX IF NOT EXISTS idx_remittances_tenant_period
  ON remittances(tenant_id, reporting_period DESC);

-- ── 6. Strict Row-Level Security (FORCE RLS) on All Module 5 Tables ────────
ALTER TABLE funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE funds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS funds_isolation_policy ON funds;
CREATE POLICY funds_isolation_policy ON funds
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contributions_isolation_policy ON contributions;
CREATE POLICY contributions_isolation_policy ON contributions
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

ALTER TABLE contribution_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE contribution_line_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contribution_line_items_isolation_policy ON contribution_line_items;
CREATE POLICY contribution_line_items_isolation_policy ON contribution_line_items
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

ALTER TABLE remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE remittances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS remittances_isolation_policy ON remittances;
CREATE POLICY remittances_isolation_policy ON remittances
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

COMMIT;
