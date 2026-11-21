"use strict";
const express = require('express');
const {
  verifySession,
  requireTenantRole,
  requireVerifiedTenant,
} = require('../middleware/auth');

const router = express.Router();

const ALL_STATUSES = [
  'BAPTIZED_MEMBER',
  'PROFESSION_OF_FAITH',
  'STUDENT_MEMBER',
  'VISITOR',
  'TRANSFERRED_OUT',
  'REMOVED',
  'DECEASED',
];

const STATUSES_BY_ORG_TYPE = {
  CHURCH: [
    'BAPTIZED_MEMBER',
    'PROFESSION_OF_FAITH',
    'VISITOR',
    'TRANSFERRED_OUT',
    'REMOVED',
    'DECEASED',
  ],
  PCM_CHAPTER: [
    'STUDENT_MEMBER',
    'VISITOR',
    'TRANSFERRED_OUT',
    'REMOVED',
    'DECEASED',
  ],
};

function getAllowedStatuses(orgType) {
  return STATUSES_BY_ORG_TYPE[orgType] || ALL_STATUSES;
}

function getDefaultStatus(orgType) {
  return orgType === 'PCM_CHAPTER' ? 'STUDENT_MEMBER' : 'BAPTIZED_MEMBER';
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function escapeCsvCell(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const DIRECTORY_READ_ROLES = ['ADMIN', 'PASTOR', 'ELDER', 'CLERK', 'TREASURER', 'PCM_LEADER'];
const DIRECTORY_WRITE_ROLES = ['ADMIN', 'PASTOR', 'CLERK', 'PCM_LEADER'];

// ── GET /api/persons — Search, filter & status counts ──────────────────────
router.get(
  '/persons',
  verifySession,
  requireTenantRole(...DIRECTORY_READ_ROLES),
  async (req, res) => {
    const { q = '', status = '', householdId = '' } = req.query;
    const allowedStatuses = getAllowedStatuses(req.tenant.organization_type);

    try {
      const payload = await req.dbTx(async (client) => {
        const params = [req.tenant.id];
        const conditions = ['p.tenant_id = $1'];

        if (status && ALL_STATUSES.includes(status)) {
          params.push(status);
          conditions.push(`p.membership_status = $${params.length}::member_status`);
        }

        if (householdId) {
          params.push(householdId);
          conditions.push(`p.household_id = $${params.length}::uuid`);
        }

        if (q && String(q).trim()) {
          params.push(`%${String(q).trim()}%`);
          const idx = params.length;
          conditions.push(
            `(p.first_name ILIKE $${idx} OR p.last_name ILIKE $${idx} OR COALESCE(p.phone,'') ILIKE $${idx} OR COALESCE(p.email,'') ILIKE $${idx} OR COALESCE(p.student_id,'') ILIKE $${idx})`
          );
        }

        const listRes = await client.query(
          `SELECT p.*, h.household_name
           FROM persons p
           LEFT JOIN households h ON h.id = p.household_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY p.last_name ASC, p.first_name ASC
           LIMIT 500`,
          params
        );

        const countsRes = await client.query(
          `SELECT membership_status, COUNT(*)::int AS count
           FROM persons
           WHERE tenant_id = $1
           GROUP BY membership_status`,
          [req.tenant.id]
        );

        return {
          persons: listRes.rows,
          counts: countsRes.rows,
          allowedStatuses,
        };
      });

      return res.json(payload);
    } catch (err) {
      console.error('[persons GET] error:', err);
      return res.status(500).json({ error: 'Failed to load directory' });
    }
  }
);

// ── POST /api/persons — Add congregant, visitor, or campus student ─────────
router.post(
  '/persons',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...DIRECTORY_WRITE_ROLES),
  async (req, res) => {
    const {
      firstName,
      lastName,
      gender,
      dateOfBirth,
      phone,
      email,
      address,
      membershipStatus,
      baptismDate,
      baptizingMinister,
      previousChurch,
      sabbathSchoolClass,
      studentId,
      institution,
      programOfStudy,
      yearOfStudy,
      hostelOrResidence,
      homeChurch,
      householdId,
      notes,
    } = req.body || {};

    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'firstName and lastName are required' });
    }

    const allowedStatuses = getAllowedStatuses(req.tenant.organization_type);
    const status = membershipStatus || getDefaultStatus(req.tenant.organization_type);
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: `Status "${status}" is not valid for ${req.tenant.organization_type}`,
      });
    }

    try {
      const person = await req.dbTx(async (client) => {
        const ins = await client.query(
          `INSERT INTO persons (
             tenant_id, household_id, first_name, last_name, gender, date_of_birth,
             phone, email, address, membership_status, baptism_date, baptizing_minister,
             previous_church, sabbath_school_class, student_id, institution,
             program_of_study, year_of_study, hostel_or_residence, home_church,
             notes, created_by
           )
           VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10::member_status, $11, $12,
             $13, $14, $15, $16,
             $17, $18, $19, $20,
             $21, $22
           )
           RETURNING *`,
          [
            req.tenant.id,
            householdId || null,
            String(firstName).trim(),
            String(lastName).trim(),
            gender || null,
            dateOfBirth || null,
            phone || null,
            email ? String(email).trim().toLowerCase() : null,
            address || null,
            status,
            baptismDate || null,
            baptizingMinister || null,
            previousChurch || null,
            sabbathSchoolClass || null,
            studentId || null,
            institution || null,
            programOfStudy || null,
            yearOfStudy || null,
            hostelOrResidence || null,
            homeChurch || null,
            notes || null,
            req.user.id,
          ]
        );

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'PERSON_CREATED', 'person', $3, $4::jsonb)`,
          [
            req.tenant.id,
            req.user.id,
            ins.rows[0].id,
            JSON.stringify({ name: `${firstName} ${lastName}`, membershipStatus: status }),
          ]
        );

        return ins.rows[0];
      });

      return res.status(201).json({ person });
    } catch (err) {
      console.error('[persons POST] error:', err);
      return res.status(500).json({ error: 'Failed to add person to directory' });
    }
  }
);

// ── PATCH /api/persons/:id — Update person details ─────────────────────────
router.patch(
  '/persons/:id',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...DIRECTORY_WRITE_ROLES),
  async (req, res) => {
    const { id } = req.params;
    const b = req.body || {};
    const allowedStatuses = getAllowedStatuses(req.tenant.organization_type);

    if (b.membershipStatus && !allowedStatuses.includes(b.membershipStatus)) {
      return res.status(400).json({
        error: `Status "${b.membershipStatus}" is not valid for ${req.tenant.organization_type}`,
      });
    }

    try {
      const updated = await req.dbTx(async (client) => {
        const q = await client.query(
          `UPDATE persons
           SET first_name = COALESCE($1, first_name),
               last_name = COALESCE($2, last_name),
               gender = COALESCE($3, gender),
               date_of_birth = COALESCE($4, date_of_birth),
               phone = COALESCE($5, phone),
               email = COALESCE($6, email),
               address = COALESCE($7, address),
               membership_status = COALESCE($8::member_status, membership_status),
               baptism_date = COALESCE($9, baptism_date),
               baptizing_minister = COALESCE($10, baptizing_minister),
               sabbath_school_class = COALESCE($11, sabbath_school_class),
               student_id = COALESCE($12, student_id),
               program_of_study = COALESCE($13, program_of_study),
               year_of_study = COALESCE($14, year_of_study),
               hostel_or_residence = COALESCE($15, hostel_or_residence),
               home_church = COALESCE($16, home_church),
               household_id = $17,
               notes = COALESCE($18, notes),
               updated_at = NOW()
           WHERE id = $19 AND tenant_id = $20
           RETURNING *`,
          [
            b.firstName ?? null,
            b.lastName ?? null,
            b.gender ?? null,
            b.dateOfBirth || null,
            b.phone ?? null,
            b.email ?? null,
            b.address ?? null,
            b.membershipStatus ?? null,
            b.baptismDate || null,
            b.baptizingMinister ?? null,
            b.sabbathSchoolClass ?? null,
            b.studentId ?? null,
            b.programOfStudy ?? null,
            b.yearOfStudy ?? null,
            b.hostelOrResidence ?? null,
            b.homeChurch ?? null,
            b.householdId === '' ? null : b.householdId ?? null,
            b.notes ?? null,
            id,
            req.tenant.id,
          ]
        );
        return q.rows[0] || null;
      });

      if (!updated) return res.status(404).json({ error: 'Person not found' });
      return res.json({ person: updated });
    } catch (err) {
      console.error('[persons PATCH] error:', err);
      return res.status(500).json({ error: 'Failed to update person' });
    }
  }
);

// ── GET /api/persons/export — Download filtered directory as CSV ───────────
router.get(
  '/persons/export',
  verifySession,
  requireTenantRole(...DIRECTORY_READ_ROLES),
  async (req, res) => {
    const { q = '', status = '', householdId = '' } = req.query;
    const isPcm = req.tenant.organization_type === 'PCM_CHAPTER';

    try {
      const rows = await req.dbTx(async (client) => {
        const params = [req.tenant.id];
        const conditions = ['p.tenant_id = $1'];

        if (status && ALL_STATUSES.includes(status)) {
          params.push(status);
          conditions.push(`p.membership_status = $${params.length}::member_status`);
        }
        if (householdId) {
          params.push(householdId);
          conditions.push(`p.household_id = $${params.length}::uuid`);
        }
        if (q && String(q).trim()) {
          params.push(`%${String(q).trim()}%`);
          const idx = params.length;
          conditions.push(
            `(p.first_name ILIKE $${idx} OR p.last_name ILIKE $${idx} OR COALESCE(p.phone,'') ILIKE $${idx} OR COALESCE(p.email,'') ILIKE $${idx} OR COALESCE(p.student_id,'') ILIKE $${idx})`
          );
        }

        const listRes = await client.query(
          `SELECT p.*, h.household_name
           FROM persons p
           LEFT JOIN households h ON h.id = p.household_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY p.last_name ASC, p.first_name ASC`,
          params
        );
        return listRes.rows;
      });

      const headers = isPcm
        ? [
            'first_name',
            'last_name',
            'membership_status',
            'gender',
            'phone',
            'email',
            'student_id',
            'program_of_study',
            'hostel_or_residence',
            'home_church',
            'baptism_date',
            'baptizing_minister',
            'household_name',
          ]
        : [
            'first_name',
            'last_name',
            'membership_status',
            'gender',
            'phone',
            'email',
            'address',
            'sabbath_school_class',
            'baptism_date',
            'baptizing_minister',
            'household_name',
          ];

      const csvLines = [headers.join(',')];
      for (const r of rows) {
        const line = headers.map((col) => {
          if (col === 'baptism_date' && r[col]) {
            return escapeCsvCell(String(r[col]).slice(0, 10));
          }
          return escapeCsvCell(r[col]);
        });
        csvLines.push(line.join(','));
      }

      const filename = `${req.tenant.slug}-directory-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csvLines.join('\n'));
    } catch (err) {
      console.error('[persons export] error:', err);
      return res.status(500).json({ error: 'Failed to export CSV' });
    }
  }
);

