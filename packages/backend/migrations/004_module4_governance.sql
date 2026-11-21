BEGIN;

-- ── Governance Enums ───────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE officer_status AS ENUM (
    'NOMINATED',
    'ELECTED',
    'DECLINED',
    'COMPLETED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE meeting_type AS ENUM (
    'CHURCH_BOARD',
    'BUSINESS_MEETING',
    'NOMINATING_COMMITTEE',
    'PCM_EXECUTIVE',
    'PCM_CHAPTER_MEETING'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE action_status AS ENUM (
    'PROPOSED',
    'VOTED',
    'IN_PROGRESS',
    'COMPLETED',
    'TABLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 1. Service Years (Church Year / Academic Year) ─────────────────────────
CREATE TABLE IF NOT EXISTS service_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label TEXT NOT NULL, -- e.g., "2026–2027 Church Year" or "2026/2027 Academic Year"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, label)
);

CREATE INDEX IF NOT EXISTS idx_service_years_tenant
  ON service_years(tenant_id, is_current DESC, start_date DESC);

-- ── 2. Officers & Nominating Committee Workflow ────────────────────────────
CREATE TABLE IF NOT EXISTS officers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_year_id UUID NOT NULL REFERENCES service_years(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,

  office_title TEXT NOT NULL,
  department TEXT,
  status officer_status NOT NULL DEFAULT 'NOMINATED',

  first_reading_date DATE,
  elected_date DATE,
  ordained_or_installed_date DATE,
  remarks TEXT,

  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_officers_tenant_year ON officers(tenant_id, service_year_id);
CREATE INDEX IF NOT EXISTS idx_officers_person ON officers(person_id);
CREATE INDEX IF NOT EXISTS idx_officers_status ON officers(tenant_id, status);

-- ── 3. Board & Business Meetings ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_year_id UUID REFERENCES service_years(id) ON DELETE SET NULL,

  meeting_type meeting_type NOT NULL,
  title TEXT NOT NULL,
  meeting_date DATE NOT NULL,
  location TEXT,
  chairperson TEXT,
  secretary_name TEXT,
  attendees_summary TEXT,
  opening_prayer_by TEXT,
  closing_prayer_by TEXT,
  minutes_body TEXT,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_date DATE,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_meetings_tenant_date
  ON board_meetings(tenant_id, meeting_date DESC);

-- ── 4. Voted Board & Business Actions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES board_meetings(id) ON DELETE CASCADE,

  action_number TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'GENERAL',
  title TEXT NOT NULL,
  motion_text TEXT NOT NULL,
  moved_by TEXT,
  seconded_by TEXT,
  status action_status NOT NULL DEFAULT 'VOTED',
  assigned_to TEXT,
  due_date DATE,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_actions_tenant ON board_actions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_board_actions_meeting ON board_actions(meeting_id);

-- ── 5. Link Module 3 membership_transactions.board_action_id -> board_actions
DO $$ BEGIN
  ALTER TABLE membership_transactions
    ADD CONSTRAINT fk_mem_tx_board_action
    FOREIGN KEY (board_action_id) REFERENCES board_actions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. Row-Level Security (RLS) on All Module 4 Tables ─────────────────────
ALTER TABLE service_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_years FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_years_isolation_policy ON service_years;
CREATE POLICY service_years_isolation_policy ON service_years
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

ALTER TABLE officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE officers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS officers_isolation_policy ON officers;
CREATE POLICY officers_isolation_policy ON officers
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

ALTER TABLE board_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_meetings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS board_meetings_isolation_policy ON board_meetings;
CREATE POLICY board_meetings_isolation_policy ON board_meetings
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

ALTER TABLE board_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_actions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS board_actions_isolation_policy ON board_actions;
CREATE POLICY board_actions_isolation_policy ON board_actions
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

COMMIT;
