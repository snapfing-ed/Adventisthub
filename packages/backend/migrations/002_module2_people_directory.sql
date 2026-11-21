BEGIN;

-- ── Member / Student Status Enum ───────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE member_status AS ENUM (
    'BAPTIZED_MEMBER',
    'PROFESSION_OF_FAITH',
    'STUDENT_MEMBER',
    'VISITOR',
    'TRANSFERRED_OUT',
    'REMOVED',
    'DECEASED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Optional Households Grouping ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  household_name TEXT NOT NULL,
  address TEXT,
  city_or_district TEXT,
  primary_phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_households_tenant ON households(tenant_id);

-- ── Persons (Congregant & Student Master Directory) ────────────────────────
CREATE TABLE IF NOT EXISTS persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  household_id UUID REFERENCES households(id) ON DELETE SET NULL,

  -- Core Identity
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender TEXT,
  date_of_birth DATE,

  -- Contact Info
  phone TEXT,
  email TEXT,
  address TEXT,

  -- SDA Church Manual Status & Baptism Details
  membership_status member_status NOT NULL DEFAULT 'VISITOR',
  baptism_date DATE,
  baptizing_minister TEXT,
  previous_church TEXT,
  sabbath_school_class TEXT,

  -- PCM Campus Chapter Fields (populated when organization_type = 'PCM_CHAPTER')
  student_id TEXT,
  institution TEXT,
  program_of_study TEXT,
  year_of_study TEXT,
  hostel_or_residence TEXT,
  home_church TEXT,

  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_persons_tenant ON persons(tenant_id);
CREATE INDEX IF NOT EXISTS idx_persons_tenant_status ON persons(tenant_id, membership_status);
CREATE INDEX IF NOT EXISTS idx_persons_household ON persons(household_id);
CREATE INDEX IF NOT EXISTS idx_persons_name ON persons(tenant_id, last_name, first_name);

-- ── Row-Level Security (RLS) ───────────────────────────────────────────────
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE households FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS households_isolation_policy ON households;
CREATE POLICY households_isolation_policy ON households
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

ALTER TABLE persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE persons FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS persons_isolation_policy ON persons;
CREATE POLICY persons_isolation_policy ON persons
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

COMMIT;
