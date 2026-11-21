"use strict";
const express = require('express');
const crypto = require('crypto');
const {
  pool,
  withTenantTx,
  verifySession,
  requireTenantRole,
  requireVerifiedTenant,
} = require('../../../shared/src');

const router = express.Router();

function normalizePhone(phone) {
  return String(phone || '').replace(/[\s\-().]/g, '').trim();
}

function generateInviteCode() {
  return 'AH-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Helper: Resolve the authenticated user's linked person record inside a specific tenant
async function resolveLinkedPerson(client, tenantId, userId) {
  const { rows } = await client.query(
    `SELECT p.*,
            h.household_name,
            h.address AS household_address,
            h.city_or_district AS household_city,
            t.name AS tenant_name,
            t.slug AS tenant_slug,
            t.organization_type,
            t.city_or_campus,
            t.region_or_conference,
            t.verification_status
       FROM persons p
       JOIN tenants t ON t.id = p.tenant_id
       LEFT JOIN households h ON h.id = p.household_id
      WHERE p.tenant_id = $1
        AND p.user_id = $2
      LIMIT 1`,
    [tenantId, userId]
  );
  return rows[0] || null;
}

// ── 1. GET /api/portal/me — Discover all linked profiles & pending claims for req.user ──
router.get('/portal/me', verifySession, async (req, res) => {
  try {
    const requestedTenantId = req.headers['x-tenant-id'] || req.query.tenantId || null;

    // Cross-tenant lookup scoped strictly to req.user.id
    const linkedProfiles = await withTenantTx({ isPlatformAdmin: true }, async (client) => {
      const { rows } = await client.query(
        `SELECT p.id AS person_id,
                p.tenant_id,
                p.first_name,
                p.last_name,
                p.gender,
                p.date_of_birth,
                p.phone,
                p.email,
                p.address,
                p.membership_status,
                p.baptism_date,
                p.baptizing_minister,
                p.previous_church,
                p.sabbath_school_class,
                p.student_id,
                p.institution,
                p.program_of_study,
                p.year_of_study,
                p.hostel_or_residence,
                p.home_church,
                h.household_name,
                t.name AS tenant_name,
                t.slug AS tenant_slug,
                t.organization_type,
                t.city_or_campus,
                t.region_or_conference,
                t.verification_status
           FROM persons p
           JOIN tenants t ON t.id = p.tenant_id
           LEFT JOIN households h ON h.id = p.household_id
          WHERE p.user_id = $1
          ORDER BY t.name ASC`,
        [req.user.id]
      );
      return rows;
    });

    const pendingClaims = await withTenantTx({ isPlatformAdmin: true }, async (client) => {
      const { rows } = await client.query(
        `SELECT r.id,
                r.tenant_id,
                r.person_id,
                r.status,
                r.verification_method,
                r.review_notes,
                r.created_at,
                p.first_name,
                p.last_name,
                t.name AS tenant_name,
                t.slug AS tenant_slug,
                t.organization_type
           FROM profile_claim_requests r
           JOIN persons p ON p.id = r.person_id
           JOIN tenants t ON t.id = r.tenant_id
          WHERE r.user_id = $1
          ORDER BY r.created_at DESC`,
        [req.user.id]
      );
      return rows;
    });

    const activeProfile =
      linkedProfiles.find((p) => p.tenant_id === requestedTenantId) ||
      linkedProfiles[0] ||
      null;

    res.json({
      user: req.user,
      linkedProfiles,
      activeProfile,
      pendingClaims,
      hasOfficerRole: (req.memberships || []).length > 0,
    });
  } catch (err) {
    console.error('[portal-service] GET /portal/me error:', err);
    res.status(500).json({ error: 'Failed to load member portal profile' });
  }
});

// ── 2. POST /api/portal/claim — Claim an unclaimed persons record safely ────
router.post('/portal/claim', verifySession, async (req, res) => {
  try {
    const { tenantSlug, inviteCode, identifier, firstName, lastName } = req.body || {};
    const cleanCode = String(inviteCode || '').trim().toUpperCase();
    const cleanSlug = String(tenantSlug || req.headers['x-tenant-slug'] || '')
      .trim()
      .toLowerCase();
    const cleanIdentifier = String(identifier || req.user.email || '').trim();

    if (!cleanCode && !cleanSlug) {
      return res.status(400).json({
        error: 'Provide either an Invite Claim Code or your Church / PCM Chapter subdomain slug.',
      });
    }

    const result = await withTenantTx({ isPlatformAdmin: true }, async (client) => {
      // Path A: Instant verified claim via officer-issued invite code
      if (cleanCode) {
        const invRes = await client.query(
          `SELECT i.*, p.user_id AS existing_user_id, p.first_name, p.last_name, t.name AS tenant_name
             FROM profile_claim_invites i
             JOIN persons p ON p.id = i.person_id
             JOIN tenants t ON t.id = i.tenant_id
            WHERE i.invite_code = $1
            FOR UPDATE`,
          [cleanCode]
        );
        const invite = invRes.rows[0];
        if (!invite) return { status: 404, error: 'Invalid claim invite code.' };
        if (invite.redeemed_at) return { status: 409, error: 'This invite code has already been used.' };
        if (new Date(invite.expires_at) < new Date()) {
          return { status: 410, error: 'This invite code has expired. Request a new code from your Clerk or PCM Leader.' };
        }
        if (invite.existing_user_id && invite.existing_user_id !== req.user.id) {
          return { status: 409, error: 'This directory profile is already linked to another user account.' };
        }

        await client.query(
          `UPDATE persons SET user_id = $1, updated_at = NOW() WHERE id = $2`,
          [req.user.id, invite.person_id]
        );
        await client.query(
          `UPDATE profile_claim_invites
              SET redeemed_by = $1, redeemed_at = NOW()
            WHERE id = $2`,
          [req.user.id, invite.id]
        );
        await client.query(
          `INSERT INTO profile_claim_requests
             (tenant_id, user_id, person_id, verification_method, submitted_identifier, status, verified_at)
           VALUES ($1, $2, $3, 'INVITE_CODE', $4, 'VERIFIED', NOW())`,
          [invite.tenant_id, req.user.id, invite.person_id, cleanCode]
        );
        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'PORTAL_PROFILE_CLAIMED', 'persons', $3, $4::jsonb)`,
          [
            invite.tenant_id,
            req.user.id,
            invite.person_id,
            JSON.stringify({ method: 'INVITE_CODE', invite_code: cleanCode }),
          ]
        );

        return {
          status: 200,
          claimed: true,
          message: `Profile linked! Welcome, ${invite.first_name} ${invite.last_name} (${invite.tenant_name}).`,
        };
      }

      // Path B: Match against an unclaimed person record in the target tenant
      const tRes = await client.query(
        `SELECT id, name, slug, organization_type FROM tenants WHERE slug = $1 LIMIT 1`,
        [cleanSlug]
      );
      const tenant = tRes.rows[0];
      if (!tenant) {
        return { status: 404, error: `No Church or PCM Chapter found with slug "${cleanSlug}".` };
      }

      // Check if user already claimed a profile in this tenant
      const alreadyLinked = await client.query(
        `SELECT id, first_name, last_name FROM persons WHERE tenant_id = $1 AND user_id = $2 LIMIT 1`,
        [tenant.id, req.user.id]
      );
      if (alreadyLinked.rows[0]) {
        return {
          status: 200,
          claimed: true,
          message: `Your account is already linked to ${alreadyLinked.rows[0].first_name} ${alreadyLinked.rows[0].last_name} at ${tenant.name}.`,
        };
      }

      const normPhone = normalizePhone(cleanIdentifier);
      const lowerEmail = cleanIdentifier.toLowerCase();
      const userEmail = String(req.user.email || '').toLowerCase();

      // Look for exact unclaimed match by email or normalized phone
      const matchRes = await client.query(
        `SELECT id, first_name, last_name, email, phone
           FROM persons
          WHERE tenant_id = $1
            AND user_id IS NULL
            AND (
              LOWER(TRIM(COALESCE(email, ''))) IN ($2, $3)
              OR ($4 <> '' AND REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9+]', '', 'g') = $4)
            )
          LIMIT 2`,
        [tenant.id, lowerEmail, userEmail, normPhone.replace(/[^0-9+]/g, '')]
      );

      if (matchRes.rows.length === 1) {
        const matched = matchRes.rows[0];
        // Auto-link when email matches the verified authenticated user's email; otherwise queue for officer verification
        const exactEmailMatch =
          matched.email && matched.email.trim().toLowerCase() === userEmail;

        if (exactEmailMatch) {
          await client.query(
            `UPDATE persons SET user_id = $1, updated_at = NOW() WHERE id = $2`,
            [req.user.id, matched.id]
          );
          await client.query(
            `INSERT INTO profile_claim_requests
               (tenant_id, user_id, person_id, verification_method, submitted_identifier, status, verified_at)
             VALUES ($1, $2, $3, 'EMAIL_OR_PHONE_MATCH', $4, 'VERIFIED', NOW())`,
            [tenant.id, req.user.id, matched.id, cleanIdentifier]
          );
          await client.query(
            `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
             VALUES ($1, $2, 'PORTAL_PROFILE_CLAIMED', 'persons', $3, $4::jsonb)`,
            [
              tenant.id,
              req.user.id,
              matched.id,
              JSON.stringify({ method: 'EXACT_EMAIL_MATCH', email: userEmail }),
            ]
          );
          return {
            status: 200,
            claimed: true,
            message: `Verified & linked to ${matched.first_name} ${matched.last_name} at ${tenant.name}.`,
          };
        }

        // Phone match -> create PENDING verification request for Clerk/PCM Leader approval
        const reqIns = await client.query(
          `INSERT INTO profile_claim_requests
             (tenant_id, user_id, person_id, verification_method, submitted_identifier, status)
           VALUES ($1, $2, $3, 'EMAIL_OR_PHONE_MATCH', $4, 'PENDING')
           RETURNING id`,
          [tenant.id, req.user.id, matched.id, cleanIdentifier]
        );
        return {
          status: 202,
          claimed: false,
          requestId: reqIns.rows[0].id,
          message: `Match found for ${matched.first_name} ${matched.last_name}. Your claim request has been sent to the ${tenant.name} Clerk/Leader for verification.`,
        };
      }

      // Fallback: Name match for manual officer approval
      const fName = String(firstName || '').trim();
      const lName = String(lastName || '').trim();
      if (fName && lName) {
        const nameRes = await client.query(
          `SELECT id, first_name, last_name
             FROM persons
            WHERE tenant_id = $1
              AND user_id IS NULL
              AND LOWER(first_name) = LOWER($2)
              AND LOWER(last_name) = LOWER($3)
            LIMIT 1`,
          [tenant.id, fName, lName]
        );
        if (nameRes.rows[0]) {
          const person = nameRes.rows[0];
          const reqIns = await client.query(
            `INSERT INTO profile_claim_requests
               (tenant_id, user_id, person_id, verification_method, submitted_identifier, status)
             VALUES ($1, $2, $3, 'MANUAL_REVIEW', $4, 'PENDING')
             RETURNING id`,
            [tenant.id, req.user.id, person.id, `${fName} ${lName} (${cleanIdentifier})`]
          );
          return {
            status: 202,
            claimed: false,
            requestId: reqIns.rows[0].id,
            message: `Claim request submitted for ${person.first_name} ${person.last_name}. Your Clerk or PCM Leader will approve the link shortly.`,
          };
        }
      }

      return {
        status: 404,
        error:
          'No unclaimed directory record matched your email, phone, or name in that organization. Ask your Church Clerk or PCM Leader to add you or issue an Invite Claim Code.',
      };
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    res.status(result.status).json(result);
  } catch (err) {
    console.error('[portal-service] POST /portal/claim error:', err);
    res.status(500).json({ error: 'Failed to process profile claim' });
  }
});

// ── 3. PATCH /api/portal/me/contact — Safe self-service contact field updates ──
router.patch('/portal/me/contact', verifySession, async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.body?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    const { phone, email, address, hostelOrResidence, emergencyContact, spiritualGifts } =
      req.body || {};

    const updated = await withTenantTx({ isPlatformAdmin: true }, async (client) => {
      const person = await resolveLinkedPerson(client, tenantId, req.user.id);
      if (!person) return null;

      const nextPhone = phone !== undefined ? String(phone).trim() || null : person.phone;
      const nextEmail = email !== undefined ? String(email).trim() || null : person.email;
      const nextAddress = address !== undefined ? String(address).trim() || null : person.address;
      const nextHostel =
        hostelOrResidence !== undefined
          ? String(hostelOrResidence).trim() || null
          : person.hostel_or_residence;

      const { rows } = await client.query(
        `UPDATE persons
            SET phone = $1,
                email = $2,
                address = $3,
                hostel_or_residence = $4,
                updated_at = NOW()
          WHERE id = $5 AND tenant_id = $6 AND user_id = $7
          RETURNING *`,
        [nextPhone, nextEmail, nextAddress, nextHostel, person.id, tenantId, req.user.id]
      );

      // Update optional PCM profile self-service fields if profile exists
      if (emergencyContact !== undefined || spiritualGifts !== undefined) {
        await client.query(
          `UPDATE pcm_profiles
              SET emergency_contact = COALESCE($1, emergency_contact),
                  spiritual_gifts = COALESCE($2, spiritual_gifts),
                  updated_at = NOW()
            WHERE tenant_id = $3 AND person_id = $4`,
          [
            emergencyContact !== undefined ? String(emergencyContact).trim() || null : null,
            spiritualGifts !== undefined ? String(spiritualGifts).trim() || null : null,
            tenantId,
            person.id,
          ]
        );
      }

      const diff = {
        phone: nextPhone,
        email: nextEmail,
        address: nextAddress,
        hostel_or_residence: nextHostel,
        ...(emergencyContact !== undefined ? { emergency_contact: emergencyContact } : {}),
        ...(spiritualGifts !== undefined ? { spiritual_gifts: spiritualGifts } : {}),
      };

      await client.query(
        `INSERT INTO member_contact_update_logs (tenant_id, person_id, user_id, changed_fields)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [tenantId, person.id, req.user.id, JSON.stringify(diff)]
      );

      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'MEMBER_SELF_CONTACT_UPDATED', 'persons', $3, $4::jsonb)`,
        [tenantId, req.user.id, person.id, JSON.stringify(diff)]
      );

      return rows[0];
    });

    if (!updated) {
      return res.status(403).json({ error: 'No linked member profile found for your account in this organization.' });
    }

    res.json({ profile: updated, message: 'Contact details updated.' });
  } catch (err) {
    console.error('[portal-service] PATCH /portal/me/contact error:', err);
    res.status(500).json({ error: 'Failed to update contact details' });
  }
});

// ── 4. GET /api/portal/me/membership — Read-only status, transfers & officer roles ──
router.get('/portal/me/membership', verifySession, async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    const payload = await withTenantTx({ isPlatformAdmin: true }, async (client) => {
      const person = await resolveLinkedPerson(client, tenantId, req.user.id);
      if (!person) return null;

      const txRes = await client.query(
        `SELECT id,
                transaction_type,
                previous_status,
                new_status,
                transfer_status,
                first_reading_date,
                board_vote_date,
                business_meeting_date,
                effective_date,
                other_church_or_chapter,
                officiating_minister,
                minute_reference,
                remarks,
                created_at
           FROM membership_transactions
          WHERE tenant_id = $1 AND person_id = $2
          ORDER BY effective_date DESC, created_at DESC`,
        [tenantId, person.id]
      );

      const officersRes = await client.query(
        `SELECT o.id,
                o.role_title,
                o.department,
                o.status,
                o.start_date,
                o.end_date,
                sy.label AS service_year_label
           FROM officers o
           LEFT JOIN service_years sy ON sy.id = o.service_year_id
          WHERE o.tenant_id = $1 AND o.person_id = $2
          ORDER BY o.start_date DESC NULLS LAST, o.created_at DESC`,
        [tenantId, person.id]
      );

      return {
        person,
        transactions: txRes.rows,
        officers: officersRes.rows,
      };
    });

    if (!payload) {
      return res.status(403).json({ error: 'No linked member profile found in this organization.' });
    }

    res.json(payload);
  } catch (err) {
    console.error('[portal-service] GET /portal/me/membership error:', err);
    res.status(500).json({ error: 'Failed to load membership record' });
  }
});

// ── 5. GET /api/portal/me/giving — Personal POSTED stewardship receipts & statement ──
router.get('/portal/me/giving', verifySession, async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    const year = req.query.year ? Number(req.query.year) : null;

    const payload = await withTenantTx({ isPlatformAdmin: true }, async (client) => {
      const person = await resolveLinkedPerson(client, tenantId, req.user.id);
      if (!person) return null;

      const params = [tenantId, person.id];
      let yearFilter = '';
      if (year && Number.isInteger(year)) {
        params.push(year);
        yearFilter = `AND EXTRACT(YEAR FROM c.contribution_date) = $3`;
      }

      const contribRes = await client.query(
        `SELECT c.id,
                c.receipt_number,
                c.contribution_date,
                c.payment_method,
                c.reference_number,
                c.currency,
                c.total_amount,
                c.status,
                c.notes,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', li.id,
                      'fund_name', f.name,
                      'fund_code', f.code,
                      'category', f.category,
                      'amount', li.amount
                    )
                  ) FILTER (WHERE li.id IS NOT NULL),
                  '[]'::json
                ) AS line_items
           FROM contributions c
           LEFT JOIN contribution_line_items li ON li.contribution_id = c.id
           LEFT JOIN funds f ON f.id = li.fund_id
          WHERE c.tenant_id = $1
            AND c.person_id = $2
            AND c.status = 'POSTED'
            ${yearFilter}
          GROUP BY c.id
          ORDER BY c.contribution_date DESC, c.created_at DESC`,
        params
      );

      const summaryRes = await client.query(
        `SELECT f.name AS fund_name,
                f.code AS fund_code,
                f.category,
                c.currency,
                SUM(li.amount)::numeric(14,2) AS total_amount
           FROM contributions c
           JOIN contribution_line_items li ON li.contribution_id = c.id
           JOIN funds f ON f.id = li.fund_id
          WHERE c.tenant_id = $1
            AND c.person_id = $2
            AND c.status = 'POSTED'
            ${yearFilter}
          GROUP BY f.name, f.code, f.category, c.currency
          ORDER BY total_amount DESC`,
        params
      );

      return {
        person: {
          id: person.id,
          first_name: person.first_name,
          last_name: person.last_name,
          email: person.email,
          phone: person.phone,
          address: person.address,
          tenant_name: person.tenant_name,
          organization_type: person.organization_type,
          city_or_campus: person.city_or_campus,
          region_or_conference: person.region_or_conference,
        },
        year: year || 'ALL',
        contributions: contribRes.rows,
        fundSummary: summaryRes.rows,
      };
    });

    if (!payload) {
      return res.status(403).json({ error: 'No linked member profile found in this organization.' });
    }

    res.json(payload);
  } catch (err) {
    console.error('[portal-service] GET /portal/me/giving error:', err);
    res.status(500).json({ error: 'Failed to load stewardship receipts' });
  }
});

// ── 6. GET /api/portal/me/pcm — Personal PCM profile, fellowship groups & mentorship ──
router.get('/portal/me/pcm', verifySession, async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'x-tenant-id header is required' });
    }

    const payload = await withTenantTx({ isPlatformAdmin: true }, async (client) => {
      const person = await resolveLinkedPerson(client, tenantId, req.user.id);
      if (!person) return null;

      const profRes = await client.query(
        `SELECT * FROM pcm_profiles WHERE tenant_id = $1 AND person_id = $2 LIMIT 1`,
        [tenantId, person.id]
      );

      const groupsRes = await client.query(
        `SELECT g.id,
                g.name,
                g.group_type,
                g.meeting_schedule,
                g.location,
                g.description,
                gm.role_in_group,
                gm.joined_at,
                lp.first_name AS leader_first_name,
                lp.last_name AS leader_last_name,
                lp.phone AS leader_phone
           FROM pcm_group_members gm
           JOIN pcm_fellowship_groups g ON g.id = gm.group_id
           LEFT JOIN persons lp ON lp.id = g.leader_person_id
          WHERE gm.tenant_id = $1
            AND gm.person_id = $2
            AND gm.is_active = TRUE
          ORDER BY g.name ASC`,
        [tenantId, person.id]
      );

      const pairsRes = await client.query(
        `SELECT mp.id,
                mp.status,
                mp.focus_area,
                mp.started_at,
                mp.ended_at,
                mp.mentor_person_id,
                mp.mentee_person_id,
                mentor.first_name AS mentor_first_name,
                mentor.last_name AS mentor_last_name,
                mentor.phone AS mentor_phone,
                mentor.email AS mentor_email,
                mentee.first_name AS mentee_first_name,
                mentee.last_name AS mentee_last_name,
                mentee.phone AS mentee_phone,
                mentee.email AS mentee_email,
                (SELECT COUNT(*)::int FROM mentorship_checkins mc WHERE mc.pair_id = mp.id) AS checkins_count,
                (SELECT MAX(mc.checkin_date) FROM mentorship_checkins mc WHERE mc.pair_id = mp.id) AS last_checkin_date
           FROM mentorship_pairs mp
           JOIN persons mentor ON mentor.id = mp.mentor_person_id
           JOIN persons mentee ON mentee.id = mp.mentee_person_id
          WHERE mp.tenant_id = $1
            AND (mp.mentor_person_id = $2 OR mp.mentee_person_id = $2)
          ORDER BY mp.started_at DESC`,
        [tenantId, person.id]
      );

      return {
        pcmProfile: profRes.rows[0] || null,
        groups: groupsRes.rows,
        mentorships: pairsRes.rows.map((row) => ({
          ...row,
          my_role: row.mentor_person_id === person.id ? 'MENTOR' : 'MENTEE',
        })),
      };
    });

    if (!payload) {
      return res.status(403).json({ error: 'No linked member profile found in this organization.' });
    }

    res.json(payload);
  } catch (err) {
    console.error('[portal-service] GET /portal/me/pcm error:', err);
    res.status(500).json({ error: 'Failed to load PCM student & mentorship details' });
  }
});

// ── 7. OFFICER ENDPOINTS: Issue Claim Invites & Review Claim Requests ───────
router.post(
  '/portal/invites',
  verifySession,
  requireTenantRole('ADMIN', 'CLERK', 'PCM_LEADER', 'PASTOR'),
  requireVerifiedTenant,
  async (req, res) => {
    try {
      const { personId, expiresInDays = 14 } = req.body || {};
      if (!personId) {
        return res.status(400).json({ error: 'personId is required' });
      }

      const invite = await req.dbTx(async (client) => {
        const pRes = await client.query(
          `SELECT id, first_name, last_name, email, phone, user_id
             FROM persons
            WHERE id = $1 AND tenant_id = $2
            LIMIT 1`,
          [personId, req.tenant.id]
        );
        const person = pRes.rows[0];
        if (!person) return { status: 404, error: 'Person record not found in this organization.' };
        if (person.user_id) {
          return { status: 409, error: 'This person has already claimed and linked their portal account.' };
        }

        const code = generateInviteCode();
        const days = Math.min(Math.max(Number(expiresInDays) || 14, 1), 90);
        const { rows } = await client.query(
          `INSERT INTO profile_claim_invites
             (tenant_id, person_id, invite_code, issued_to_contact, expires_at, created_by)
           VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::interval, $6)
           RETURNING *`,
          [
            req.tenant.id,
            person.id,
            code,
            person.email || person.phone || null,
            String(days),
            req.user.id,
          ]
        );

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'PORTAL_INVITE_ISSUED', 'persons', $3, $4::jsonb)`,
          [
            req.tenant.id,
            req.user.id,
            person.id,
            JSON.stringify({ invite_code: code, person_name: `${person.first_name} ${person.last_name}` }),
          ]
        );

        return {
          status: 201,
          invite: rows[0],
          person: { id: person.id, first_name: person.first_name, last_name: person.last_name },
        };
      });

      if (invite.error) {
        return res.status(invite.status).json({ error: invite.error });
      }
      res.status(201).json(invite);
    } catch (err) {
      console.error('[portal-service] POST /portal/invites error:', err);
      res.status(500).json({ error: 'Failed to generate profile claim invite' });
    }
  }
);

