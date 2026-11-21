"use strict";
const express = require('express');
const {
  verifySession,
  requireTenantRole,
  requireVerifiedTenant,
} = require('../middleware/auth');

const router = express.Router();

const CLERK_READ_ROLES = ['ADMIN', 'PASTOR', 'ELDER', 'CLERK', 'TREASURER', 'PCM_LEADER'];
const CLERK_WRITE_ROLES = ['ADMIN', 'PASTOR', 'CLERK', 'PCM_LEADER'];

const VALID_TX_TYPES = [
  'BAPTISM',
  'PROFESSION_OF_FAITH',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'DISCIPLINE_REMOVAL',
  'DEATH',
  'MISSING',
  'CAMPUS_GRADUATION',
  'CAMPUS_TRANSFER_OUT',
];

const VALID_TRANSFER_STATUSES = [
  'REQUESTED',
  'FIRST_READING',
  'BOARD_RECOMMENDED',
  'BUSINESS_VOTED',
  'COMPLETED',
  'CANCELLED',
];

const TRANSFER_TYPES = ['TRANSFER_IN', 'TRANSFER_OUT', 'CAMPUS_TRANSFER_OUT'];

function resolveTargetStatus(txType, orgType) {
  switch (txType) {
    case 'BAPTISM':
      return orgType === 'PCM_CHAPTER' ? 'STUDENT_MEMBER' : 'BAPTIZED_MEMBER';
    case 'PROFESSION_OF_FAITH':
      return 'PROFESSION_OF_FAITH';
    case 'TRANSFER_IN':
      return orgType === 'PCM_CHAPTER' ? 'STUDENT_MEMBER' : 'BAPTIZED_MEMBER';
    case 'TRANSFER_OUT':
    case 'CAMPUS_TRANSFER_OUT':
    case 'CAMPUS_GRADUATION':
      return 'TRANSFERRED_OUT';
    case 'DISCIPLINE_REMOVAL':
    case 'MISSING':
      return 'REMOVED';
    case 'DEATH':
      return 'DECEASED';
    default:
      return null;
  }
}

// ── GET /api/membership-transactions — Filterable Clerk Audit Register ─────
router.get(
  '/membership-transactions',
  verifySession,
  requireTenantRole(...CLERK_READ_ROLES),
  async (req, res) => {
    const { type = '', transferStatus = '', personId = '', q = '' } = req.query;

    try {
      const payload = await req.dbTx(async (client) => {
        const params = [req.tenant.id];
        const conditions = ['mt.tenant_id = $1'];

        if (type && VALID_TX_TYPES.includes(type)) {
          params.push(type);
          conditions.push(`mt.transaction_type = $${params.length}::transaction_type`);
        }

        if (transferStatus && VALID_TRANSFER_STATUSES.includes(transferStatus)) {
          params.push(transferStatus);
          conditions.push(`mt.transfer_status = $${params.length}::transfer_status`);
        }

        if (personId) {
          params.push(personId);
          conditions.push(`mt.person_id = $${params.length}::uuid`);
        }

        if (q && String(q).trim()) {
          params.push(`%${String(q).trim()}%`);
          const idx = params.length;
          conditions.push(
            `(p.first_name ILIKE $${idx} OR p.last_name ILIKE $${idx} OR COALESCE(mt.other_church_or_chapter,'') ILIKE $${idx} OR COALESCE(mt.minute_reference,'') ILIKE $${idx})`
          );
        }

        const listRes = await client.query(
          `SELECT
             mt.*,
             p.first_name,
             p.last_name,
             p.student_id,
             p.membership_status AS current_person_status,
             u.full_name AS recorded_by_name
           FROM membership_transactions mt
           JOIN persons p ON p.id = mt.person_id
           LEFT JOIN users u ON u.id = mt.recorded_by
           WHERE ${conditions.join(' AND ')}
           ORDER BY mt.effective_date DESC, mt.created_at DESC
           LIMIT 500`,
          params
        );

        const statsRes = await client.query(
          `SELECT
             COUNT(*)::int AS total_transactions,
             COUNT(*) FILTER (
               WHERE transfer_status IS NOT NULL
                 AND transfer_status NOT IN ('COMPLETED', 'CANCELLED')
             )::int AS pending_transfers,
             COUNT(*) FILTER (
               WHERE transaction_type IN ('BAPTISM', 'PROFESSION_OF_FAITH')
             )::int AS additions_count,
             COUNT(*) FILTER (
               WHERE transaction_type IN ('TRANSFER_OUT', 'CAMPUS_TRANSFER_OUT', 'CAMPUS_GRADUATION')
             )::int AS transfers_out_count
           FROM membership_transactions
           WHERE tenant_id = $1`,
          [req.tenant.id]
        );

        return {
          transactions: listRes.rows,
          stats: statsRes.rows[0] || {
            total_transactions: 0,
            pending_transfers: 0,
            additions_count: 0,
            transfers_out_count: 0,
          },
        };
      });

      return res.json(payload);
    } catch (err) {
      console.error('[membership-transactions GET] error:', err);
      return res.status(500).json({ error: 'Failed to load membership transactions' });
    }
  }
);

