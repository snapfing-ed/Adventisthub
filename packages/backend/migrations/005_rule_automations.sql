BEGIN;

-- ── Automation Enums & Columns ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE automation_rule_code AS ENUM (
    'SERVICE_YEAR_ROLLOVER',
    'READING_WINDOW_READY',
    'BOARD_ACTION_OVERDUE',
    'STALE_TRANSFER_ALERT',
    'EXPIRED_INVITE_CLEANUP'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Flag columns for non-destructive clerk/board alerts
ALTER TABLE service_years
  ADD COLUMN IF NOT EXISTS rollover_pending BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE officers
  ADD COLUMN IF NOT EXISTS reading_ready_at TIMESTAMPTZ;

ALTER TABLE membership_transactions
  ADD COLUMN IF NOT EXISTS reading_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_stale_alert BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE board_actions
  ADD COLUMN IF NOT EXISTS is_overdue BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Tenant-Configurable Automation Rules ───────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_code automation_rule_code NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_apply BOOLEAN NOT NULL DEFAULT FALSE, -- FALSE = flag for 1-click confirmation; TRUE = auto-execute
  threshold_days INTEGER NOT NULL DEFAULT 7,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, rule_code)
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_tenant ON automation_rules(tenant_id);

-- ── Automation Execution History ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  rule_code automation_rule_code NOT NULL,
  trigger_source TEXT NOT NULL DEFAULT 'SCHEDULER', -- 'SCHEDULER' | 'MANUAL'
  affected_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  executed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_tenant ON automation_runs(tenant_id, created_at DESC);

-- ── Seed Default SDA Church Manual & PCM Rules for Existing Tenants ────────
INSERT INTO automation_rules (tenant_id, rule_code, name, description, is_enabled, auto_apply, threshold_days)
SELECT
  t.id,
  r.rule_code,
  r.name,
  r.description,
  TRUE,
  r.auto_apply,
  r.threshold_days
FROM tenants t
CROSS JOIN (
  VALUES
    (
      'SERVICE_YEAR_ROLLOVER'::automation_rule_code,
      'Service Year & Officer Tenure Rollover',
      'Activates scheduled service years on start_date and flags or completes officer terms after end_date (Church Manual Ch. 9).',
      FALSE,
      0
    ),
    (
      'READING_WINDOW_READY'::automation_rule_code,
      '7-Day First-to-Second Reading Window',
      'Flags nominated officers and FIRST_READING transfers once the 7-day SDA Manual notice period has elapsed.',
      TRUE,
      7
    ),
    (
      'BOARD_ACTION_OVERDUE'::automation_rule_code,
      'Overdue Board & Executive Actions',
      'Marks VOTED or IN_PROGRESS board/executive actions as overdue when due_date passes.',
      TRUE,
      0
    ),
    (
      'STALE_TRANSFER_ALERT'::automation_rule_code,
      'Stale Membership Transfer Follow-Up',
      'Alerts the Clerk/Secretary when a transfer remains uncompleted past 30 days.',
      TRUE,
      30
    )
) AS r(rule_code, name, description, auto_apply, threshold_days)
ON CONFLICT (tenant_id, rule_code) DO NOTHING;

-- ── Row-Level Security (RLS) ───────────────────────────────────────────────
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automation_rules_isolation_policy ON automation_rules;
CREATE POLICY automation_rules_isolation_policy ON automation_rules
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automation_runs_isolation_policy ON automation_runs;
CREATE POLICY automation_runs_isolation_policy ON automation_runs
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

COMMIT;
