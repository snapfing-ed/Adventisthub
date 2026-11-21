"use client";
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

const STATUS_LABELS = {
  BAPTIZED_MEMBER: 'Baptized Member',
  PROFESSION_OF_FAITH: 'Profession of Faith',
  STUDENT_MEMBER: 'Student Member',
  VISITOR: 'Visitor / Interest',
  TRANSFERRED_OUT: 'Transferred Out',
  REMOVED: 'Removed',
  DECEASED: 'Deceased',
};

const TRANSFER_STEPS = [
  'REQUESTED',
  'FIRST_READING',
  'BOARD_RECOMMENDED',
  'BUSINESS_VOTED',
  'COMPLETED',
];

const TRANSFER_LABELS = {
  REQUESTED: 'Requested',
  FIRST_READING: '1st Reading',
  BOARD_RECOMMENDED: 'Board Voted',
  BUSINESS_VOTED: 'Church Business Voted',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const ACADEMIC_LABELS = {
  FRESHMAN_INTAKE: 'Freshman Intake',
  ACTIVE_STUDENT: 'Active Student',
  STUDENT_LEADER: 'Student Leader',
  FINAL_YEAR: 'Final Year',
  ALUMNI_TRANSITIONED: 'Alumni Transitioned',
};

export default function MemberPortalWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'overview';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [portalState, setPortalState] = useState(null);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [feedback, setFeedback] = useState('');

  // Claim onboarding state
  const [claimMode, setClaimMode] = useState('code'); // 'code' | 'lookup'
  const [claimForm, setClaimForm] = useState({
    inviteCode: '',
    tenantSlug: '',
    identifier: '',
    firstName: '',
    lastName: '',
  });
  const [claiming, setClaiming] = useState(false);

  // Contact edit state
  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    phone: '',
    email: '',
    address: '',
    hostelOrResidence: '',
    emergencyContact: '',
    spiritualGifts: '',
  });

  // Tab data
  const [membershipData, setMembershipData] = useState(null);
  const [givingData, setGivingData] = useState(null);
  const [givingYear, setGivingYear] = useState(String(new Date().getFullYear()));
  const [pcmData, setPcmData] = useState(null);

  const selectTab = (tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/member-portal?${params.toString()}`);
  };

  const loadPortalRoot = useCallback(
    async (overrideTenantId) => {
      setLoading(true);
      const tid = overrideTenantId || selectedTenantId;
      const query = tid ? `?tenantId=${encodeURIComponent(tid)}` : '';
      const res = await apiFetch(`/api/portal/me${query}`);
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        setFeedback(res.error);
        setLoading(false);
        return;
      }

      setPortalState(res.data);
      const active = res.data.activeProfile;
      if (active) {
        setSelectedTenantId(active.tenant_id);
        setContactForm({
          phone: active.phone || '',
          email: active.email || '',
          address: active.address || '',
          hostelOrResidence: active.hostel_or_residence || '',
          emergencyContact: '',
          spiritualGifts: '',
        });
      } else {
        setClaimForm((prev) => ({
          ...prev,
          identifier: prev.identifier || res.data.user?.email || '',
        }));
      }
      setLoading(false);
    },
    [router, selectedTenantId]
  );

  useEffect(() => {
    loadPortalRoot();
  }, [loadPortalRoot]);

  const loadTabDetails = useCallback(async () => {
    const active = portalState?.activeProfile;
    if (!active) return;

    const headers = { 'x-tenant-id': active.tenant_id };

    if (activeTab === 'membership' || activeTab === 'overview') {
      const mRes = await apiFetch('/api/portal/me/membership', { headers });
      if (mRes.ok) setMembershipData(mRes.data);
    }

    if (activeTab === 'giving' || activeTab === 'overview') {
      const yQuery = givingYear !== 'ALL' ? `?year=${givingYear}` : '';
      const gRes = await apiFetch(`/api/portal/me/giving${yQuery}`, { headers });
      if (gRes.ok) setGivingData(gRes.data);
    }

    if (
      activeTab === 'pcm' ||
      activeTab === 'overview' ||
      active.organization_type === 'PCM_CHAPTER'
    ) {
      const pRes = await apiFetch('/api/portal/me/pcm', { headers });
      if (pRes.ok) {
        setPcmData(pRes.data);
        if (pRes.data.pcmProfile) {
          setContactForm((prev) => ({
            ...prev,
            emergencyContact: pRes.data.pcmProfile.emergency_contact || '',
            spiritualGifts: pRes.data.pcmProfile.spiritual_gifts || '',
          }));
        }
      }
    }
  }, [portalState?.activeProfile, activeTab, givingYear]);

  useEffect(() => {
    loadTabDetails();
  }, [loadTabDetails]);

  const handleClaimSubmit = async (e) => {
    e.preventDefault();
    setClaiming(true);
    setFeedback('');
    const payload =
      claimMode === 'code'
        ? { inviteCode: claimForm.inviteCode }
        : {
            tenantSlug: claimForm.tenantSlug,
            identifier: claimForm.identifier,
            firstName: claimForm.firstName,
            lastName: claimForm.lastName,
          };

    const res = await apiFetch('/api/portal/claim', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setClaiming(false);

    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setFeedback(res.data.message);
    await loadPortalRoot();
  };

  const handleSaveContact = async (e) => {
    e.preventDefault();
    const active = portalState?.activeProfile;
    if (!active) return;
    setFeedback('');

    const res = await apiFetch('/api/portal/me/contact', {
      method: 'PATCH',
      headers: { 'x-tenant-id': active.tenant_id },
      body: JSON.stringify(contactForm),
    });

    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setEditingContact(false);
    setFeedback('Your contact details have been updated.');
    await loadPortalRoot(active.tenant_id);
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('ah_active_tenant_id');
    }
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
        Loading your AdventistHub Member &amp; Student Portal...
      </div>
    );
  }

  const activeProfile = portalState?.activeProfile;
  const isPcm = activeProfile?.organization_type === 'PCM_CHAPTER';
  const showPcmTab = isPcm || Boolean(pcmData?.pcmProfile) || (pcmData?.groups?.length > 0) || (pcmData?.mentorships?.length > 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-10">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="font-bold text-slate-900 tracking-tight text-base shrink-0">
              AdventistHub
            </Link>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              {isPcm ? 'Student Portal' : 'Member Portal'}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {portalState?.linkedProfiles?.length > 1 && (
              <select
                value={selectedTenantId}
                onChange={(e) => {
                  setSelectedTenantId(e.target.value);
                  loadPortalRoot(e.target.value);
                }}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 max-w-[170px] sm:max-w-xs"
              >
                {portalState.linkedProfiles.map((lp) => (
                  <option key={lp.tenant_id} value={lp.tenant_id}>
                    {lp.tenant_name}
                  </option>
                ))}
              </select>
            )}

            {portalState?.hasOfficerRole && (
              <Link
                href="/admin-portal"
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition shrink-0"
              >
                Officer Portal →
              </Link>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-xs font-medium text-slate-700"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {feedback && (
          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 print:hidden">
            {feedback}
          </div>
        )}

        {/* ── UNCLAIMED ACCOUNT ONBOARDING FLOW ─────────────────────────────── */}
        {!activeProfile ? (
          <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-5">
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                Link Your Church or Campus Chapter Profile
              </h1>
              <p className="text-xs text-slate-600 mt-1">
                Signed in as <strong>{portalState?.user?.full_name}</strong> ({portalState?.user?.email}). Connect your account to your existing directory record to view your membership status, giving receipts, and PCM mentorship.
              </p>
            </div>

            <div className="flex gap-2 border-b border-slate-200 pb-3">
              <button
                type="button"
                onClick={() => setClaimMode('code')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                  claimMode === 'code'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                Use Officer Invite Code
              </button>
              <button
                type="button"
                onClick={() => setClaimMode('lookup')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                  claimMode === 'lookup'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                Match by Church / Chapter Slug
              </button>
            </div>

            <form onSubmit={handleClaimSubmit} className="space-y-4">
              {claimMode === 'code' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Profile Claim Invite Code *
                  </label>
                  <input
                    required
                    placeholder="e.g., AH-4F8A91C2"
                    value={claimForm.inviteCode}
                    onChange={(e) =>
                      setClaimForm((p) => ({ ...p, inviteCode: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm uppercase tracking-wider"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Issued by your local Church Clerk, Pastor, or PCM Chapter Leader.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Church or PCM Chapter Subdomain Slug *
                    </label>
                    <input
                      required
                      placeholder="e.g., gracechurch or mupcm"
                      value={claimForm.tenantSlug}
                      onChange={(e) =>
                        setClaimForm((p) => ({ ...p, tenantSlug: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Email or Phone Number on File *
                    </label>
                    <input
                      required
                      placeholder="Email or +260..."
                      value={claimForm.identifier}
                      onChange={(e) =>
                        setClaimForm((p) => ({ ...p, identifier: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      placeholder="First Name (optional fallback)"
                      value={claimForm.firstName}
                      onChange={(e) =>
                        setClaimForm((p) => ({ ...p, firstName: e.target.value }))
                      }
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                    <input
                      placeholder="Last Name (optional fallback)"
                      value={claimForm.lastName}
                      onChange={(e) =>
                        setClaimForm((p) => ({ ...p, lastName: e.target.value }))
                      }
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={claiming}
                className="w-full py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-50"
              >
                {claiming ? 'Verifying Profile...' : 'Claim & Link My Profile'}
              </button>
            </form>

            {portalState?.pendingClaims?.length > 0 && (
              <div className="pt-4 border-t border-slate-200 space-y-2">
                <div className="text-xs font-bold text-slate-800">Your Recent Claim Requests</div>
                {portalState.pendingClaims.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold">
                        {c.first_name} {c.last_name} — {c.tenant_name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Submitted {String(c.created_at).slice(0, 10)}
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold text-[11px]">
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Organization & Member Hero Banner */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:border-none print:p-0">
              <div>
                <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                  {activeProfile.tenant_name}
                  {activeProfile.city_or_campus ? ` • ${activeProfile.city_or_campus}` : ''}
                </div>
                <h1 className="text-xl font-bold text-slate-900 mt-1">
                  {activeProfile.first_name} {activeProfile.last_name}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                    {STATUS_LABELS[activeProfile.membership_status] || activeProfile.membership_status}
                  </span>
                  {activeProfile.sabbath_school_class && (
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      Sabbath School: {activeProfile.sabbath_school_class}
                    </span>
                  )}
                  {activeProfile.student_id && (
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800">
                      Student ID: {activeProfile.student_id}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => {
                    selectTab('overview');
                    setEditingContact((v) => !v);
                  }}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-800"
                >
                  {editingContact ? 'Close Contact Editor' : 'Update Contact Details'}
                </button>
              </div>
            </section>

            {/* Desktop Navigation Tabs */}
            <nav className="hidden md:flex gap-2 bg-white border border-slate-200 rounded-xl p-2 print:hidden">
              {[
                { id: 'overview', label: 'My Profile & Contact' },
                { id: 'giving', label: 'Tithe & Offerings Statement' },
                { id: 'membership', label: 'Membership & Transfers' },
                ...(showPcmTab ? [{ id: 'pcm', label: 'Campus & Mentorship' }] : []),
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTab(t.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                    activeTab === t.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {/* ── TAB 1: PROFILE & SAFE SELF-SERVICE CONTACT UPDATES ────────── */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-900">
                      Personal &amp; Contact Information
                    </h2>
                    <button
                      type="button"
                      onClick={() => setEditingContact((v) => !v)}
                      className="text-xs font-semibold text-blue-700 hover:underline"
                    >
                      {editingContact ? 'Cancel' : 'Edit Contact'}
                    </button>
                  </div>

                  {editingContact ? (
                    <form onSubmit={handleSaveContact} className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-600 mb-1">Phone Number</label>
                          <input
                            value={contactForm.phone}
                            onChange={(e) =>
                              setContactForm((p) => ({ ...p, phone: e.target.value }))
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-600 mb-1">Email Address</label>
                          <input
                            type="email"
                            value={contactForm.email}
                            onChange={(e) =>
                              setContactForm((p) => ({ ...p, email: e.target.value }))
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] text-slate-600 mb-1">
                            Residential Address
                          </label>
                          <input
                            value={contactForm.address}
                            onChange={(e) =>
                              setContactForm((p) => ({ ...p, address: e.target.value }))
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                          />
                        </div>
                        {showPcmTab && (
                          <>
                            <div>
                              <label className="block text-[11px] text-slate-600 mb-1">
                                Hostel / Campus Residence
                              </label>
                              <input
                                value={contactForm.hostelOrResidence}
                                onChange={(e) =>
                                  setContactForm((p) => ({
                                    ...p,
                                    hostelOrResidence: e.target.value,
                                  }))
                                }
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-slate-600 mb-1">
                                Emergency / Next-of-Kin Contact
                              </label>
                              <input
                                value={contactForm.emergencyContact}
                                onChange={(e) =>
                                  setContactForm((p) => ({
                                    ...p,
                                    emergencyContact: e.target.value,
                                  }))
                                }
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                              />
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setEditingContact(false)}
                          className="px-4 py-2 rounded-lg border border-slate-300 text-xs text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold"
                        >
                          Save Changes
                        </button>
                      </div>
                    </form>
                  ) : (
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <dt className="text-slate-500">Phone</dt>
                        <dd className="font-semibold text-slate-900 mt-0.5">
                          {activeProfile.phone || 'Not recorded'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Email</dt>
                        <dd className="font-semibold text-slate-900 mt-0.5">
                          {activeProfile.email || portalState?.user?.email || 'Not recorded'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Residential Address</dt>
                        <dd className="font-semibold text-slate-900 mt-0.5">
                          {activeProfile.address || 'Not recorded'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Household / Family Unit</dt>
                        <dd className="font-semibold text-slate-900 mt-0.5">
                          {activeProfile.household_name || 'Individual / Unassigned'}
                        </dd>
                      </div>
                      {activeProfile.institution && (
                        <div>
                          <dt className="text-slate-500">Institution &amp; Program</dt>
                          <dd className="font-semibold text-slate-900 mt-0.5">
                            {activeProfile.institution}
                            {activeProfile.program_of_study
                              ? ` — ${activeProfile.program_of_study}`
                              : ''}
                          </dd>
                        </div>
                      )}
                      {activeProfile.hostel_or_residence && (
                        <div>
                          <dt className="text-slate-500">Hostel / Campus Residence</dt>
                          <dd className="font-semibold text-slate-900 mt-0.5">
                            {activeProfile.hostel_or_residence}
                          </dd>
                        </div>
                      )}
                    </dl>
                  )}
                </section>

                {/* Clerk-Controlled Ecclesiastical Record Card (Read-Only) */}
                <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-900">Ecclesiastical Record</h2>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      Clerk Verified
                    </span>
                  </div>
                  <dl className="space-y-2.5 text-xs">
                    <div>
                      <dt className="text-slate-500">Standing</dt>
                      <dd className="font-semibold text-slate-900">
                        {STATUS_LABELS[activeProfile.membership_status]}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Baptism Date</dt>
                      <dd className="font-semibold text-slate-900">
                        {activeProfile.baptism_date
                          ? String(activeProfile.baptism_date).slice(0, 10)
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Officiating Minister</dt>
                      <dd className="font-semibold text-slate-900">
                        {activeProfile.baptizing_minister || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Previous Congregation</dt>
                      <dd className="font-semibold text-slate-900">
                        {activeProfile.previous_church || activeProfile.home_church || '—'}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                    To request a Letter of Transfer or update baptismal records, contact your Church Clerk.
                  </p>
                </section>
              </div>
            )}

            {/* ── TAB 2: PERSONAL STEWARDSHIP RECEIPTS & PRINTABLE STATEMENT ── */}
            {activeTab === 'giving' && (
              <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Personal Tithe &amp; Offerings Statement
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Official posted stewardship receipts issued by {activeProfile.tenant_name}.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 print:hidden">
                    <select
                      value={givingYear}
                      onChange={(e) => setGivingYear(e.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium"
                    >
                      <option value={String(new Date().getFullYear())}>
                        {new Date().getFullYear()} Statement
                      </option>
                      <option value={String(new Date().getFullYear() - 1)}>
                        {new Date().getFullYear() - 1} Statement
                      </option>
                      <option value="ALL">All Years</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                    >
                      Print / Save PDF
                    </button>
                  </div>
                </div>

                {/* Fund Breakdown Summary */}
                {givingData?.fundSummary?.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {givingData.fundSummary.map((fs, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-slate-50 border border-slate-200"
                      >
                        <div className="text-[11px] font-semibold text-slate-500">
                          {fs.fund_name} ({fs.fund_code})
                        </div>
                        <div className="text-lg font-bold text-slate-900 mt-0.5">
                          {fs.currency} {Number(fs.total_amount).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!givingData || givingData.contributions.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">
                    No posted stewardship receipts found for the selected period.
                  </p>
                ) : (
                  <>
                    {/* Mobile Cards (< md) */}
                    <div className="space-y-3 md:hidden">
                      {givingData.contributions.map((c) => (
                        <div
                          key={c.id}
                          className="border border-slate-200 rounded-xl p-4 space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{c.receipt_number}</span>
                            <span className="text-slate-500">
                              {String(c.contribution_date).slice(0, 10)}
                            </span>
                          </div>
                          <div className="text-base font-bold text-emerald-800">
                            {c.currency} {Number(c.total_amount).toLocaleString()}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {(c.line_items || [])
                              .map((li) => `${li.fund_name}: ${c.currency} ${li.amount}`)
                              .join(' • ')}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table (>= md) */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 text-slate-500">
                          <tr>
                            <th className="py-2.5 pr-4">Receipt #</th>
                            <th className="py-2.5 pr-4">Date</th>
                            <th className="py-2.5 pr-4">Method</th>
                            <th className="py-2.5 pr-4">Fund Breakdown</th>
                            <th className="py-2.5 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {givingData.contributions.map((c) => (
                            <tr key={c.id}>
                              <td className="py-3 pr-4 font-semibold text-slate-900">
                                {c.receipt_number}
                              </td>
                              <td className="py-3 pr-4 text-slate-600">
                                {String(c.contribution_date).slice(0, 10)}
                              </td>
                              <td className="py-3 pr-4 text-slate-600">{c.payment_method}</td>
                              <td className="py-3 pr-4 text-slate-600">
                                {(c.line_items || [])
                                  .map((li) => `${li.fund_name} (${c.currency} ${li.amount})`)
                                  .join(', ')}
                              </td>
                              <td className="py-3 text-right font-bold text-slate-900">
                                {c.currency} {Number(c.total_amount).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            )}

            {/* ── TAB 3: MEMBERSHIP AUDIT TRAIL, TRANSFERS & OFFICER ROLES ──── */}
            {activeTab === 'membership' && (
              <div className="space-y-6">
                {/* Church / Chapter Officer Appointments */}
                <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
                  <h2 className="text-sm font-bold text-slate-900">
                    My Officer &amp; Ministry Appointments
                  </h2>
                  {!membershipData?.officers?.length ? (
                    <p className="text-xs text-slate-500">
                      No elected church or chapter office appointments currently on record.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {membershipData.officers.map((o) => (
                        <div
                          key={o.id}
                          className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1"
                        >
                          <div className="font-bold text-slate-900">{o.role_title}</div>
                          {o.department && (
                            <div className="text-slate-600">{o.department}</div>
                          )}
                          <div className="text-[11px] text-slate-500">
                            {o.service_year_label || 'Active Term'} • Status: {o.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Membership Transactions & Letter of Transfer Stepper */}
                <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
                  <h2 className="text-sm font-bold text-slate-900">
                    Membership History &amp; Letter of Transfer Progress
                  </h2>
                  {!membershipData?.transactions?.length ? (
                    <p className="text-xs text-slate-500">
                      No membership transactions or transfer letters recorded yet.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {membershipData.transactions.map((tx) => {
                        const stepIdx = tx.transfer_status
                          ? TRANSFER_STEPS.indexOf(tx.transfer_status)
                          : -1;
                        return (
                          <div
                            key={tx.id}
                            className="border border-slate-200 rounded-xl p-4 space-y-3 text-xs"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <span className="font-bold text-slate-900">
                                  {tx.transaction_type.replace(/_/g, ' ')}
                                </span>
                                {tx.other_church_or_chapter && (
                                  <span className="text-slate-600">
                                    {' '}
                                    • {tx.other_church_or_chapter}
                                  </span>
                                )}
                              </div>
                              <span className="text-slate-500">
                                Effective: {String(tx.effective_date).slice(0, 10)}
                              </span>
                            </div>

                            {tx.transfer_status && tx.transfer_status !== 'CANCELLED' && (
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1">
                                {TRANSFER_STEPS.map((st, idx) => (
                                  <div
                                    key={st}
                                    className={`px-2 py-1.5 rounded text-center text-[11px] font-medium border ${
                                      idx <= stepIdx
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                        : 'bg-slate-50 text-slate-400 border-slate-200'
                                    }`}
                                  >
                                    {TRANSFER_LABELS[st]}
                                  </div>
                                ))}
                              </div>
                            )}

                            {tx.minute_reference && (
                              <div className="text-[11px] text-slate-500">
                                Board/Business Minute Ref: {tx.minute_reference}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ── TAB 4: PCM FELLOWSHIP BANDS & MENTORSHIP ──────────────────── */}
            {activeTab === 'pcm' && (
              <div className="space-y-6">
                {pcmData?.pcmProfile && (
                  <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
                    <h2 className="text-sm font-bold text-slate-900 mb-3">
                      Campus Spiritual &amp; Academic Standing
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-slate-500 block">Academic Stage</span>
                        <span className="font-bold text-indigo-900">
                          {ACADEMIC_LABELS[pcmData.pcmProfile.academic_status] ||
                            pcmData.pcmProfile.academic_status}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Faculty / School</span>
                        <span className="font-semibold text-slate-900">
                          {pcmData.pcmProfile.campus_faculty || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Expected Graduation</span>
                        <span className="font-semibold text-slate-900">
                          {pcmData.pcmProfile.expected_graduation_date
                            ? String(pcmData.pcmProfile.expected_graduation_date).slice(0, 10)
                            : pcmData.pcmProfile.graduation_year || '—'}
                        </span>
                      </div>
                    </div>
                  </section>
                )}

                <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
                  <h2 className="text-sm font-bold text-slate-900">
                    My Fellowship &amp; Prayer Bands
                  </h2>
                  {!pcmData?.groups?.length ? (
                    <p className="text-xs text-slate-500">
                      You are not currently assigned to a campus fellowship or prayer band.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pcmData.groups.map((g) => (
                        <div
                          key={g.id}
                          className="border border-slate-200 rounded-xl p-4 space-y-1.5 text-xs"
                        >
                          <div className="font-bold text-sm text-slate-900">{g.name}</div>
                          <div className="text-slate-600">
                            Role: <strong>{g.role_in_group}</strong>
                          </div>
                          {g.leader_first_name && (
                            <div className="text-slate-600">
                              Band Leader: {g.leader_first_name} {g.leader_last_name}
                              {g.leader_phone ? ` (${g.leader_phone})` : ''}
                            </div>
                          )}
                          {(g.meeting_schedule || g.location) && (
                            <div className="text-slate-500">
                              {[g.meeting_schedule, g.location].filter(Boolean).join(' • ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
                  <h2 className="text-sm font-bold text-slate-900">
                    My Discipleship &amp; Mentorship Assignments
                  </h2>
                  {!pcmData?.mentorships?.length ? (
                    <p className="text-xs text-slate-500">
                      No active or past mentorship pairings on record.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pcmData.mentorships.map((mp) => {
                        const partnerName =
                          mp.my_role === 'MENTOR'
                            ? `${mp.mentee_first_name} ${mp.mentee_last_name}`
                            : `${mp.mentor_first_name} ${mp.mentor_last_name}`;
                        const partnerContact =
                          mp.my_role === 'MENTOR'
                            ? mp.mentee_phone || mp.mentee_email
                            : mp.mentor_phone || mp.mentor_email;

                        return (
                          <div
                            key={mp.id}
                            className="border border-slate-200 rounded-xl p-4 space-y-1.5 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 font-semibold text-[11px]">
                                My Role: {mp.my_role}
                              </span>
                              <span className="text-slate-500">{mp.status}</span>
                            </div>
                            <div className="font-bold text-sm text-slate-900 pt-1">
                              {mp.my_role === 'MENTOR' ? 'Mentee' : 'Mentor'}: {partnerName}
                            </div>
                            {partnerContact && (
                              <div className="text-slate-600">Contact: {partnerContact}</div>
                            )}
                            {mp.focus_area && (
                              <div className="text-slate-600">Focus: {mp.focus_area}</div>
                            )}
                            <div className="text-[11px] text-slate-500 pt-1">
                              {mp.checkins_count} check-in(s) logged
                              {mp.last_checkin_date
                                ? ` • Last: ${String(mp.last_checkin_date).slice(0, 10)}`
                                : ''}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (< md) */}
      {activeProfile && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-30 flex print:hidden">
          {[
            { id: 'overview', label: 'Profile' },
            { id: 'giving', label: 'Giving' },
            { id: 'membership', label: 'Status' },
            ...(showPcmTab ? [{ id: 'pcm', label: 'PCM' }] : []),
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectTab(item.id)}
              className={`flex-1 py-2.5 text-center text-[11px] font-semibold ${
                activeTab === item.id ? 'text-blue-700 bg-blue-50/60' : 'text-slate-600'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
