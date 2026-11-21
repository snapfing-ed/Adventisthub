"use strict";
const express = require('express');
const {
  verifySession,
  requireTenantRole,
  requireVerifiedTenant,
} = require('../middleware/auth');

const router = express.Router();

const READ_ROLES = ['ADMIN', 'PASTOR', 'ELDER', 'CLERK', 'TREASURER', 'PCM_LEADER'];
const WRITE_ROLES = ['ADMIN', 'PASTOR', 'ELDER', 'CLERK', 'PCM_LEADER'];

const VALID_OFFICER_STATUSES = ['NOMINATED', 'ELECTED', 'DECLINED', 'COMPLETED'];
const VALID_MEETING_TYPES = [
  'CHURCH_BOARD',
  'BUSINESS_MEETING',
  'NOMINATING_COMMITTEE',
  'PCM_EXECUTIVE',
  'PCM_CHAPTER_MEETING',
];
const VALID_ACTION_STATUSES = ['PROPOSED', 'VOTED', 'IN_PROGRESS', 'COMPLETED', 'TABLED'];

const CHURCH_MANUAL_POSITIONS = [
  { department: 'Pastoral & Elders', officeTitle: 'First Elder' },
  { department: 'Pastoral & Elders', officeTitle: 'Elder' },
  { department: 'Secretariat', officeTitle: 'Church Clerk' },
  { department: 'Secretariat', officeTitle: 'Assistant Church Clerk' },
  { department: 'Treasury', officeTitle: 'Church Treasurer' },
  { department: 'Treasury', officeTitle: 'Assistant Treasurer' },
  { department: 'Deaconry', officeTitle: 'Head Deacon' },
  { department: 'Deaconry', officeTitle: 'Head Deaconess' },
  { department: 'Sabbath School', officeTitle: 'Sabbath School Superintendent' },
  { department: 'Sabbath School', officeTitle: 'Sabbath School Secretary' },
  { department: 'Personal Ministries', officeTitle: 'Personal Ministries Leader' },
  { department: 'Personal Ministries', officeTitle: 'Interest Coordinator' },
  { department: 'Adventist Youth (AY)', officeTitle: 'AY Leader' },
  { department: 'Adventist Youth (AY)', officeTitle: 'Pathfinder Director' },
  { department: 'Adventist Youth (AY)', officeTitle: 'Adventurer Director' },
  { department: 'Community Services', officeTitle: 'Dorcas / ACS Leader' },
  { department: 'Ministries', officeTitle: 'Women’s Ministries Leader' },
  { department: 'Ministries', officeTitle: 'Men’s Ministries Coordinator' },
  { department: 'Ministries', officeTitle: 'Family Ministries Leader' },
  { department: 'Ministries', officeTitle: 'Health Ministries Leader' },
  { department: 'Ministries', officeTitle: 'Stewardship Leader' },
  { department: 'Ministries', officeTitle: 'Communication Secretary' },
  { department: 'Ministries', officeTitle: 'Publishing Ministries Coordinator' },
  { department: 'Ministries', officeTitle: 'Education Secretary' },
  { department: 'Ministries', officeTitle: 'Religious Liberty Leader' },
  { department: 'Music & Worship', officeTitle: 'Choir / Music Coordinator' },
];