// ── POST /api/persons/import — Bulk import persons from CSV text ───────────
router.post(
  '/persons/import',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...DIRECTORY_WRITE_ROLES),
  async (req, res) => {
    const { csvText } = req.body || {};
    if (!csvText || !String(csvText).trim()) {
      return res.status(400).json({ error: 'CSV content is required' });
    }

    const lines = String(csvText)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV must include a header row and at least one data row' });
    }

    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
    if (!headers.includes('first_name') || !headers.includes('last_name')) {
      return res.status(400).json({ error: 'CSV header must include first_name and last_name columns' });
    }

    const allowedStatuses = getAllowedStatuses(req.tenant.organization_type);
    const defaultStatus = getDefaultStatus(req.tenant.organization_type);

    try {
      const summary = await req.dbTx(async (client) => {
        let imported = 0;
        const skipped = [];

        for (let i = 1; i < lines.length; i++) {
          const cells = parseCsvLine(lines[i]);
          const row = {};
          headers.forEach((h, idx) => {
            row[h] = cells[idx] || '';
          });

          if (!row.first_name || !row.last_name) {
            skipped.push(`Row ${i + 1}: missing first_name or last_name`);
            continue;
          }

          const rawStatus = (row.membership_status || '').toUpperCase().trim();
          const status = rawStatus ? rawStatus : defaultStatus;
          if (!allowedStatuses.includes(status)) {
            skipped.push(
              `Row ${i + 1} (${row.first_name} ${row.last_name}): invalid status "${status}" for ${req.tenant.organization_type}`
            );
            continue;
          }

          const cleanDate =
            row.baptism_date && /^\d{4}-\d{2}-\d{2}$/.test(row.baptism_date)
              ? row.baptism_date
              : null;

          await client.query(
            `INSERT INTO persons (
               tenant_id, first_name, last_name, gender, phone, email, address,
               membership_status, baptism_date, baptizing_minister, sabbath_school_class,
               student_id, program_of_study, hostel_or_residence, home_church, created_by
             )
             VALUES (
               $1, $2, $3, $4, $5, $6, $7,
               $8::member_status, $9, $10, $11,
               $12, $13, $14, $15, $16
             )`,
            [
              req.tenant.id,
              row.first_name,
              row.last_name,
              row.gender || null,
              row.phone || null,
              row.email ? row.email.toLowerCase() : null,
              row.address || null,
              status,
              cleanDate,
              row.baptizing_minister || null,
              row.sabbath_school_class || null,
              row.student_id || null,
              row.program_of_study || null,
              row.hostel_or_residence || null,
              row.home_church || null,
              req.user.id,
            ]
          );
          imported++;
        }

        if (imported > 0) {
          await client.query(
            `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, metadata)
             VALUES ($1, $2, 'PERSONS_CSV_IMPORTED', 'person', $3::jsonb)`,
            [req.tenant.id, req.user.id, JSON.stringify({ imported, skippedCount: skipped.length })]
          );
        }

        return { imported, skipped };
      });

      return res.json(summary);
    } catch (err) {
      console.error('[persons import] error:', err);
      return res.status(500).json({ error: 'Failed to import CSV' });
    }
  }
);

