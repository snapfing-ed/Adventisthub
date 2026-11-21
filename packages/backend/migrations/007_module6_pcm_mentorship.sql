BEGIN;

-- ── 1. PCM Lifecycle, Mentorship & Fellowship Enums ────────────────────────
DO $$ BEGIN CREATE TYPE pcm_academic_status AS ENUM ( 'FRESHMAN_INTAKE', 'ACTIVE_STUDENT', 'STUDENT_LEADER', 'FINAL_YEAR', 'ALUMNI_TRANSITIONED' ); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE mentorship_pair_status AS ENUM ( 'ACTIVE', 'PAUSED', 'COMPLETED' ); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE pcm_group_type AS ENUM ( 'BIBLE_STUDY_BAND', 'PRAYER_CELL', 'FRESHMAN_ORIENTATION', 'OUTREACH_TEAM', 'ALUMNI_NETWORK' ); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. PCM Profiles (1-to-1 Extension of Authoritative persons Table) ──────
CREATE TABLE IF NOT EXISTS pcm_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,

  academic_institution TEXT,
  academic_status pcm_academic_status NOT NULL DEFAULT 'ACTIVE_STUDENT',
  campus_faculty TEXT,
  program_of_study TEXT,
  student_number TEXT,
  year_of_study INT CHECK (year_of_study IS NULL OR year_of_study BETWEEN 1 AND 10),
  graduation_year INT CHECK (graduation_year IS NULL OR graduation_year BETWEEN 1990 AND 2100),
  expected_graduation_date DATE,

  faculty_advisor_name TEXT,
  faculty_advisor_contact TEXT,

  baptismal_interest BOOLEAN NOT NULL DEFAULT FALSE,
  spiritual_gifts TEXT,
  emergency_contact TEXT,
  mentor_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,

  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_pcm_profiles_tenant_status
  ON pcm_profiles(tenant_id, academic_status);
CREATE INDEX IF NOT EXISTS idx_pcm_profiles_grad_year
  ON pcm_profiles(tenant_id, graduation_year);
CREATE INDEX IF NOT EXISTS idx_pcm_profiles_mentor_eligible
  ON pcm_profiles(tenant_id, mentor_eligible) WHERE mentor_eligible = TRUE;

DROP TRIGGER IF EXISTS trg_pcm_profiles_updated_at ON pcm_profiles;
CREATE TRIGGER trg_pcm_profiles_updated_at
BEFORE UPDATE ON pcm_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3. Campus Fellowship Groups, Prayer Cells & Study Bands ────────────────
CREATE TABLE IF NOT EXISTS pcm_fellowship_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_year_id UUID REFERENCES service_years(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  group_type pcm_group_type NOT NULL DEFAULT 'BIBLE_STUDY_BAND',
  leader_person_id UUID REFERENCES persons(id) ON DELETE SET NULL,
  meeting_schedule TEXT,
  location TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_pcm_groups_tenant
  ON pcm_fellowship_groups(tenant_id, is_active DESC, name);

DROP TRIGGER IF EXISTS trg_pcm_groups_updated_at ON pcm_fellowship_groups;
CREATE TRIGGER trg_pcm_groups_updated_at
BEFORE UPDATE ON pcm_fellowship_groups
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS pcm_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES pcm_fellowship_groups(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,

  role_in_group TEXT NOT NULL DEFAULT 'MEMBER', -- MEMBER, CO_LEADER, SECRETARY, PRAYER_COORDINATOR
  joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_pcm_group_members_tenant_group
  ON pcm_group_members(tenant_id, group_id);
CREATE INDEX IF NOT EXISTS idx_pcm_group_members_person
  ON pcm_group_members(person_id);

-- ── 4. Mentor–Mentee Pairings ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mentorship_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mentor_person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  mentee_person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  service_year_id UUID REFERENCES service_years(id) ON DELETE SET NULL,

  status mentorship_pair_status NOT NULL DEFAULT 'ACTIVE',
  focus_area TEXT,
  started_at DATE NOT NULL DEFAULT CURRENT_DATE,
  ended_at DATE,
  notes TEXT,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_mentor_not_mentee CHECK (mentor_person_id <> mentee_person_id)
);

CREATE INDEX IF NOT EXISTS idx_mentorship_pairs_tenant_status
  ON mentorship_pairs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_mentorship_pairs_mentor
  ON mentorship_pairs(mentor_person_id);
CREATE INDEX IF NOT EXISTS idx_mentorship_pairs_mentee
  ON mentorship_pairs(mentee_person_id);

DROP TRIGGER IF EXISTS trg_mentorship_pairs_updated_at ON mentorship_pairs;
CREATE TRIGGER trg_mentorship_pairs_updated_at
BEFORE UPDATE ON mentorship_pairs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 5. Discipleship & Mentorship Check-In Logs ─────────────────────────────
CREATE TABLE IF NOT EXISTS mentorship_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pair_id UUID NOT NULL REFERENCES mentorship_pairs(id) ON DELETE CASCADE,

  checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,
  meeting_mode TEXT NOT NULL DEFAULT 'IN_PERSON', -- IN_PERSON, PHONE_CALL, VIDEO, CAMPUS_DEVOTION
  summary TEXT NOT NULL,
  prayer_requests TEXT,
  follow_up_needed BOOLEAN NOT NULL DEFAULT FALSE,

  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mentorship_checkins_tenant_pair
  ON mentorship_checkins(tenant_id, pair_id, checkin_date DESC);

-- ── 6. Strict Tenant Isolation (FORCE ROW LEVEL SECURITY) ──────────────────
ALTER TABLE pcm_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcm_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pcm_profiles_isolation_policy ON pcm_profiles;
CREATE POLICY pcm_profiles_isolation_policy ON pcm_profiles
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

ALTER TABLE pcm_fellowship_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcm_fellowship_groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pcm_fellowship_groups_isolation_policy ON pcm_fellowship_groups;
CREATE POLICY pcm_fellowship_groups_isolation_policy ON pcm_fellowship_groups
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

ALTER TABLE pcm_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE pcm_group_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pcm_group_members_isolation_policy ON pcm_group_members;
CREATE POLICY pcm_group_members_isolation_policy ON pcm_group_members
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

ALTER TABLE mentorship_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentorship_pairs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mentorship_pairs_isolation_policy ON mentorship_pairs;
CREATE POLICY mentorship_pairs_isolation_policy ON mentorship_pairs
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

ALTER TABLE mentorship_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentorship_checkins FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mentorship_checkins_isolation_policy ON mentorship_checkins;
CREATE POLICY mentorship_checkins_isolation_policy ON mentorship_checkins
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

COMMIT;