const PCM_MANUAL_POSITIONS = [
  { department: 'PCM Executive', officeTitle: 'PCM Chapter President' },
  { department: 'PCM Executive', officeTitle: 'Vice President' },
  { department: 'PCM Executive', officeTitle: 'Chapter Secretary' },
  { department: 'PCM Executive', officeTitle: 'Assistant Secretary' },
  { department: 'PCM Executive', officeTitle: 'Chapter Treasurer' },
  { department: 'Spiritual & Chaplains', officeTitle: 'Campus Chaplain' },
  { department: 'Spiritual & Chaplains', officeTitle: 'Faculty / Staff Advisor' },
  { department: 'Spiritual & Chaplains', officeTitle: 'Bible Study & Prayer Coordinator' },
  { department: 'Spiritual & Chaplains', officeTitle: 'Sabbath School & Worship Coordinator' },
  { department: 'Outreach & Fellowship', officeTitle: 'Mission & Campus Evangelism Coordinator' },
  { department: 'Outreach & Fellowship', officeTitle: 'Freshmen Welcome & Welfare Coordinator' },
  { department: 'Outreach & Fellowship', officeTitle: 'Communication & Media Secretary' },
  { department: 'Outreach & Fellowship', officeTitle: 'Music & Chorale Director' },
  { department: 'Outreach & Fellowship', officeTitle: 'Alumni & Home-Church Liaison' },
];

// ── GET /api/governance/position-catalog ───────────────────────────────────
router.get(
  '/governance/position-catalog',
  verifySession,
  requireTenantRole(...READ_ROLES),
  (req, res) => {
    const isPcm = req.tenant?.organization_type === 'PCM_CHAPTER';
    return res.json({
      organizationType: req.tenant?.organization_type || 'CHURCH',
      positions: isPcm ? PCM_MANUAL_POSITIONS : CHURCH_MANUAL_POSITIONS,
    });
  }
);

// ── SERVICE YEARS ──────────────────────────────────────────────────────────
router.get(
  '/service-years',
  verifySession,
  requireTenantRole(...READ_ROLES),
  async (req, res) => {
    try {
      const rows = await req.dbTx(async (client) => {
        const result = await client.query(
          `SELECT * FROM service_years
           WHERE tenant_id = $1
           ORDER BY is_current DESC, start_date DESC`,
          [req.tenant.id]
        );
        return result.rows;
      });
      return res.json({ serviceYears: rows });
    } catch (err) {
      console.error('[service-years GET] error:', err);
      return res.status(500).json({ error: 'Failed to load service years' });
    }
  }
);

router.post(
  '/service-years',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...WRITE_ROLES),
  async (req, res) => {
    const { label, startDate, endDate, isCurrent, notes } = req.body || {};
    if (!label || !startDate || !endDate) {
      return res.status(400).json({ error: 'label, startDate, and endDate are required' });
    }

    try {
      const created = await req.dbTx(async (client) => {
        if (isCurrent) {
          await client.query(
            `UPDATE service_years SET is_current = FALSE WHERE tenant_id = $1`,
            [req.tenant.id]
          );
        }

        const ins = await client.query(
          `INSERT INTO service_years (tenant_id, label, start_date, end_date, is_current, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            req.tenant.id,
            String(label).trim(),
            startDate,
            endDate,
            Boolean(isCurrent),
            notes || null,
            req.user.id,
          ]
        );

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'SERVICE_YEAR_CREATED', 'service_year', $3, $4::jsonb)`,
          [req.tenant.id, req.user.id, ins.rows[0].id, JSON.stringify({ label })]
        );

        return ins.rows[0];
      });

      return res.status(201).json({ serviceYear: created });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'A service year with that label already exists' });
      }
      console.error('[service-years POST] error:', err);
      return res.status(500).json({ error: 'Failed to create service year' });
    }
  }
);

router.patch(
  '/service-years/:id',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...WRITE_ROLES),
  async (req, res) => {
    const { id } = req.params;
    const { isCurrent } = req.body || {};

    try {
      const updated = await req.dbTx(async (client) => {
        if (isCurrent) {
          await client.query(
            `UPDATE service_years SET is_current = FALSE WHERE tenant_id = $1`,
            [req.tenant.id]
          );
        }
        const upd = await client.query(
          `UPDATE service_years
           SET is_current = COALESCE($1, is_current),
               updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3
           RETURNING *`,
          [typeof isCurrent === 'boolean' ? isCurrent : null, id, req.tenant.id]
        );
        return upd.rows[0] || null;
      });

      if (!updated) return res.status(404).json({ error: 'Service year not found' });
      return res.json({ serviceYear: updated });
    } catch (err) {
      console.error('[service-years PATCH] error:', err);
      return res.status(500).json({ error: 'Failed to update service year' });
    }
  }
);

