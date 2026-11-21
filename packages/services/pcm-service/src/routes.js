"use strict";
const express = require('express');
const {
  verifySession,
  requireTenantRole,
  requireVerifiedTenant,
} = require('../../../shared/src');

const router = express.Router();

const PCM_ALLOWED_ROLES = ['ADMIN', 'PCM_LEADER', 'PASTOR', 'ELDER', 'CLERK'];
const VALID_ACADEMIC_STATUSES = [
  'FRESHMAN_INTAKE',
  'ACTIVE_STUDENT',
  'STUDENT_LEADER',
  'FINAL_YEAR',
  'ALUMNI_TRANSITIONED',
];
const VALID_GROUP_TYPES = [
  'BIBLE_STUDY_BAND',
  'PRAYER_CELL',
  'FRESHMAN_ORIENTATION',
  'OUTREACH_TEAM',
  'ALUMNI_NETWORK',
];
const VALID_PAIR_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED'];

router.use(verifySession, requireTenantRole(...PCM_ALLOWED_ROLES));

// ── 1. Overview KPIs + Elected PCM Leadership Integration ──────────────────
router.get('/pcm/overview', async (req, res, next) => {
  try {
    const data = await req.dbTx(async (client) => {
      const [statsRes, leadersRes] = await Promise.all([
        client.query(
          `SELECT
             (SELECT COUNT(*)::int FROM persons WHERE tenant_id = $1) AS total_persons,
             (SELECT COUNT(*)::int FROM pcm_profiles WHERE tenant_id = $1) AS enriched_profiles,
             (SELECT COUNT(*)::int FROM pcm_profiles WHERE tenant_id = $1 AND academic_status = 'FRESHMAN_INTAKE') AS freshman_count,
             (SELECT COUNT(*)::int FROM pcm_profiles WHERE tenant_id = $1 AND academic_status = 'FINAL_YEAR') AS final_year_count,
             (SELECT COUNT(*)::int FROM pcm_profiles WHERE tenant_id = $1 AND baptismal_interest = TRUE) AS baptismal_interests,
             (SELECT COUNT(*)::int FROM pcm_profiles WHERE tenant_id = $1 AND mentor_eligible = TRUE) AS eligible_mentors,
             (SELECT COUNT(*)::int FROM pcm_fellowship_groups WHERE tenant_id = $1 AND is_active = TRUE) AS active_groups,
             (SELECT COUNT(*)::int FROM mentorship_pairs WHERE tenant_id = $1 AND status = 'ACTIVE') AS active_pairs,
             (SELECT COUNT(*)::int FROM mentorship_checkins WHERE tenant_id = $1 AND follow_up_needed = TRUE) AS open_followups`,
          [req.tenant.id]
        ),
        client.query(
          `SELECT o.id, o.office_title, o.department, o.status,
                  p.id AS person_id, p.first_name, p.last_name, p.phone, p.email,
                  sy.label AS service_year_label
           FROM officers o
           JOIN persons p ON p.id = o.person_id
           LEFT JOIN service_years sy ON sy.id = o.service_year_id
           WHERE o.tenant_id = $1
             AND o.status = 'ELECTED'
             AND (
               $2 = 'PCM_CHAPTER'
               OR LOWER(COALESCE(o.department, '')) LIKE '%pcm%'
               OR LOWER(COALESCE(o.department, '')) LIKE '%campus%'
               OR LOWER(COALESCE(o.department, '')) LIKE '%youth%'
               OR LOWER(o.office_title) LIKE '%pcm%'
               OR LOWER(o.office_title) LIKE '%chaplain%'
             )
           ORDER BY o.department NULLS LAST, o.office_title`,
          [req.tenant.id, req.tenant.organization_type]
        ),
      ]);

      return {
        stats: statsRes.rows[0],
        chapterLeaders: leadersRes.rows,
      };
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ── 2. Student / Member PCM Profiles (Joined to Authoritative persons) ─────
router.get('/pcm/profiles', async (req, res, next) => {
  try {
    const { status, gradYear, baptismalInterest, mentorEligible, q } = req.query;

    const profiles = await req.dbTx(async (client) => {
      const conditions = ['p.tenant_id = $1'];
      // Keep the fallback institution in $2. Filter parameters start at $3 so
      // a status filter cannot accidentally bind to COALESCE(..., $2).
      const params = [req.tenant.id, req.tenant.city_or_campus || ''];

      if (status && VALID_ACADEMIC_STATUSES.includes(status)) {
        params.push(status);
        conditions.push(`pp.academic_status = $${params.length}`);
      }
      if (gradYear && Number.isFinite(Number(gradYear))) {
        params.push(Number(gradYear));
        conditions.push(`pp.graduation_year = $${params.length}`);
      }
      if (baptismalInterest === 'true') {
        conditions.push(`pp.baptismal_interest = TRUE`);
      }
      if (mentorEligible === 'true') {
        conditions.push(`pp.mentor_eligible = TRUE`);
      }
      if (q && q.trim()) {
        params.push(`%${q.trim().toLowerCase()}%`);
        const idx = params.length;
        conditions.push(
          `(LOWER(p.first_name || ' ' || p.last_name) LIKE $${idx}
            OR LOWER(COALESCE(pp.academic_institution, '')) LIKE $${idx}
            OR LOWER(COALESCE(pp.campus_faculty, '')) LIKE $${idx}
            OR LOWER(COALESCE(pp.program_of_study, p.program_of_study, '')) LIKE $${idx}
            OR LOWER(COALESCE(pp.student_number, p.student_id, '')) LIKE $${idx})`
        );
      }

      const result = await client.query(
        `SELECT
           p.id AS person_id,
           p.first_name,
           p.last_name,
           p.email,
           p.phone,
           p.gender,
           p.membership_status,
           p.student_id AS directory_student_id,
           p.program_of_study AS directory_program,
           p.year_of_study AS directory_year,
           p.hostel_or_residence,
           pp.id AS pcm_profile_id,
           COALESCE(pp.academic_institution, $2) AS academic_institution,
           COALESCE(pp.academic_status, 'ACTIVE_STUDENT') AS academic_status,
           pp.campus_faculty,
           COALESCE(pp.program_of_study, p.program_of_study) AS program_of_study,
           COALESCE(pp.student_number, p.student_id) AS student_number,
           COALESCE(pp.year_of_study::text, p.year_of_study) AS year_of_study,
           pp.graduation_year,
           pp.expected_graduation_date,
           pp.faculty_advisor_name,
           pp.faculty_advisor_contact,
           COALESCE(pp.baptismal_interest, FALSE) AS baptismal_interest,
           pp.spiritual_gifts,
           pp.emergency_contact,
           COALESCE(pp.mentor_eligible, FALSE) AS mentor_eligible,
           pp.notes,
           pp.updated_at AS profile_updated_at
         FROM persons p
         LEFT JOIN pcm_profiles pp
           ON pp.person_id = p.id AND pp.tenant_id = p.tenant_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY pp.updated_at DESC NULLS LAST, p.last_name ASC, p.first_name ASC`,
        params
      );

      return result.rows;
    });

    res.json({ profiles });
  } catch (err) {
    next(err);
  }
});

router.put('/pcm/profiles/:personId', requireVerifiedTenant, async (req, res, next) => {
  try {
    const { personId } = req.params;
    const {
      academicInstitution,
      academicStatus = 'ACTIVE_STUDENT',
      campusFaculty,
      programOfStudy,
      studentNumber,
      yearOfStudy,
      graduationYear,
      expectedGraduationDate,
      facultyAdvisorName,
      facultyAdvisorContact,
      baptismalInterest = false,
      spiritualGifts,
      emergencyContact,
      mentorEligible = false,
      notes,
    } = req.body || {};

    if (!VALID_ACADEMIC_STATUSES.includes(academicStatus)) {
      return res.status(400).json({ error: 'Invalid academic_status value.' });
    }

    const parsedYear = yearOfStudy !== '' && yearOfStudy != null ? Number(yearOfStudy) : null;
    const parsedGradYear =
      graduationYear !== '' && graduationYear != null ? Number(graduationYear) : null;

    const saved = await req.dbTx(async (client) => {
      const personCheck = await client.query(
        `SELECT id, first_name, last_name FROM persons WHERE id = $1 AND tenant_id = $2`,
        [personId, req.tenant.id]
      );
      if (personCheck.rows.length === 0) {
        const err = new Error('Person record not found in this organization.');
        err.status = 404;
        throw err;
      }

      const upsertRes = await client.query(
        `INSERT INTO pcm_profiles (
           tenant_id, person_id, academic_institution, academic_status,
           campus_faculty, program_of_study, student_number, year_of_study,
           graduation_year, expected_graduation_date,
           faculty_advisor_name, faculty_advisor_contact,
           baptismal_interest, spiritual_gifts, emergency_contact,
           mentor_eligible, notes, updated_by
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (tenant_id, person_id) DO UPDATE SET
           academic_institution = EXCLUDED.academic_institution,
           academic_status = EXCLUDED.academic_status,
           campus_faculty = EXCLUDED.campus_faculty,
           program_of_study = EXCLUDED.program_of_study,
           student_number = EXCLUDED.student_number,
           year_of_study = EXCLUDED.year_of_study,
           graduation_year = EXCLUDED.graduation_year,
           expected_graduation_date = EXCLUDED.expected_graduation_date,
           faculty_advisor_name = EXCLUDED.faculty_advisor_name,
           faculty_advisor_contact = EXCLUDED.faculty_advisor_contact,
           baptismal_interest = EXCLUDED.baptismal_interest,
           spiritual_gifts = EXCLUDED.spiritual_gifts,
           emergency_contact = EXCLUDED.emergency_contact,
           mentor_eligible = EXCLUDED.mentor_eligible,
           notes = EXCLUDED.notes,
           updated_by = EXCLUDED.updated_by
         RETURNING *`,
        [
          req.tenant.id,
          personId,
          academicInstitution || null,
          academicStatus,
          campusFaculty || null,
          programOfStudy || null,
          studentNumber || null,
          Number.isFinite(parsedYear) ? parsedYear : null,
          Number.isFinite(parsedGradYear) ? parsedGradYear : null,
          expectedGraduationDate || null,
          facultyAdvisorName || null,
          facultyAdvisorContact || null,
          Boolean(baptismalInterest),
          spiritualGifts || null,
          emergencyContact || null,
          Boolean(mentorEligible),
          notes || null,
          req.user.id,
        ]
      );

      // Keep persons campus columns in sync when provided
      await client.query(
        `UPDATE persons
         SET student_id = COALESCE($3, student_id),
             program_of_study = COALESCE($4, program_of_study),
             year_of_study = COALESCE($5::text, year_of_study)
         WHERE id = $1 AND tenant_id = $2`,
        [
          personId,
          req.tenant.id,
          studentNumber || null,
          programOfStudy || null,
          Number.isFinite(parsedYear) ? parsedYear : null,
        ]
      );

      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'PCM_PROFILE_UPSERTED', 'pcm_profiles', $3, $4::jsonb)`,
        [
          req.tenant.id,
          req.user.id,
          upsertRes.rows[0].id,
          JSON.stringify({
            personId,
            academicStatus,
            graduationYear: parsedGradYear,
            mentorEligible: Boolean(mentorEligible),
          }),
        ]
      );

      return upsertRes.rows[0];
    });

    res.json({ profile: saved });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// Semester Transition Batch Update (e.g., Freshman -> Active, Final Year -> Alumni)
router.post('/pcm/profiles/semester-transition', requireVerifiedTenant, async (req, res, next) => {
  try {
    const { fromStatus, toStatus, graduationYear } = req.body || {};
    if (
      !VALID_ACADEMIC_STATUSES.includes(fromStatus) ||
      !VALID_ACADEMIC_STATUSES.includes(toStatus)
    ) {
      return res.status(400).json({ error: 'Valid fromStatus and toStatus are required.' });
    }

    const updatedCount = await req.dbTx(async (client) => {
      const params = [req.tenant.id, toStatus, req.user.id, fromStatus];
      let extraFilter = '';
      if (graduationYear && Number.isFinite(Number(graduationYear))) {
        params.push(Number(graduationYear));
        extraFilter = ` AND graduation_year = $${params.length}`;
      }

      const upd = await client.query(
        `UPDATE pcm_profiles
         SET academic_status = $2,
             mentor_eligible = CASE WHEN $2 = 'ALUMNI_TRANSITIONED' THEN TRUE ELSE mentor_eligible END,
             updated_by = $3
         WHERE tenant_id = $1 AND academic_status = $4 ${extraFilter}
         RETURNING id`,
        params
      );

      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, metadata)
         VALUES ($1, $2, 'PCM_SEMESTER_TRANSITION', 'pcm_profiles', $3::jsonb)`,
        [
          req.tenant.id,
          req.user.id,
          JSON.stringify({
            fromStatus,
            toStatus,
            graduationYear: graduationYear || null,
            affectedCount: upd.rowCount,
          }),
        ]
      );

      return upd.rowCount;
    });

    res.json({ updatedCount });
  } catch (err) {
    next(err);
  }
});

// ── 3. Campus Fellowship Groups, Prayer Cells & Study Bands ────────────────
router.get('/pcm/groups', async (req, res, next) => {
  try {
    const groups = await req.dbTx(async (client) => {
      const grpRes = await client.query(
        `SELECT g.*,
                p.first_name AS leader_first_name,
                p.last_name AS leader_last_name,
                p.phone AS leader_phone,
                sy.label AS service_year_label
         FROM pcm_fellowship_groups g
         LEFT JOIN persons p ON p.id = g.leader_person_id
         LEFT JOIN service_years sy ON sy.id = g.service_year_id
         WHERE g.tenant_id = $1
         ORDER BY g.is_active DESC, g.name ASC`,
        [req.tenant.id]
      );

      const memRes = await client.query(
        `SELECT gm.*, p.first_name, p.last_name, p.phone, p.membership_status,
                pp.academic_status, pp.graduation_year
         FROM pcm_group_members gm
         JOIN persons p ON p.id = gm.person_id
         LEFT JOIN pcm_profiles pp ON pp.person_id = p.id AND pp.tenant_id = gm.tenant_id
         WHERE gm.tenant_id = $1 AND gm.is_active = TRUE
         ORDER BY p.last_name ASC, p.first_name ASC`,
        [req.tenant.id]
      );

      const membersByGroup = {};
      for (const m of memRes.rows) {
        if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = [];
        membersByGroup[m.group_id].push(m);
      }

      return grpRes.rows.map((g) => ({
        ...g,
        members: membersByGroup[g.id] || [],
      }));
    });

    res.json({ groups });
  } catch (err) {
    next(err);
  }
});

router.post('/pcm/groups', requireVerifiedTenant, async (req, res, next) => {
  try {
    const {
      name,
      groupType = 'BIBLE_STUDY_BAND',
      leaderPersonId,
      serviceYearId,
      meetingSchedule,
      location,
      description,
    } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required.' });
    }
    if (!VALID_GROUP_TYPES.includes(groupType)) {
      return res.status(400).json({ error: 'Invalid group_type.' });
    }

    const group = await req.dbTx(async (client) => {
      const ins = await client.query(
        `INSERT INTO pcm_fellowship_groups (
           tenant_id, service_year_id, name, group_type,
           leader_person_id, meeting_schedule, location, description, created_by
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          req.tenant.id,
          serviceYearId || null,
          name.trim(),
          groupType,
          leaderPersonId || null,
          meetingSchedule || null,
          location || null,
          description || null,
          req.user.id,
        ]
      );

      const created = ins.rows[0];
      if (leaderPersonId) {
        await client.query(
          `INSERT INTO pcm_group_members (tenant_id, group_id, person_id, role_in_group)
           VALUES ($1, $2, $3, 'LEADER')
           ON CONFLICT (group_id, person_id) DO UPDATE SET role_in_group = 'LEADER', is_active = TRUE`,
          [req.tenant.id, created.id, leaderPersonId]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'PCM_GROUP_CREATED', 'pcm_fellowship_groups', $3, $4::jsonb)`,
        [req.tenant.id, req.user.id, created.id, JSON.stringify({ name: created.name, groupType })]
      );

      return created;
    });

    res.status(201).json({ group });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A fellowship group with this name already exists.' });
    }
    next(err);
  }
});

router.post('/pcm/groups/:id/members', requireVerifiedTenant, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { personId, roleInGroup = 'MEMBER' } = req.body || {};
    if (!personId) {
      return res.status(400).json({ error: 'personId is required.' });
    }

    const member = await req.dbTx(async (client) => {
      const ins = await client.query(
        `INSERT INTO pcm_group_members (tenant_id, group_id, person_id, role_in_group, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (group_id, person_id)
         DO UPDATE SET role_in_group = EXCLUDED.role_in_group, is_active = TRUE
         RETURNING *`,
        [req.tenant.id, id, personId, roleInGroup || 'MEMBER']
      );

      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'PCM_GROUP_MEMBER_ADDED', 'pcm_group_members', $3, $4::jsonb)`,
        [req.tenant.id, req.user.id, ins.rows[0].id, JSON.stringify({ groupId: id, personId })]
      );

      return ins.rows[0];
    });

    res.status(201).json({ member });
  } catch (err) {
    next(err);
  }
});

router.delete(
  '/pcm/groups/:id/members/:personId',
  requireVerifiedTenant,
  async (req, res, next) => {
    try {
      const { id, personId } = req.params;
      await req.dbTx(async (client) => {
        await client.query(
          `DELETE FROM pcm_group_members
           WHERE tenant_id = $1 AND group_id = $2 AND person_id = $3`,
          [req.tenant.id, id, personId]
        );
      });
      res.json({ removed: true });
    } catch (err) {
      next(err);
    }
  }
);

// ── 4. Mentor–Mentee Pairings & Discipleship Check-In Logs ─────────────────
router.get('/pcm/mentorships', async (req, res, next) => {
  try {
    const { status } = req.query;
    const pairs = await req.dbTx(async (client) => {
      const params = [req.tenant.id];
      let filter = '';
      if (status && VALID_PAIR_STATUSES.includes(status)) {
        params.push(status);
        filter = ` AND mp.status = $${params.length}`;
      }

      const resPairs = await client.query(
        `SELECT mp.*,
                m.first_name AS mentor_first_name,
                m.last_name AS mentor_last_name,
                m.phone AS mentor_phone,
                mpp.academic_status AS mentor_academic_status,
                e.first_name AS mentee_first_name,
                e.last_name AS mentee_last_name,
                e.phone AS mentee_phone,
                epp.academic_status AS mentee_academic_status,
                epp.program_of_study AS mentee_program,
                sy.label AS service_year_label,
                (SELECT COUNT(*)::int FROM mentorship_checkins mc WHERE mc.pair_id = mp.id) AS checkin_count,
                (SELECT MAX(checkin_date) FROM mentorship_checkins mc WHERE mc.pair_id = mp.id) AS last_checkin_date
         FROM mentorship_pairs mp
         JOIN persons m ON m.id = mp.mentor_person_id
         LEFT JOIN pcm_profiles mpp ON mpp.person_id = m.id AND mpp.tenant_id = mp.tenant_id
         JOIN persons e ON e.id = mp.mentee_person_id
         LEFT JOIN pcm_profiles epp ON epp.person_id = e.id AND epp.tenant_id = mp.tenant_id
         LEFT JOIN service_years sy ON sy.id = mp.service_year_id
         WHERE mp.tenant_id = $1 ${filter}
         ORDER BY
           CASE mp.status WHEN 'ACTIVE' THEN 1 WHEN 'PAUSED' THEN 2 ELSE 3 END,
           mp.started_at DESC`,
        params
      );

      return resPairs.rows;
    });

    res.json({ pairs });
  } catch (err) {
    next(err);
  }
});

router.post('/pcm/mentorships', requireVerifiedTenant, async (req, res, next) => {
  try {
    const {
      mentorPersonId,
      menteePersonId,
      serviceYearId,
      focusArea,
      startedAt,
      notes,
    } = req.body || {};

    if (!mentorPersonId || !menteePersonId) {
      return res.status(400).json({ error: 'Both mentor and mentee are required.' });
    }
    if (mentorPersonId === menteePersonId) {
      return res.status(400).json({ error: 'Mentor and mentee cannot be the same person.' });
    }

    const pair = await req.dbTx(async (client) => {
      const ins = await client.query(
        `INSERT INTO mentorship_pairs (
           tenant_id, mentor_person_id, mentee_person_id, service_year_id,
           status, focus_area, started_at, notes, created_by
         )
         VALUES ($1,$2,$3,$4,'ACTIVE',$5,COALESCE($6::date, CURRENT_DATE),$7,$8)
         RETURNING *`,
        [
          req.tenant.id,
          mentorPersonId,
          menteePersonId,
          serviceYearId || null,
          focusArea || null,
          startedAt || null,
          notes || null,
          req.user.id,
        ]
      );

      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'MENTORSHIP_PAIR_CREATED', 'mentorship_pairs', $3, $4::jsonb)`,
        [
          req.tenant.id,
          req.user.id,
          ins.rows[0].id,
          JSON.stringify({ mentorPersonId, menteePersonId, focusArea }),
        ]
      );

      return ins.rows[0];
    });

    res.status(201).json({ pair });
  } catch (err) {
    next(err);
  }
});