// ── Optional Households Endpoints ──────────────────────────────────────────
router.get(
  '/households',
  verifySession,
  requireTenantRole(...DIRECTORY_READ_ROLES),
  async (req, res) => {
    try {
      const households = await req.dbTx(async (client) => {
        const q = await client.query(
          `SELECT h.*, COUNT(p.id)::int AS member_count
           FROM households h
           LEFT JOIN persons p ON p.household_id = h.id
           WHERE h.tenant_id = $1
           GROUP BY h.id
           ORDER BY h.household_name ASC`,
          [req.tenant.id]
        );
        return q.rows;
      });
      return res.json({ households });
    } catch (err) {
      console.error('[households GET] error:', err);
      return res.status(500).json({ error: 'Failed to load households' });
    }
  }
);

router.post(
  '/households',
  verifySession,
  requireVerifiedTenant,
  requireTenantRole(...DIRECTORY_WRITE_ROLES),
  async (req, res) => {
    const { householdName, address, cityOrDistrict, primaryPhone, notes } = req.body || {};
    if (!householdName) {
      return res.status(400).json({ error: 'householdName is required' });
    }

    try {
      const household = await req.dbTx(async (client) => {
        const ins = await client.query(
          `INSERT INTO households (tenant_id, household_name, address, city_or_district, primary_phone, notes)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            req.tenant.id,
            String(householdName).trim(),
            address || null,
            cityOrDistrict || null,
            primaryPhone || null,
            notes || null,
          ]
        );
        return ins.rows[0];
      });
      return res.status(201).json({ household });
    } catch (err) {
      console.error('[households POST] error:', err);
      return res.status(500).json({ error: 'Failed to create household' });
    }
  }
);

module.exports = router;