// ── OFFICERS & NOMINATING COMMITTEE ────────────────────────────────────────
router.get(
  '/officers',
  verifySession,
  requireTenantRole(...READ_ROLES),
  async (req, res) => {
    const { serviceYearId = '', status = '', q = '' } = req.query;

    try {
      const rows = await req.dbTx(async (client) => {
        const params = [req.tenant.id];
        const conditions = ['o.tenant_id = $1'];

        if (serviceYearId) {
          params.push(serviceYearId);
          conditions.push(`o.service_year_id = $${params.length}::uuid`);
        }
        if (status && VALID_OFFICER_STATUSES.includes(status)) {
          params.push(status);
          conditions.push(`o.status = $${params.length}::officer_status`);
        }
        if (q && String(q).trim()) {
          params.push(`%${String(q).trim()}%`);
          const idx = params.length;
          conditions.push(
            `(p.first_name ILIKE $${idx} OR p.last_name ILIKE $${idx} OR o.office_title ILIKE $${idx} OR COALESCE(o.department,'') ILIKE $${idx})`
          );
        }

        const result = await client.query(
          `SELECT
             o.*,
             p.first_name,
             p.last_name,
             p.phone AS person_phone,
             p.email AS person_email,
             p.membership_status,
             sy.label AS service_year_label
           FROM officers o
           JOIN persons p ON p.id = o.person_id
           JOIN service_years sy ON sy.id = o.service_year_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY
             CASE o.status
               WHEN 'ELECTED' THEN 1
               WHEN 'NOMINATED' THEN 2
               WHEN 'COMPLETED' THEN 3
               ELSE 4
             END,
             o.department NULLS LAST,
             o.office_title ASC,
             p.last_name ASC`,
          params
        );
        return result.rows;
      });

      return res.json({ officers: rows });
    } catch (err) {
      console.error('[officers GET] error:', err);
      return res.status(500).json({ error: 'Failed to load officers roster' });
    }
  }
);