router.patch('/pcm/mentorships/:id', requireVerifiedTenant, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, focusArea, notes } = req.body || {};
    if (status && !VALID_PAIR_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid mentorship status.' });
    }

    const pair = await req.dbTx(async (client) => {
      const upd = await client.query(
        `UPDATE mentorship_pairs
         SET status = COALESCE($3, status),
             focus_area = COALESCE($4, focus_area),
             notes = COALESCE($5, notes),
             ended_at = CASE WHEN $3 = 'COMPLETED' THEN CURRENT_DATE ELSE ended_at END
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [id, req.tenant.id, status || null, focusArea ?? null, notes ?? null]
      );

      if (upd.rows.length === 0) {
        const err = new Error('Mentorship pair not found.');
        err.status = 404;
        throw err;
      }

      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'MENTORSHIP_PAIR_UPDATED', 'mentorship_pairs', $3, $4::jsonb)`,
        [req.tenant.id, req.user.id, id, JSON.stringify({ status })]
      );

      return upd.rows[0];
    });

    res.json({ pair });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get('/pcm/mentorships/:pairId/checkins', async (req, res, next) => {
  try {
    const { pairId } = req.params;
    const checkins = await req.dbTx(async (client) => {
      const resCi = await client.query(
        `SELECT mc.*, u.full_name AS recorded_by_name
         FROM mentorship_checkins mc
         LEFT JOIN users u ON u.id = mc.recorded_by
         WHERE mc.tenant_id = $1 AND mc.pair_id = $2
         ORDER BY mc.checkin_date DESC, mc.created_at DESC`,
        [req.tenant.id, pairId]
      );
      return resCi.rows;
    });
    res.json({ checkins });
  } catch (err) {
    next(err);
  }
});