// ── POST /api/membership-transactions — Record Clerk Transaction ───────────
router.post(
  '/membership-transactions',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...CLERK_WRITE_ROLES),
  async (req, res) => {
    const {
      personId,
      transactionType,
      transferStatus,
      firstReadingDate,
      boardVoteDate,
      businessMeetingDate,
      effectiveDate,
      otherChurchOrChapter,
      officiatingMinister,
      minuteReference,
      boardActionId,
      remarks,
    } = req.body || {};

    if (!personId || !VALID_TX_TYPES.includes(transactionType)) {
      return res
        .status(400)
        .json({ error: 'personId and a valid transactionType are required' });
    }

    const isTransfer = TRANSFER_TYPES.includes(transactionType);
    const resolvedTransferStatus = isTransfer
      ? VALID_TRANSFER_STATUSES.includes(transferStatus)
        ? transferStatus
        : 'REQUESTED'
      : null;

    const targetStatus = resolveTargetStatus(
      transactionType,
      req.tenant.organization_type
    );

    try {
      const result = await req.dbTx(async (client) => {
        const personRes = await client.query(
          `SELECT id, first_name, last_name, membership_status
           FROM persons
           WHERE id = $1 AND tenant_id = $2
           FOR UPDATE`,
          [personId, req.tenant.id]
        );

        if (personRes.rows.length === 0) {
          return { notFound: true };
        }

        const person = personRes.rows[0];
        const previousStatus = person.membership_status;
        const effDate = effectiveDate || new Date().toISOString().slice(0, 10);

        const txIns = await client.query(
          `INSERT INTO membership_transactions (
             tenant_id, person_id, transaction_type, previous_status, new_status,
             transfer_status, first_reading_date, board_vote_date, business_meeting_date,
             effective_date, other_church_or_chapter, officiating_minister,
             minute_reference, board_action_id, remarks, recorded_by
           )
           VALUES (
             $1, $2, $3::transaction_type, $4::member_status, $5::member_status,
             $6::transfer_status, $7, $8, $9,
             $10, $11, $12,
             $13, $14, $15, $16
           )
           RETURNING *`,
          [
            req.tenant.id,
            person.id,
            transactionType,
            previousStatus,
            targetStatus,
            resolvedTransferStatus,
            firstReadingDate || null,
            boardVoteDate || null,
            businessMeetingDate || null,
            effDate,
            otherChurchOrChapter || null,
            officiatingMinister || null,
            minuteReference || null,
            boardActionId || null,
            remarks || null,
            req.user.id,
          ]
        );

        const shouldApplyStatusNow =
          !isTransfer || resolvedTransferStatus === 'COMPLETED';

        if (shouldApplyStatusNow) {
          if (transactionType === 'BAPTISM') {
            await client.query(
              `UPDATE persons
               SET membership_status = $1::member_status,
                   baptism_date = COALESCE($2, baptism_date),
                   baptizing_minister = COALESCE($3, baptizing_minister),
                   updated_at = NOW()
               WHERE id = $4 AND tenant_id = $5`,
              [
                targetStatus,
                effDate,
                officiatingMinister || null,
                person.id,
                req.tenant.id,
              ]
            );
          } else if (transactionType === 'TRANSFER_IN' && otherChurchOrChapter) {
            await client.query(
              `UPDATE persons
               SET membership_status = $1::member_status,
                   previous_church = COALESCE($2, previous_church),
                   updated_at = NOW()
               WHERE id = $3 AND tenant_id = $4`,
              [targetStatus, otherChurchOrChapter, person.id, req.tenant.id]
            );
          } else {
            await client.query(
              `UPDATE persons
               SET membership_status = $1::member_status,
                   updated_at = NOW()
               WHERE id = $2 AND tenant_id = $3`,
              [targetStatus, person.id, req.tenant.id]
            );
          }
        }

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'MEMBERSHIP_TRANSACTION_RECORDED', 'membership_transaction', $3, $4::jsonb)`,
          [
            req.tenant.id,
            req.user.id,
            txIns.rows[0].id,
            JSON.stringify({
              personId: person.id,
              personName: `${person.first_name} ${person.last_name}`,
              transactionType,
              previousStatus,
              newStatus: targetStatus,
              transferStatus: resolvedTransferStatus,
              appliedToRoll: shouldApplyStatusNow,
            }),
          ]
        );

        return { transaction: txIns.rows[0] };
      });

      if (result.notFound) {
        return res.status(404).json({ error: 'Person not found in this organization' });
      }

      return res.status(201).json({ transaction: result.transaction });
    } catch (err) {
      console.error('[membership-transactions POST] error:', err);
      return res.status(500).json({ error: 'Failed to record membership transaction' });
    }
  }
);

// ── PATCH /api/membership-transactions/:id — Advance Transfer / Vote Dates ──
router.patch(
  '/membership-transactions/:id',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...CLERK_WRITE_ROLES),
  async (req, res) => {
    const { id } = req.params;
    const {
      transferStatus,
      firstReadingDate,
      boardVoteDate,
      businessMeetingDate,
      effectiveDate,
      minuteReference,
      remarks,
    } = req.body || {};

    try {
      const result = await req.dbTx(async (client) => {
        const existingRes = await client.query(
          `SELECT mt.*, p.first_name, p.last_name
           FROM membership_transactions mt
           JOIN persons p ON p.id = mt.person_id
           WHERE mt.id = $1 AND mt.tenant_id = $2
           FOR UPDATE`,
          [id, req.tenant.id]
        );

        if (existingRes.rows.length === 0) {
          return { notFound: true };
        }

        const existing = existingRes.rows[0];
        const nextTransferStatus = VALID_TRANSFER_STATUSES.includes(transferStatus)
          ? transferStatus
          : existing.transfer_status;

        const updRes = await client.query(
          `UPDATE membership_transactions
           SET transfer_status = $1::transfer_status,
               first_reading_date = COALESCE($2, first_reading_date),
               board_vote_date = COALESCE($3, board_vote_date),
               business_meeting_date = COALESCE($4, business_meeting_date),
               effective_date = COALESCE($5, effective_date),
               minute_reference = COALESCE($6, minute_reference),
               remarks = COALESCE($7, remarks),
               updated_at = NOW()
           WHERE id = $8 AND tenant_id = $9
           RETURNING *`,
          [
            nextTransferStatus,
            firstReadingDate || null,
            boardVoteDate || null,
            businessMeetingDate || null,
            effectiveDate || null,
            minuteReference ?? null,
            remarks ?? null,
            id,
            req.tenant.id,
          ]
        );

        const updatedTx = updRes.rows[0];

        // When a multi-step transfer reaches COMPLETED, update the person's roll status
        if (
          nextTransferStatus === 'COMPLETED' &&
          existing.transfer_status !== 'COMPLETED'
        ) {
          await client.query(
            `UPDATE persons
             SET membership_status = $1::member_status,
                 previous_church = CASE
                   WHEN $2 = 'TRANSFER_IN' AND $3 IS NOT NULL THEN $3
                   ELSE previous_church
                 END,
                 updated_at = NOW()
             WHERE id = $4 AND tenant_id = $5`,
            [
              updatedTx.new_status,
              updatedTx.transaction_type,
              updatedTx.other_church_or_chapter,
              updatedTx.person_id,
              req.tenant.id,
            ]
          );
        }

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'MEMBERSHIP_TRANSACTION_UPDATED', 'membership_transaction', $3, $4::jsonb)`,
          [
            req.tenant.id,
            req.user.id,
            updatedTx.id,
            JSON.stringify({
              personName: `${existing.first_name} ${existing.last_name}`,
              previousTransferStatus: existing.transfer_status,
              transferStatus: nextTransferStatus,
            }),
          ]
        );

        return { transaction: updatedTx };
      });

      if (result.notFound) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      return res.json({ transaction: result.transaction });
    } catch (err) {
      console.error('[membership-transactions PATCH] error:', err);
      return res.status(500).json({ error: 'Failed to update transaction' });
    }
  }
);

module.exports = router;