router.post(
  '/officers',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...WRITE_ROLES),
  async (req, res) => {
    const {
      serviceYearId,
      personId,
      officeTitle,
      department,
      status,
      firstReadingDate,
      electedDate,
      ordainedOrInstalledDate,
      remarks,
    } = req.body || {};

    if (!serviceYearId || !personId || !officeTitle) {
      return res
        .status(400)
        .json({ error: 'serviceYearId, personId, and officeTitle are required' });
    }

    const resolvedStatus = VALID_OFFICER_STATUSES.includes(status) ? status : 'NOMINATED';

    try {
      const created = await req.dbTx(async (client) => {
        const ins = await client.query(
          `INSERT INTO officers (
             tenant_id, service_year_id, person_id, office_title, department,
             status, first_reading_date, elected_date, ordained_or_installed_date,
             remarks, recorded_by
           )
           VALUES ($1, $2, $3, $4, $5, $6::officer_status, $7, $8, $9, $10, $11)
           RETURNING *`,
          [
            req.tenant.id,
            serviceYearId,
            personId,
            String(officeTitle).trim(),
            department ? String(department).trim() : null,
            resolvedStatus,
            firstReadingDate || null,
            electedDate || null,
            ordainedOrInstalledDate || null,
            remarks || null,
            req.user.id,
          ]
        );

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'OFFICER_RECORDED', 'officer', $3, $4::jsonb)`,
          [
            req.tenant.id,
            req.user.id,
            ins.rows[0].id,
            JSON.stringify({ officeTitle, status: resolvedStatus }),
          ]
        );

        return ins.rows[0];
      });

      return res.status(201).json({ officer: created });
    } catch (err) {
      console.error('[officers POST] error:', err);
      return res.status(500).json({ error: 'Failed to record officer assignment' });
    }
  }
);

router.patch(
  '/officers/:id',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...WRITE_ROLES),
  async (req, res) => {
    const { id } = req.params;
    const {
      status,
      officeTitle,
      department,
      firstReadingDate,
      electedDate,
      ordainedOrInstalledDate,
      remarks,
    } = req.body || {};

    if (status && !VALID_OFFICER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid officer status' });
    }

    try {
      const updated = await req.dbTx(async (client) => {
        const upd = await client.query(
          `UPDATE officers
           SET status = COALESCE($1::officer_status, status),
               office_title = COALESCE($2, office_title),
               department = COALESCE($3, department),
               first_reading_date = COALESCE($4, first_reading_date),
               elected_date = COALESCE($5, elected_date),
               ordained_or_installed_date = COALESCE($6, ordained_or_installed_date),
               remarks = COALESCE($7, remarks),
               updated_at = NOW()
           WHERE id = $8 AND tenant_id = $9
           RETURNING *`,
          [
            status || null,
            officeTitle ? String(officeTitle).trim() : null,
            department !== undefined ? department : null,
            firstReadingDate || null,
            electedDate || null,
            ordainedOrInstalledDate || null,
            remarks !== undefined ? remarks : null,
            id,
            req.tenant.id,
          ]
        );

        if (upd.rows[0]) {
          await client.query(
            `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
             VALUES ($1, $2, 'OFFICER_UPDATED', 'officer', $3, $4::jsonb)`,
            [
              req.tenant.id,
              req.user.id,
              upd.rows[0].id,
              JSON.stringify({ status: upd.rows[0].status, officeTitle: upd.rows[0].office_title }),
            ]
          );
        }

        return upd.rows[0] || null;
      });

      if (!updated) return res.status(404).json({ error: 'Officer record not found' });
      return res.json({ officer: updated });
    } catch (err) {
      console.error('[officers PATCH] error:', err);
      return res.status(500).json({ error: 'Failed to update officer record' });
    }
  }
);

// ── BOARD & BUSINESS MEETINGS ──────────────────────────────────────────────
router.get(
  '/board-meetings',
  verifySession,
  requireTenantRole(...READ_ROLES),
  async (req, res) => {
    try {
      const rows = await req.dbTx(async (client) => {
        const result = await client.query(
          `SELECT
             bm.*,
             sy.label AS service_year_label,
             (SELECT COUNT(*)::int FROM board_actions ba WHERE ba.meeting_id = bm.id) AS actions_count
           FROM board_meetings bm
           LEFT JOIN service_years sy ON sy.id = bm.service_year_id
           WHERE bm.tenant_id = $1
           ORDER BY bm.meeting_date DESC, bm.created_at DESC`,
          [req.tenant.id]
        );
        return result.rows;
      });
      return res.json({ meetings: rows });
    } catch (err) {
      console.error('[board-meetings GET] error:', err);
      return res.status(500).json({ error: 'Failed to load board meetings' });
    }
  }
);

router.post(
  '/board-meetings',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...WRITE_ROLES),
  async (req, res) => {
    const {
      serviceYearId,
      meetingType,
      title,
      meetingDate,
      location,
      chairperson,
      secretaryName,
      attendeesSummary,
      openingPrayerBy,
      closingPrayerBy,
      minutesBody,
      isApproved,
    } = req.body || {};

    if (!VALID_MEETING_TYPES.includes(meetingType) || !title || !meetingDate) {
      return res
        .status(400)
        .json({ error: 'Valid meetingType, title, and meetingDate are required' });
    }

    try {
      const created = await req.dbTx(async (client) => {
        const approvedBool = Boolean(isApproved);
        const ins = await client.query(
          `INSERT INTO board_meetings (
             tenant_id, service_year_id, meeting_type, title, meeting_date,
             location, chairperson, secretary_name, attendees_summary,
             opening_prayer_by, closing_prayer_by, minutes_body,
             is_approved, approved_date, created_by
           )
           VALUES ($1, $2, $3::meeting_type, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           RETURNING *`,
          [
            req.tenant.id,
            serviceYearId || null,
            meetingType,
            String(title).trim(),
            meetingDate,
            location || null,
            chairperson || null,
            secretaryName || null,
            attendeesSummary || null,
            openingPrayerBy || null,
            closingPrayerBy || null,
            minutesBody || null,
            approvedBool,
            approvedBool ? meetingDate : null,
            req.user.id,
          ]
        );

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'BOARD_MEETING_RECORDED', 'board_meeting', $3, $4::jsonb)`,
          [
            req.tenant.id,
            req.user.id,
            ins.rows[0].id,
            JSON.stringify({ meetingType, title, meetingDate }),
          ]
        );

        return ins.rows[0];
      });

      return res.status(201).json({ meeting: created });
    } catch (err) {
      console.error('[board-meetings POST] error:', err);
      return res.status(500).json({ error: 'Failed to create meeting minutes' });
    }
  }
);