router.get(
  '/portal/claims',
  verifySession,
  requireTenantRole('ADMIN', 'CLERK', 'PCM_LEADER', 'PASTOR'),
  async (req, res) => {
    try {
      const claims = await req.dbTx(async (client) => {
        const { rows } = await client.query(
          `SELECT r.*,
                  u.email AS user_email,
                  u.full_name AS user_full_name,
                  u.phone AS user_phone,
                  p.first_name AS person_first_name,
                  p.last_name AS person_last_name,
                  p.email AS person_email,
                  p.phone AS person_phone,
                  p.membership_status
             FROM profile_claim_requests r
             JOIN users u ON u.id = r.user_id
             JOIN persons p ON p.id = r.person_id
            WHERE r.tenant_id = $1
            ORDER BY CASE WHEN r.status = 'PENDING' THEN 0 ELSE 1 END, r.created_at DESC`,
          [req.tenant.id]
        );
        return rows;
      });

      res.json({ claims });
    } catch (err) {
      console.error('[portal-service] GET /portal/claims error:', err);
      res.status(500).json({ error: 'Failed to load profile claim requests' });
    }
  }
);

router.patch(
  '/portal/claims/:id',
  verifySession,
  requireTenantRole('ADMIN', 'CLERK', 'PCM_LEADER', 'PASTOR'),
  requireVerifiedTenant,
  async (req, res) => {
    try {
      const { status, reviewNotes } = req.body || {};
      if (!['VERIFIED', 'REJECTED'].includes(status)) {
        return res.status(400).json({ error: 'status must be VERIFIED or REJECTED' });
      }

      const result = await req.dbTx(async (client) => {
        const rRes = await client.query(
          `SELECT * FROM profile_claim_requests WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
          [req.params.id, req.tenant.id]
        );
        const claim = rRes.rows[0];
        if (!claim) return { status: 404, error: 'Claim request not found.' };
        if (claim.status !== 'PENDING') {
          return { status: 409, error: `Claim request is already ${claim.status}.` };
        }

        if (status === 'VERIFIED') {
          const pRes = await client.query(
            `SELECT user_id FROM persons WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
            [claim.person_id, req.tenant.id]
          );
          if (!pRes.rows[0]) return { status: 404, error: 'Directory person record no longer exists.' };
          if (pRes.rows[0].user_id && pRes.rows[0].user_id !== claim.user_id) {
            return { status: 409, error: 'Person record is already linked to another user.' };
          }

          await client.query(
            `UPDATE persons SET user_id = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
            [claim.user_id, claim.person_id, req.tenant.id]
          );
        }

        const upd = await client.query(
          `UPDATE profile_claim_requests
              SET status = $1,
                  review_notes = $2,
                  verified_by = $3,
                  verified_at = NOW()
            WHERE id = $4
            RETURNING *`,
          [status, reviewNotes || null, req.user.id, claim.id]
        );

        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, $3, 'profile_claim_requests', $4, $5::jsonb)`,
          [
            req.tenant.id,
            req.user.id,
            status === 'VERIFIED' ? 'PORTAL_CLAIM_APPROVED' : 'PORTAL_CLAIM_REJECTED',
            claim.id,
            JSON.stringify({ person_id: claim.person_id, user_id: claim.user_id }),
          ]
        );

        return { status: 200, claim: upd.rows[0] };
      });

      if (result.error) {
        return res.status(result.status).json({ error: result.error });
      }
      res.json(result);
    } catch (err) {
      console.error('[portal-service] PATCH /portal/claims/:id error:', err);
      res.status(500).json({ error: 'Failed to update claim request' });
    }
  }
);

module.exports = router;
