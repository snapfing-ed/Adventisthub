"use client";
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

const ACADEMIC_STATUS_LABELS = {
  FRESHMAN_INTAKE: 'Freshman Intake',
  ACTIVE_STUDENT: 'Active Student',
  STUDENT_LEADER: 'Student Leader',
  FINAL_YEAR: 'Final Year',
  ALUMNI_TRANSITIONED: 'Alumni Transitioned',
};

const GROUP_TYPE_LABELS = {
  BIBLE_STUDY_BAND: 'Bible Study Band',
  PRAYER_CELL: 'Prayer Cell',
  FRESHMAN_ORIENTATION: 'Freshman Orientation',
  OUTREACH_TEAM: 'Campus Outreach Team',
  ALUMNI_NETWORK: 'Alumni Support Network',
};

const PAIR_STATUS_BADGE = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PAUSED: 'bg-amber-50 text-amber-800 border-amber-200',
  COMPLETED: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function PcmMentorshipSection({ activeTenant, onNavigateTab }) {
  const isPcm = activeTenant?.organization_type === 'PCM_CHAPTER';
  const isVerified = activeTenant?.verification_status === 'VERIFIED';

  const [subView, setSubView] = useState('groups'); // 'groups' | 'mentorships'
  const [stats, setStats] = useState(null);
  const [chapterLeaders, setChapterLeaders] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [groups, setGroups] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [serviceYears, setServiceYears] = useState([]);
  const [feedback, setFeedback] = useState('');

  // Fellowship Group creation & member assignment
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupForm, setGroupForm] = useState({
    name: '',
    groupType: 'BIBLE_STUDY_BAND',
    leaderPersonId: '',
    serviceYearId: '',
    meetingSchedule: '',
    location: '',
    description: '',
  });
  const [addMemberState, setAddMemberState] = useState({}); // groupId -> { personId, roleInGroup }

  // Mentorship pairing & check-in logs
  const [pairStatusFilter, setPairStatusFilter] = useState('');
  const [showPairForm, setShowPairForm] = useState(false);
  const [pairForm, setPairForm] = useState({
    mentorPersonId: '',
    menteePersonId: '',
    serviceYearId: '',
    focusArea: '',
    startedAt: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [activeCheckinPairId, setActiveCheckinPairId] = useState('');
  const [checkins, setCheckins] = useState([]);
  const [checkinForm, setCheckinForm] = useState({
    checkinDate: new Date().toISOString().slice(0, 10),
    meetingMode: 'IN_PERSON',
    summary: '',
    prayerRequests: '',
    followUpNeeded: false,
  });

  const loadAll = useCallback(async () => {
    const mParams = new URLSearchParams();
    if (pairStatusFilter) mParams.set('status', pairStatusFilter);

    const [ovRes, profRes, grpRes, pairRes, syRes] = await Promise.all([
      apiFetch('/api/pcm/overview'),
      apiFetch('/api/pcm/profiles'),
      apiFetch('/api/pcm/groups'),
      apiFetch(`/api/pcm/mentorships?${mParams.toString()}`),
      apiFetch('/api/service-years'),
    ]);

    if (ovRes.ok) {
      setStats(ovRes.data.stats || null);
      setChapterLeaders(ovRes.data.chapterLeaders || []);
    }
    if (profRes.ok) setProfiles(profRes.data.profiles || []);
    if (grpRes.ok) setGroups(grpRes.data.groups || []);
    if (pairRes.ok) setPairs(pairRes.data.pairs || []);
    if (syRes.ok) {
      const years = syRes.data.serviceYears || [];
      setServiceYears(years);
      const curr = years.find((y) => y.is_current);
      if (curr) {
        setGroupForm((prev) => ({ ...prev, serviceYearId: prev.serviceYearId || curr.id }));
        setPairForm((prev) => ({ ...prev, serviceYearId: prev.serviceYearId || curr.id }));
      }
    }
  }, [pairStatusFilter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setFeedback('');
    const res = await apiFetch('/api/pcm/groups', {
      method: 'POST',
      body: JSON.stringify(groupForm),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setShowGroupForm(false);
    setGroupForm((prev) => ({
      ...prev,
      name: '',
      leaderPersonId: '',
      meetingSchedule: '',
      location: '',
      description: '',
    }));
    setFeedback('Campus fellowship group created.');
    await loadAll();
  };

  const handleAddGroupMember = async (groupId) => {
    const entry = addMemberState[groupId];
    if (!entry?.personId) return;
    const res = await apiFetch(`/api/pcm/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({
        personId: entry.personId,
        roleInGroup: entry.roleInGroup || 'MEMBER',
      }),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setAddMemberState((prev) => ({ ...prev, [groupId]: { personId: '', roleInGroup: 'MEMBER' } }));
    await loadAll();
  };

  const handleRemoveGroupMember = async (groupId, personId) => {
    const res = await apiFetch(`/api/pcm/groups/${groupId}/members/${personId}`, {
      method: 'DELETE',
    });
    if (res.ok) await loadAll();
  };

  const handleCreatePair = async (e) => {
    e.preventDefault();
    setFeedback('');
    const res = await apiFetch('/api/pcm/mentorships', {
      method: 'POST',
      body: JSON.stringify(pairForm),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setShowPairForm(false);
    setPairForm((prev) => ({
      ...prev,
      mentorPersonId: '',
      menteePersonId: '',
      focusArea: '',
      notes: '',
    }));
    setFeedback('Mentor–mentee pairing established.');
    await loadAll();
  };

  const handleUpdatePairStatus = async (pairId, status) => {
    const res = await apiFetch(`/api/pcm/mentorships/${pairId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setFeedback(`Mentorship status updated to ${status}.`);
      await loadAll();
    }
  };

  const loadCheckins = async (pairId) => {
    setActiveCheckinPairId(pairId);
    const res = await apiFetch(`/api/pcm/mentorships/${pairId}/checkins`);
    if (res.ok) setCheckins(res.data.checkins || []);
  };

  const handleCreateCheckin = async (e) => {
    e.preventDefault();
    if (!activeCheckinPairId) return;
    const res = await apiFetch(`/api/pcm/mentorships/${activeCheckinPairId}/checkins`, {
      method: 'POST',
      body: JSON.stringify(checkinForm),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setCheckinForm({
      checkinDate: new Date().toISOString().slice(0, 10),
      meetingMode: 'IN_PERSON',
      summary: '',
      prayerRequests: '',
      followUpNeeded: false,
    });
    setFeedback('Mentorship discipleship check-in logged.');
    await loadCheckins(activeCheckinPairId);
    await loadAll();
  };

  const mentorCandidates = profiles.filter(
    (p) =>
      p.mentor_eligible ||
      ['STUDENT_LEADER', 'FINAL_YEAR', 'ALUMNI_TRANSITIONED'].includes(p.academic_status)
  );

  return (
    <div className="space-y-6">
      {/* Polymorphic Header Banner for Local Churches near Campuses */}
      {!isPcm && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold text-indigo-950">
              Local Church Campus Ministry &amp; Student Care Mode
            </div>
            <p className="text-xs text-indigo-800 mt-0.5">
              Track university/college students attending your congregation, assign campus mentors, and coordinate freshman care.
            </p>
          </div>
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('governance')}
              className="text-xs font-semibold text-indigo-900 underline shrink-0"
            >
              Manage PCM Committee Officers →
            </button>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Enriched Student Profiles</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {stats?.enriched_profiles ?? 0}{' '}
            <span className="text-xs font-normal text-slate-400">
              / {stats?.total_persons ?? 0}
            </span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Freshman Intake</div>
          <div className="text-2xl font-bold text-sky-700 mt-1">{stats?.freshman_count ?? 0}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Baptismal Interests</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {stats?.baptismal_interests ?? 0}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Fellowship Groups</div>
          <div className="text-2xl font-bold text-indigo-700 mt-1">{stats?.active_groups ?? 0}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 col-span-2 lg:col-span-1">
          <div className="text-xs text-slate-500">Active Mentorships</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">
            {stats?.active_pairs ?? 0}
            {(stats?.open_followups ?? 0) > 0 && (
              <span className="ml-2 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                {stats.open_followups} follow-up
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chapter Leadership Strip (Integrated with Module 4 Governance Officers) */}
      {chapterLeaders.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-xs font-bold text-slate-800">
              {isPcm ? 'Elected PCM Chapter Executive' : 'Elected Campus Ministry Leaders'}
            </span>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('governance')}
                className="text-[11px] font-medium text-blue-700 hover:underline"
              >
                Edit in Governance →
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {chapterLeaders.map((l) => (
              <div
                key={l.id}
                className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
              >
                <span className="font-semibold text-slate-900">{l.office_title}:</span>{' '}
                <span className="text-slate-700">
                  {l.first_name} {l.last_name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSubView('groups')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              subView === 'groups'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Fellowship &amp; Prayer Bands ({groups.length})
          </button>
          <button
            type="button"
            onClick={() => setSubView('mentorships')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              subView === 'mentorships'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Mentor–Mentee Pairings ({pairs.length})
          </button>
        </div>

        {onNavigateTab && (
          <button
            type="button"
            onClick={() => onNavigateTab('directory')}
            className="text-xs font-semibold text-blue-700 hover:underline px-2 py-1"
          >
            Enrich Student Profiles in Directory →
          </button>
        )}
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
          {feedback}
        </div>
      )}

      {/* ── VIEW 1: FELLOWSHIP GROUPS & PRAYER BANDS ──────────────────────── */}
      {subView === 'groups' && (
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Campus Fellowships, Prayer Cells &amp; Bible Study Bands
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Organize campus small groups aligned with the SDA PCM Manual for freshman welcome, prayer, and outreach.
              </p>
            </div>
            {isVerified && (
              <button
                type="button"
                onClick={() => setShowGroupForm((v) => !v)}
                className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium"
              >
                {showGroupForm ? 'Close Form' : '+ New Fellowship Group'}
              </button>
            )}
          </div>

          {showGroupForm && (
            <form
              onSubmit={handleCreateGroup}
              className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <input
                  required
                  placeholder="Group Name (e.g., Freshman Welcome Band A)"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
                <select
                  value={groupForm.groupType}
                  onChange={(e) => setGroupForm((p) => ({ ...p, groupType: e.target.value }))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                >
                  {Object.entries(GROUP_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <select
                  value={groupForm.leaderPersonId}
                  onChange={(e) =>
                    setGroupForm((p) => ({ ...p, leaderPersonId: e.target.value }))
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                >
                  <option value="">-- Select Group Leader --</option>
                  {profiles.map((p) => (
                    <option key={p.person_id} value={p.person_id}>
                      {p.first_name} {p.last_name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Schedule (e.g., Wednesdays 18:00)"
                  value={groupForm.meetingSchedule}
                  onChange={(e) =>
                    setGroupForm((p) => ({ ...p, meetingSchedule: e.target.value }))
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
                <input
                  placeholder="Venue / Hostel / Online Link"
                  value={groupForm.location}
                  onChange={(e) => setGroupForm((p) => ({ ...p, location: e.target.value }))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
                <select
                  value={groupForm.serviceYearId}
                  onChange={(e) =>
                    setGroupForm((p) => ({ ...p, serviceYearId: e.target.value }))
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                >
                  <option value="">-- Academic / Service Term --</option>
                  {serviceYears.map((sy) => (
                    <option key={sy.id} value={sy.id}>
                      {sy.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowGroupForm(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-700 text-white text-xs font-medium"
                >
                  Create Group
                </button>
              </div>
            </form>
          )}

          {groups.length === 0 ? (
            <p className="text-xs text-slate-500 py-10 text-center">
              No fellowship groups or prayer bands created yet.
            </p>
          ) : (
            <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {groups.map((g) => {
                const draft = addMemberState[g.id] || { personId: '', roleInGroup: 'MEMBER' };
                return (
                  <div
                    key={g.id}
                    className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-semibold text-indigo-700">
                          {GROUP_TYPE_LABELS[g.group_type]}
                        </span>
                        <h3 className="font-bold text-sm text-slate-900">{g.name}</h3>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Leader:{' '}
                          {g.leader_first_name
                            ? `${g.leader_first_name} ${g.leader_last_name}`
                            : 'Unassigned'}
                          {g.meeting_schedule ? ` • ${g.meeting_schedule}` : ''}
                          {g.location ? ` • ${g.location}` : ''}
                        </p>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700">
                        {g.members.length} member(s)
                      </span>
                    </div>

                    {/* Member Chips */}
                    <div className="flex flex-wrap gap-1.5">
                      {g.members.map((m) => (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-800"
                        >
                          <span>
                            {m.first_name} {m.last_name}
                            {m.role_in_group !== 'MEMBER' ? ` (${m.role_in_group})` : ''}
                          </span>
                          {isVerified && (
                            <button
                              type="button"
                              onClick={() => handleRemoveGroupMember(g.id, m.person_id)}
                              className="text-slate-400 hover:text-red-600 font-bold"
                              title="Remove from group"
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </div>

                    {isVerified && (
                      <div className="pt-1 flex flex-col sm:flex-row gap-2">
                        <select
                          value={draft.personId}
                          onChange={(e) =>
                            setAddMemberState((prev) => ({
                              ...prev,
                              [g.id]: { ...draft, personId: e.target.value },
                            }))
                          }
                          className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                        >
                          <option value="">+ Add student/member to group...</option>
                          {profiles.map((p) => (
                            <option key={p.person_id} value={p.person_id}>
                              {p.first_name} {p.last_name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleAddGroupMember(g.id)}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
                        >
                          Add
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── VIEW 2: MENTOR–MENTEE PAIRINGS & DISCIPLESHIP CHECK-INS ───────── */}
      {subView === 'mentorships' && (
        <div className="space-y-6">
          <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Faculty, Alumni &amp; Peer Mentor–Mentee Pairings
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pair incoming freshmen and students with mature mentors for spiritual, academic, and campus transition support.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={pairStatusFilter}
                  onChange={(e) => setPairStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                >
                  <option value="">All Pairings</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PAUSED">Paused</option>
                  <option value="COMPLETED">Completed</option>
                </select>
                {isVerified && (
                  <button
                    type="button"
                    onClick={() => setShowPairForm((v) => !v)}
                    className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium"
                  >
                    {showPairForm ? 'Close Form' : '+ Pair Mentor & Mentee'}
                  </button>
                )}
              </div>
            </div>

            {showPairForm && (
              <form
                onSubmit={handleCreatePair}
                className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Mentor (Faculty / Alumni / Senior Student) *
                    </label>
                    <select
                      required
                      value={pairForm.mentorPersonId}
                      onChange={(e) =>
                        setPairForm((p) => ({ ...p, mentorPersonId: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    >
                      <option value="">-- Select Mentor --</option>
                      {(mentorCandidates.length > 0 ? mentorCandidates : profiles).map((p) => (
                        <option key={p.person_id} value={p.person_id}>
                          {p.first_name} {p.last_name} ({ACADEMIC_STATUS_LABELS[p.academic_status]})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Mentee (Freshman / Student) *
                    </label>
                    <select
                      required
                      value={pairForm.menteePersonId}
                      onChange={(e) =>
                        setPairForm((p) => ({ ...p, menteePersonId: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    >
                      <option value="">-- Select Mentee --</option>
                      {profiles.map((p) => (
                        <option key={p.person_id} value={p.person_id}>
                          {p.first_name} {p.last_name} ({ACADEMIC_STATUS_LABELS[p.academic_status]})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Focus Area</label>
                    <input
                      placeholder="e.g., Freshman Orientation & Sabbath Devotion"
                      value={pairForm.focusArea}
                      onChange={(e) => setPairForm((p) => ({ ...p, focusArea: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPairForm(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-xs text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-blue-700 text-white text-xs font-medium"
                  >
                    Create Pairing
                  </button>
                </div>
              </form>
            )}

            {pairs.length === 0 ? (
              <p className="text-xs text-slate-500 py-10 text-center">
                No mentor–mentee pairings recorded yet.
              </p>
            ) : (
              <>
                {/* Mobile Cards (< md) */}
                <div className="mt-5 space-y-3 md:hidden">
                  {pairs.map((mp) => (
                    <div key={mp.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs text-slate-500">
                            Mentor:{' '}
                            <strong className="text-slate-900">
                              {mp.mentor_first_name} {mp.mentor_last_name}
                            </strong>
                          </div>
                          <div className="text-xs text-slate-500">
                            Mentee:{' '}
                            <strong className="text-slate-900">
                              {mp.mentee_first_name} {mp.mentee_last_name}
                            </strong>
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                            PAIR_STATUS_BADGE[mp.status]
                          }`}
                        >
                          {mp.status}
                        </span>
                      </div>
                      {mp.focus_area && (
                        <div className="text-xs text-slate-600">Focus: {mp.focus_area}</div>
                      )}
                      <div className="text-[11px] text-slate-500">
                        {mp.checkin_count} check-in(s)
                        {mp.last_checkin_date
                          ? ` • Last: ${String(mp.last_checkin_date).slice(0, 10)}`
                          : ''}
                      </div>
                      <div className="pt-1 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => loadCheckins(mp.id)}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium"
                        >
                          Check-In Log ({mp.checkin_count})
                        </button>
                        {isVerified && mp.status === 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => handleUpdatePairStatus(mp.id, 'COMPLETED')}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700"
                          >
                            Complete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table (>= md) */}
                <div className="mt-5 hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="py-2.5 pr-4">Mentor</th>
                        <th className="py-2.5 pr-4">Mentee</th>
                        <th className="py-2.5 pr-4">Focus Area</th>
                        <th className="py-2.5 pr-4">Check-Ins</th>
                        <th className="py-2.5 pr-4">Status</th>
                        <th className="py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pairs.map((mp) => (
                        <tr
                          key={mp.id}
                          className={
                            activeCheckinPairId === mp.id
                              ? 'bg-blue-50/40'
                              : 'hover:bg-slate-50/70'
                          }
                        >
                          <td className="py-3 pr-4">
                            <div className="font-semibold text-slate-900">
                              {mp.mentor_first_name} {mp.mentor_last_name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {mp.mentor_phone || 'Mentor'}
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <div className="font-semibold text-slate-900">
                              {mp.mentee_first_name} {mp.mentee_last_name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {mp.mentee_program || 'Student'}
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-slate-700">{mp.focus_area || '—'}</td>
                          <td className="py-3 pr-4 text-slate-600">
                            <span className="font-semibold text-slate-900">{mp.checkin_count}</span>
                            {mp.last_checkin_date && (
                              <span className="block text-[11px] text-slate-400">
                                Last: {String(mp.last_checkin_date).slice(0, 10)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`inline-block font-medium px-2.5 py-0.5 rounded-full border ${
                                PAIR_STATUS_BADGE[mp.status]
                              }`}
                            >
                              {mp.status}
                            </span>
                          </td>
                          <td className="py-3 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() => loadCheckins(mp.id)}
                              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium"
                            >
                              Check-Ins
                            </button>
                            {isVerified && mp.status === 'ACTIVE' && (
                              <button
                                type="button"
                                onClick={() => handleUpdatePairStatus(mp.id, 'COMPLETED')}
                                className="text-slate-600 hover:underline"
                              >
                                Complete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* Discipleship Check-In Log Panel */}
          {activeCheckinPairId && (
            <section className="bg-white border border-blue-200 rounded-xl p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Discipleship &amp; Pastoral Care Check-In Log
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveCheckinPairId('')}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Close Log
                </button>
              </div>

              {isVerified && (
                <form
                  onSubmit={handleCreateCheckin}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="date"
                      required
                      value={checkinForm.checkinDate}
                      onChange={(e) =>
                        setCheckinForm((p) => ({ ...p, checkinDate: e.target.value }))
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                    <select
                      value={checkinForm.meetingMode}
                      onChange={(e) =>
                        setCheckinForm((p) => ({ ...p, meetingMode: e.target.value }))
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    >
                      <option value="IN_PERSON">In-Person Campus Meetup</option>
                      <option value="CAMPUS_DEVOTION">Sabbath / Vespers Devotion</option>
                      <option value="PHONE_CALL">Phone Check-In</option>
                      <option value="VIDEO">Video Call</option>
                    </select>
                    <label className="inline-flex items-center gap-2 text-xs text-slate-800 px-2">
                      <input
                        type="checkbox"
                        checked={checkinForm.followUpNeeded}
                        onChange={(e) =>
                          setCheckinForm((p) => ({ ...p, followUpNeeded: e.target.checked }))
                        }
                      />
                      Flag for Chaplain / Elder Follow-Up
                    </label>
                    <textarea
                      required
                      rows={2}
                      placeholder="Summary of conversation, spiritual progress, or academic adjustment..."
                      value={checkinForm.summary}
                      onChange={(e) =>
                        setCheckinForm((p) => ({ ...p, summary: e.target.value }))
                      }
                      className="sm:col-span-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                    <textarea
                      rows={2}
                      placeholder="Prayer requests (optional)..."
                      value={checkinForm.prayerRequests}
                      onChange={(e) =>
                        setCheckinForm((p) => ({ ...p, prayerRequests: e.target.value }))
                      }
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-medium hover:bg-blue-800"
                    >
                      Log Check-In
                    </button>
                  </div>
                </form>
              )}

              {checkins.length === 0 ? (
                <p className="text-xs text-slate-500">No check-ins logged for this pairing yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {checkins.map((c) => (
                    <div
                      key={c.id}
                      className="border border-slate-200 rounded-lg p-3 text-xs space-y-1"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          {String(c.checkin_date).slice(0, 10)} • {c.meeting_mode.replace('_', ' ')}
                        </span>
                        {c.follow_up_needed && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                            Follow-Up Requested
                          </span>
                        )}
                      </div>
                      <p className="text-slate-700">{c.summary}</p>
                      {c.prayer_requests && (
                        <p className="text-slate-500 italic">Prayer: {c.prayer_requests}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