router.patch(
  '/board-meetings/:id',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...WRITE_ROLES),
  async (req, res) => {
    const { id } = req.params;
    const { isApproved, minutesBody, title } = req.body || {};

    try {
      const updated = await req.dbTx(async (client) => {
        const upd = await client.query(
          `UPDATE board_meetings
           SET is_approved = COALESCE($1, is_approved),
               approved_date = CASE
                 WHEN $1 = TRUE THEN COALESCE(approved_date, CURRENT_DATE)
                 WHEN $1 = FALSE THEN NULL
                 ELSE approved_date
               END,
               minutes_body = COALESCE($2, minutes_body),
               title = COALESCE($3, title),
               updated_at = NOW()
           WHERE id = $4 AND tenant_id = $5
           RETURNING *`,
          [
            typeof isApproved === 'boolean' ? isApproved : null,
            minutesBody !== undefined ? minutesBody : null,
            title ? String(title).trim() : null,
            id,
            req.tenant.id,
          ]
        );
        return upd.rows[0] || null;
      });

      if (!updated) return res.status(404).json({ error: 'Meeting not found' });
      return res.json({ meeting: updated });
    } catch (err) {
      console.error('[board-meetings PATCH] error:', err);
      return res.status(500).json({ error: 'Failed to update meeting' });
    }
  }
);

// ── VOTED BOARD ACTIONS (WITH OPTIONAL CLERK TRANSACTION LINKING) ──────────
router.get(
  '/board-actions',
  verifySession,
  requireTenantRole(...READ_ROLES),
  async (req, res) => {
    const { meetingId = '' } = req.query;

    try {
      const rows = await req.dbTx(async (client) => {
        const params = [req.tenant.id];
        const conditions = ['ba.tenant_id = $1'];

        if (meetingId) {
          params.push(meetingId);
          conditions.push(`ba.meeting_id = $${params.length}::uuid`);
        }

        const result = await client.query(
          `SELECT
             ba.*,
             bm.title AS meeting_title,
             bm.meeting_type,
             bm.meeting_date,
             mt.id AS linked_transaction_id,
             mt.transaction_type AS linked_transaction_type,
             p.first_name AS linked_person_first_name,
             p.last_name AS linked_person_last_name
           FROM board_actions ba
           JOIN board_meetings bm ON bm.id = ba.meeting_id
           LEFT JOIN membership_transactions mt ON mt.board_action_id = ba.id
           LEFT JOIN persons p ON p.id = mt.person_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY bm.meeting_date DESC, ba.action_number ASC`,
          params
        );
        return result.rows;
      });

      return res.json({ actions: rows });
    } catch (err) {
      console.error('[board-actions GET] error:', err);
      return res.status(500).json({ error: 'Failed to load board actions' });
    }
  }
);

