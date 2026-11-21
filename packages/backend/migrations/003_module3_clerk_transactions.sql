BEGIN;

-- ── Clerk Transaction & Transfer Status Enums ──────────────────────────────
DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM (
    'BAPTISM',
    'PROFESSION_OF_FAITH',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'DISCIPLINE_REMOVAL',
    'DEATH',
    'MISSING',
    'CAMPUS_GRADUATION',
    'CAMPUS_TRANSFER_OUT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transfer_status AS ENUM (
    'REQUESTED',
    'FIRST_READING',
    'BOARD_RECOMMENDED',
    'BUSINESS_VOTED',
    'COMPLETED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Membership Transactions (Clerk Duties & Audit Trail) ───────────────────
CREATE TABLE IF NOT EXISTS membership_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,

  transaction_type transaction_type NOT NULL,
  previous_status member_status,
  new_status member_status NOT NULL,
  transfer_status transfer_status,

  -- Church Manual & PCM Governance Dates
  first_reading_date DATE,
  board_vote_date DATE,
  business_meeting_date DATE,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Origin / Destination & Officiating Details
  other_church_or_chapter TEXT,
  officiating_minister TEXT,
  minute_reference TEXT,

  -- Forward Compatibility with Module 4 (Board Actions & Minutes)
  board_action_id UUID,

  remarks TEXT,
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mem_tx_tenant_created
  ON membership_transactions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mem_tx_person
  ON membership_transactions(person_id);
CREATE INDEX IF NOT EXISTS idx_mem_tx_type
  ON membership_transactions(tenant_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_mem_tx_transfer_status
  ON membership_transactions(tenant_id, transfer_status)
  WHERE transfer_status IS NOT NULL;

-- ── Row-Level Security (RLS) ───────────────────────────────────────────────
ALTER TABLE membership_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_transactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS membership_transactions_isolation_policy ON membership_transactions;
CREATE POLICY membership_transactions_isolation_policy ON membership_transactions
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

COMMIT;