router.post('/pcm/mentorships/:pairId/checkins', requireVerifiedTenant, async (req, res, next) => {
  try {
    const { pairId } = req.params;
    const {
      checkinDate,
      meetingMode = 'IN_PERSON',
      summary,
      prayerRequests,
      followUpNeeded = false,
    } = req.body || {};

    if (!summary || !summary.trim()) {
      return res.status(400).json({ error: 'Check-in summary is required.' });
    }

    const checkin = await req.dbTx(async (client) => {
      const pairCheck = await client.query(
        `SELECT id FROM mentorship_pairs WHERE id = $1 AND tenant_id = $2`,
        [pairId, req.tenant.id]
      );
      if (pairCheck.rows.length === 0) {
        const err = new Error('Mentorship pair not found.');
        err.status = 404;
        throw err;
      }

      const ins = await client.query(
        `INSERT INTO mentorship_checkins (
           tenant_id, pair_id, checkin_date, meeting_mode,
           summary, prayer_requests, follow_up_needed, recorded_by
         )
         VALUES ($1,$2,COALESCE($3::date, CURRENT_DATE),$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          req.tenant.id,
          pairId,
          checkinDate || null,
          meetingMode || 'IN_PERSON',
          summary.trim(),
          prayerRequests || null,
          Boolean(followUpNeeded),
          req.user.id,
        ]
      );

      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'MENTORSHIP_CHECKIN_LOGGED', 'mentorship_checkins', $3, $4::jsonb)`,
        [
          req.tenant.id,
          req.user.id,
          ins.rows[0].id,
          JSON.stringify({ pairId, meetingMode, followUpNeeded: Boolean(followUpNeeded) }),
        ]
      );

      return ins.rows[0];
    });

    res.status(201).json({ checkin });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