router.post(
  '/board-actions',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...WRITE_ROLES),
  async (req, res) => {
    const {
      meetingId,
      actionNumber,
      category,
      title,
      motionText,
      movedBy,
      secondedBy,
      status,
      assignedTo,
      dueDate,
      linkedMembershipTransactionId,
    } = req.body || {};

    if (!meetingId || !actionNumber || !title || !motionText) {
      return res
        .status(400)
        .json({ error: 'meetingId, actionNumber, title, and motionText are required' });
    }

    const resolvedStatus = VALID_ACTION_STATUSES.includes(status) ? status : 'VOTED';

    try {
      const created = await req.dbTx(async (client) => {
        const meetingRes = await client.query(
          `SELECT id, meeting_type, meeting_date FROM board_meetings WHERE id = $1 AND tenant_id = $2`,
          [meetingId, req.tenant.id]
        );
        if (meetingRes.rows.length === 0) {
          return { notFound: true };
        }
        const meeting = meetingRes.rows[0];

        const ins = await client.query(
          `INSERT INTO board_actions (
             tenant_id, meeting_id, action_number, category, title, motion_text,
             moved_by, seconded_by, status, assigned_to, due_date, created_by
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::action_status, $10, $11, $12)
           RETURNING *`,
          [
            req.tenant.id,
            meetingId,
            String(actionNumber).trim(),
            category || 'GENERAL',
            String(title).trim(),
            String(motionText).trim(),
            movedBy || null,
            secondedBy || null,
            resolvedStatus,
            assignedTo || null,
            dueDate || null,
            req.user.id,
          ]
        );

        const actionRow = ins.rows[0];

        // Link to Module 3 Clerk Transaction when provided
        if (linkedMembershipTransactionId) {
          const isBusiness =
            meeting.meeting_type === 'BUSINESS_MEETING' ||
            meeting.meeting_type === 'PCM_CHAPTER_MEETING';

          await client.query(
            `UPDATE membership_transactions
             SET board_action_id = $1,
                 minute_reference = COALESCE(NULLIF(minute_reference, ''), $2),
                 board_vote_date = CASE WHEN $3 = FALSE THEN COALESCE(board_vote_date, $4) ELSE board_vote_date END,
                 business_meeting_date = CASE WHEN $3 = TRUE THEN COALESCE(business_meeting_date, $4) ELSE business_meeting_date END,
                 updated_at = NOW()
             WHERE id = $5 AND tenant_id = $6`,
            [
              actionRow.id,
              actionRow.action_number,
              isBusiness,
              meeting.meeting_date,
              linkedMembershipTransactionId,
              req.tenant.id,
            ]
          );
        }

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'BOARD_ACTION_RECORDED', 'board_action', $3, $4::jsonb)`,
          [
            req.tenant.id,
            req.user.id,
            actionRow.id,
            JSON.stringify({
              actionNumber: actionRow.action_number,
              title: actionRow.title,
              linkedMembershipTransactionId: linkedMembershipTransactionId || null,
            }),
          ]
        );

        return { action: actionRow };
      });

      if (created.notFound) {
        return res.status(404).json({ error: 'Meeting not found' });
      }
      return res.status(201).json({ action: created.action });
    } catch (err) {
      console.error('[board-actions POST] error:', err);
      return res.status(500).json({ error: 'Failed to record board action' });
    }
  }
);

router.patch(
  '/board-actions/:id',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...WRITE_ROLES),
  async (req, res) => {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!VALID_ACTION_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Valid status is required' });
    }

    try {
      const updated = await req.dbTx(async (client) => {
        const upd = await client.query(
          `UPDATE board_actions
           SET status = $1::action_status, updated_at = NOW()
           WHERE id = $2 AND tenant_id = $3
           RETURNING *`,
          [status, id, req.tenant.id]
        );
        return upd.rows[0] || null;
      });

      if (!updated) return res.status(404).json({ error: 'Board action not found' });
      return res.json({ action: updated });
    } catch (err) {
      console.error('[board-actions PATCH] error:', err);
      return res.status(500).json({ error: 'Failed to update board action' });
    }
  }
);

module.exports = router;
