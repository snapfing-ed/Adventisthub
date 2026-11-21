"use client";
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

const OFFICER_STATUS_LABELS = {
  NOMINATED: 'Nominated (1st Reading)',
  ELECTED: 'Elected & Serving',
  DECLINED: 'Declined',
  COMPLETED: 'Term Completed',
};

const OFFICER_STATUS_BADGE = {
  NOMINATED: 'bg-amber-50 text-amber-800 border-amber-200',
  ELECTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DECLINED: 'bg-red-50 text-red-700 border-red-200',
  COMPLETED: 'bg-slate-100 text-slate-600 border-slate-200',
};

const MEETING_TYPE_LABELS = {
  CHURCH_BOARD: 'Church Board Meeting',
  BUSINESS_MEETING: 'Church Business Meeting',
  NOMINATING_COMMITTEE: 'Nominating Committee',
  PCM_EXECUTIVE: 'PCM Executive Committee',
  PCM_CHAPTER_MEETING: 'PCM Chapter Business Meeting',
};

const ACTION_STATUS_BADGE = {
  PROPOSED: 'bg-slate-100 text-slate-700 border-slate-200',
  VOTED: 'bg-blue-50 text-blue-800 border-blue-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-800 border-amber-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  TABLED: 'bg-purple-50 text-purple-800 border-purple-200',
};

export default function GovernanceSection({ activeTenant }) {
  const isPcm = activeTenant?.organization_type === 'PCM_CHAPTER';
  const isVerified = activeTenant?.verification_status === 'VERIFIED';

  const [subView, setSubView] = useState('officers'); // 'officers' | 'minutes'
  const [serviceYears, setServiceYears] = useState([]);
  const [selectedYearId, setSelectedYearId] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [persons, setPersons] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [actions, setActions] = useState([]);
  const [clerkTransactions, setClerkTransactions] = useState([]);

  const [officerStatusFilter, setOfficerStatusFilter] = useState('');
  const [officerSearch, setOfficerSearch] = useState('');
  const [selectedMeetingId, setSelectedMeetingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  // Forms visibility
  const [showYearForm, setShowYearForm] = useState(false);
  const [showOfficerForm, setShowOfficerForm] = useState(false);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [showActionForm, setShowActionForm] = useState(false);

  const [yearForm, setYearForm] = useState({
    label: isPcm ? '2026/2027 Academic Year' : '2026–2027 Church Year',
    startDate: '2026-10-01',
    endDate: '2027-09-30',
    isCurrent: true,
    notes: '',
  });

  const [officerForm, setOfficerForm] = useState({
    personId: '',
    officeTitle: '',
    department: '',
    status: 'NOMINATED',
    firstReadingDate: new Date().toISOString().slice(0, 10),
    electedDate: '',
    remarks: '',
  });

  const [meetingForm, setMeetingForm] = useState({
    meetingType: isPcm ? 'PCM_EXECUTIVE' : 'CHURCH_BOARD',
    title: '',
    meetingDate: new Date().toISOString().slice(0, 10),
    location: '',
    chairperson: '',
    secretaryName: '',
    attendeesSummary: '',
    openingPrayerBy: '',
    closingPrayerBy: '',
    minutesBody: '',
    isApproved: false,
  });

  const [actionForm, setActionForm] = useState({
    meetingId: '',
    actionNumber: `ACT-${new Date().getFullYear()}-001`,
    category: 'GENERAL',
    title: '',
    motionText: '',
    movedBy: '',
    secondedBy: '',
    status: 'VOTED',
    assignedTo: '',
    dueDate: '',
    linkedMembershipTransactionId: '',
  });

  const loadCoreData = useCallback(async () => {
    setLoading(true);
    const [syRes, catRes, pRes, mRes, txRes] = await Promise.all([
      apiFetch('/api/service-years'),
      apiFetch('/api/governance/position-catalog'),
      apiFetch('/api/persons'),
      apiFetch('/api/board-meetings'),
      apiFetch('/api/membership-transactions'),
    ]);

    let activeYear = selectedYearId;
    if (syRes.ok) {
      const years = syRes.data.serviceYears || [];
      setServiceYears(years);
      if (!activeYear && years.length > 0) {
        const current = years.find((y) => y.is_current) || years[0];
        activeYear = current.id;
        setSelectedYearId(current.id);
      }
    }
    if (catRes.ok) setCatalog(catRes.data.positions || []);
    if (pRes.ok) setPersons(pRes.data.persons || []);
    if (mRes.ok) {
      const mList = mRes.data.meetings || [];
      setMeetings(mList);
      if (mList.length > 0 && !actionForm.meetingId) {
        setActionForm((prev) => ({ ...prev, meetingId: mList[0].id }));
      }
    }
    if (txRes.ok) setClerkTransactions(txRes.data.transactions || []);

    const oParams = new URLSearchParams();
    if (activeYear) oParams.set('serviceYearId', activeYear);
    if (officerStatusFilter) oParams.set('status', officerStatusFilter);
    if (officerSearch.trim()) oParams.set('q', officerSearch.trim());

    const aParams = new URLSearchParams();
    if (selectedMeetingId) aParams.set('meetingId', selectedMeetingId);

    const [offRes, actRes] = await Promise.all([
      apiFetch(`/api/officers?${oParams.toString()}`),
      apiFetch(`/api/board-actions?${aParams.toString()}`),
    ]);

    if (offRes.ok) setOfficers(offRes.data.officers || []);
    if (actRes.ok) setActions(actRes.data.actions || []);
    setLoading(false);
  }, [selectedYearId, officerStatusFilter, officerSearch, selectedMeetingId, actionForm.meetingId]);

  useEffect(() => {
    loadCoreData();
  }, [loadCoreData]);

  const handleCreateServiceYear = async (e) => {
    e.preventDefault();
    setFeedback('');
    const res = await apiFetch('/api/service-years', {
      method: 'POST',
      body: JSON.stringify(yearForm),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setSelectedYearId(res.data.serviceYear.id);
    setShowYearForm(false);
    setFeedback('Service year created.');
    await loadCoreData();
  };

  const handleCatalogSelect = (val) => {
    if (!val) return;
    const [dept, title] = val.split('|||');
    setOfficerForm((p) => ({ ...p, department: dept || '', officeTitle: title || '' }));
  };

  const handleCreateOfficer = async (e) => {
    e.preventDefault();
    setFeedback('');
    if (!selectedYearId) {
      setFeedback('Please create or select a Service Year first.');
      return;
    }
    const res = await apiFetch('/api/officers', {
      method: 'POST',
      body: JSON.stringify({ ...officerForm, serviceYearId: selectedYearId }),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setShowOfficerForm(false);
    setOfficerForm({
      personId: '',
      officeTitle: '',
      department: '',
      status: 'NOMINATED',
      firstReadingDate: new Date().toISOString().slice(0, 10),
      electedDate: '',
      remarks: '',
    });
    setFeedback('Officer nomination/election saved.');
    await loadCoreData();
  };

  const handleUpdateOfficerStatus = async (officerId, nextStatus) => {
    setFeedback('');
    const today = new Date().toISOString().slice(0, 10);
    const res = await apiFetch(`/api/officers/${officerId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: nextStatus,
        electedDate: nextStatus === 'ELECTED' ? today : undefined,
      }),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setFeedback(`Officer status updated to ${OFFICER_STATUS_LABELS[nextStatus]}.`);
    await loadCoreData();
  };

  const handleCreateMeeting = async (e) => {
    e.preventDefault();
    setFeedback('');
    const res = await apiFetch('/api/board-meetings', {
      method: 'POST',
      body: JSON.stringify({ ...meetingForm, serviceYearId: selectedYearId || null }),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setShowMeetingForm(false);
    setMeetingForm({
      meetingType: isPcm ? 'PCM_EXECUTIVE' : 'CHURCH_BOARD',
      title: '',
      meetingDate: new Date().toISOString().slice(0, 10),
      location: '',
      chairperson: '',
      secretaryName: '',
      attendeesSummary: '',
      openingPrayerBy: '',
      closingPrayerBy: '',
      minutesBody: '',
      isApproved: false,
    });
    setFeedback('Board/Business meeting minutes recorded.');
    await loadCoreData();
  };

  const handleToggleApproveMeeting = async (meeting) => {
    const res = await apiFetch(`/api/board-meetings/${meeting.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isApproved: !meeting.is_approved }),
    });
    if (res.ok) {
      setFeedback(!meeting.is_approved ? 'Minutes marked as Approved.' : 'Approval reverted.');
      await loadCoreData();
    }
  };

  const handleCreateAction = async (e) => {
    e.preventDefault();
    setFeedback('');
    const res = await apiFetch('/api/board-actions', {
      method: 'POST',
      body: JSON.stringify(actionForm),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setShowActionForm(false);
    setActionForm((prev) => ({
      ...prev,
      actionNumber: `ACT-${new Date().getFullYear()}-00${actions.length + 2}`,
      title: '',
      motionText: '',
      movedBy: '',
      secondedBy: '',
      assignedTo: '',
      dueDate: '',
      linkedMembershipTransactionId: '',
    }));
    setFeedback(
      actionForm.linkedMembershipTransactionId
        ? 'Voted action recorded and linked to the Clerk membership transaction!'
        : 'Voted action recorded.'
    );
    await loadCoreData();
  };

  const handleUpdateActionStatus = async (actionId, status) => {
    const res = await apiFetch(`/api/board-actions/${actionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (res.ok) await loadCoreData();
  };

  const electedCount = officers.filter((o) => o.status === 'ELECTED').length;
  const nominatedCount = officers.filter((o) => o.status === 'NOMINATED').length;

  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Elected Officers</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{electedCount}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Pending Nominations</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{nominatedCount}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Recorded Meetings</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{meetings.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Voted Actions</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">{actions.length}</div>
        </div>
      </div>

      {/* Sub-Navigation Pills & Service Year Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSubView('officers')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              subView === 'officers'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {isPcm
              ? 'Nominating Committee & PCM Officers'
              : 'Nominating Committee & Church Officers'}
          </button>
          <button
            type="button"
            onClick={() => setSubView('minutes')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              subView === 'minutes'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {isPcm
              ? 'Executive & Chapter Minutes / Actions'
              : 'Board & Business Minutes / Actions'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedYearId}
            onChange={(e) => setSelectedYearId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
          >
            {serviceYears.length === 0 && <option value="">No Service Year Yet</option>}
            {serviceYears.map((sy) => (
              <option key={sy.id} value={sy.id}>
                {sy.label} {sy.is_current ? '(Current)' : ''}
              </option>
            ))}
          </select>
          {isVerified && (
            <button
              type="button"
              onClick={() => setShowYearForm((v) => !v)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              + Term
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
          {feedback}
        </div>
      )}

      {/* New Service Year Form */}
      {showYearForm && (
        <form
          onSubmit={handleCreateServiceYear}
          className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3"
        >
          <div className="text-xs font-bold text-slate-900">
            Create {isPcm ? 'Academic / Service Year' : 'Church Service Year'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              required
              placeholder={isPcm ? 'e.g., 2026/2027 Academic Year' : 'e.g., 2026–2027 Church Year'}
              value={yearForm.label}
              onChange={(e) => setYearForm((p) => ({ ...p, label: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            />
            <input
              type="date"
              required
              value={yearForm.startDate}
              onChange={(e) => setYearForm((p) => ({ ...p, startDate: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            />
            <input
              type="date"
              required
              value={yearForm.endDate}
              onChange={(e) => setYearForm((p) => ({ ...p, endDate: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            />
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 px-2">
              <input
                type="checkbox"
                checked={yearForm.isCurrent}
                onChange={(e) => setYearForm((p) => ({ ...p, isCurrent: e.target.checked }))}
              />
              Set as Active Term
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowYearForm(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-medium"
            >
              Save Service Year
            </button>
          </div>
        </form>
      )}

      {/* ── VIEW 1: NOMINATING COMMITTEE & OFFICERS ───────────────────────── */}
      {subView === 'officers' && (
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isPcm
                  ? 'PCM Executive & Ministry Roster'
                  : 'Elected Church Officers & Department Leaders'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isPcm
                  ? 'Record PCM Manual executive nominations, campus elections, and chapter appointments.'
                  : 'Church Manual Nominating Committee report, first/second readings, and elected board roster.'}
              </p>
            </div>

            <button
              type="button"
              disabled={!isVerified}
              onClick={() => {
                if (serviceYears.length === 0) {
                  setShowYearForm(true);
                  setFeedback('Create a Service Year first before nominating officers.');
                } else {
                  setShowOfficerForm((v) => !v);
                }
              }}
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium disabled:opacity-50"
            >
              {showOfficerForm ? 'Close Form' : '+ Nominate / Assign Officer'}
            </button>
          </div>

          {showOfficerForm && (
            <form
              onSubmit={handleCreateOfficer}
              className="mt-5 p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4"
            >
              <div className="text-xs font-bold text-slate-800">
                Assign Manual Position ({isPcm ? 'PCM Manual Catalog' : 'SDA Church Manual Catalog'})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Select Member / Student *
                  </label>
                  <select
                    required
                    value={officerForm.personId}
                    onChange={(e) => setOfficerForm((p) => ({ ...p, personId: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    <option value="">-- Choose from Directory --</option>
                    {persons.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.last_name}, {p.first_name} ({p.membership_status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Standard Manual Position Preset
                  </label>
                  <select
                    onChange={(e) => handleCatalogSelect(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    <option value="">-- Pick Preset or Type Below --</option>
                    {catalog.map((c, i) => (
                      <option key={i} value={`${c.department}|||${c.officeTitle}`}>
                        {c.department}: {c.officeTitle}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Office / Position Title *
                  </label>
                  <input
                    required
                    placeholder="e.g., First Elder or PCM President"
                    value={officerForm.officeTitle}
                    onChange={(e) =>
                      setOfficerForm((p) => ({ ...p, officeTitle: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Department / Committee
                  </label>
                  <input
                    placeholder="e.g., Secretariat, Sabbath School"
                    value={officerForm.department}
                    onChange={(e) =>
                      setOfficerForm((p) => ({ ...p, department: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Election Stage</label>
                  <select
                    value={officerForm.status}
                    onChange={(e) => setOfficerForm((p) => ({ ...p, status: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    {Object.entries(OFFICER_STATUS_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    First Reading Date
                  </label>
                  <input
                    type="date"
                    value={officerForm.firstReadingDate}
                    onChange={(e) =>
                      setOfficerForm((p) => ({ ...p, firstReadingDate: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowOfficerForm(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-700 text-white text-xs font-medium"
                >
                  Save Officer
                </button>
              </div>
            </form>
          )}

          {/* Filter Bar */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="search"
              placeholder="Search officer name, title, or department..."
              value={officerSearch}
              onChange={(e) => setOfficerSearch(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            />
            <select
              value={officerStatusFilter}
              onChange={(e) => setOfficerStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            >
              <option value="">All Election Statuses</option>
              {Object.entries(OFFICER_STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="text-xs text-slate-500 mt-6">Loading officers...</p>
          ) : officers.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500">
              No officers recorded for this term yet. Click{' '}
              <strong>+ Nominate / Assign Officer</strong> to populate your roster.
            </div>
          ) : (
            <>
              {/* Mobile Card View (< md) */}
              <div className="mt-5 space-y-3 md:hidden">
                {officers.map((o) => (
                  <div key={o.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-sm text-slate-900">
                          {o.first_name} {o.last_name}
                        </div>
                        <div className="text-xs font-medium text-blue-800">{o.office_title}</div>
                        {o.department && (
                          <div className="text-[11px] text-slate-500">{o.department}</div>
                        )}
                      </div>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                          OFFICER_STATUS_BADGE[o.status]
                        }`}
                      >
                        {OFFICER_STATUS_LABELS[o.status]}
                      </span>
                    </div>
                    {isVerified && o.status === 'NOMINATED' && (
                      <div className="pt-1 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdateOfficerStatus(o.id, 'ELECTED')}
                          className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-medium"
                        >
                          Confirm Elected
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateOfficerStatus(o.id, 'DECLINED')}
                          className="px-2.5 py-1 rounded border border-slate-300 text-xs text-slate-700"
                        >
                          Declined
                        </button>
                      </div>
                    )}
                    {isVerified && o.status === 'ELECTED' && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateOfficerStatus(o.id, 'COMPLETED')}
                          className="px-2.5 py-1 rounded border border-slate-300 text-xs text-slate-700"
                        >
                          Complete Term
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop Table View (>= md) */}
              <div className="mt-5 hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2.5 pr-4">Department</th>
                      <th className="py-2.5 pr-4">Office / Position</th>
                      <th className="py-2.5 pr-4">Officer</th>
                      <th className="py-2.5 pr-4">Dates</th>
                      <th className="py-2.5 pr-4">Status</th>
                      <th className="py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {officers.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-50/70">
                        <td className="py-3 pr-4 text-slate-500">{o.department || '—'}</td>
                        <td className="py-3 pr-4 font-semibold text-slate-900">
                          {o.office_title}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-slate-900">
                            {o.first_name} {o.last_name}
                          </div>
                          {o.person_phone && (
                            <div className="text-slate-400">{o.person_phone}</div>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-[11px] text-slate-500">
                          {o.first_reading_date && (
                            <div>1st Read: {String(o.first_reading_date).slice(0, 10)}</div>
                          )}
                          {o.elected_date && (
                            <div>Elected: {String(o.elected_date).slice(0, 10)}</div>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`inline-block font-medium px-2.5 py-0.5 rounded-full border ${
                              OFFICER_STATUS_BADGE[o.status]
                            }`}
                          >
                            {OFFICER_STATUS_LABELS[o.status]}
                          </span>
                        </td>
                        <td className="py-3 text-right space-x-2">
                          {isVerified && o.status === 'NOMINATED' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateOfficerStatus(o.id, 'ELECTED')}
                                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                              >
                                Elect
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateOfficerStatus(o.id, 'DECLINED')}
                                className="text-slate-600 hover:underline"
                              >
                                Decline
                              </button>
                            </>
                          )}
                          {isVerified && o.status === 'ELECTED' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateOfficerStatus(o.id, 'COMPLETED')}
                              className="text-slate-600 hover:underline"
                            >
                              Complete Term
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
      )}

      {/* ── VIEW 2: BOARD & BUSINESS MINUTES + VOTED ACTIONS ──────────────── */}
      {subView === 'minutes' && (
        <div className="space-y-6">
          {/* Meetings Register */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {isPcm
                    ? 'PCM Executive & Chapter Meeting Minutes'
                    : 'Church Board & Business Meeting Minutes'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Log official meetings, attendance summaries, and Clerk/Secretary minutes.
                </p>
              </div>
              <button
                type="button"
                disabled={!isVerified}
                onClick={() => setShowMeetingForm((v) => !v)}
                className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium disabled:opacity-50"
              >
                {showMeetingForm ? 'Close Form' : '+ Record Meeting Minutes'}
              </button>
            </div>

            {showMeetingForm && (
              <form
                onSubmit={handleCreateMeeting}
                className="mt-5 p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Meeting Type *
                    </label>
                    <select
                      value={meetingForm.meetingType}
                      onChange={(e) =>
                        setMeetingForm((p) => ({ ...p, meetingType: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    >
                      {Object.entries(MEETING_TYPE_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Meeting Title *
                    </label>
                    <input
                      required
                      placeholder="e.g., Q4 Regular Church Board Meeting"
                      value={meetingForm.title}
                      onChange={(e) => setMeetingForm((p) => ({ ...p, title: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Meeting Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={meetingForm.meetingDate}
                      onChange={(e) =>
                        setMeetingForm((p) => ({ ...p, meetingDate: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <input
                    placeholder="Chairperson (Pastor / First Elder / President)"
                    value={meetingForm.chairperson}
                    onChange={(e) =>
                      setMeetingForm((p) => ({ ...p, chairperson: e.target.value }))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                  <input
                    placeholder="Recording Clerk / Secretary"
                    value={meetingForm.secretaryName}
                    onChange={(e) =>
                      setMeetingForm((p) => ({ ...p, secretaryName: e.target.value }))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                  <input
                    placeholder="Location / Venue"
                    value={meetingForm.location}
                    onChange={(e) =>
                      setMeetingForm((p) => ({ ...p, location: e.target.value }))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                  <input
                    placeholder="Opening Prayer By"
                    value={meetingForm.openingPrayerBy}
                    onChange={(e) =>
                      setMeetingForm((p) => ({ ...p, openingPrayerBy: e.target.value }))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                  <input
                    placeholder="Closing Prayer By"
                    value={meetingForm.closingPrayerBy}
                    onChange={(e) =>
                      setMeetingForm((p) => ({ ...p, closingPrayerBy: e.target.value }))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                  <input
                    placeholder="Present / Quorum Summary"
                    value={meetingForm.attendeesSummary}
                    onChange={(e) =>
                      setMeetingForm((p) => ({ ...p, attendeesSummary: e.target.value }))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                  <textarea
                    rows={3}
                    placeholder="General discussion summary & notes..."
                    value={meetingForm.minutesBody}
                    onChange={(e) =>
                      setMeetingForm((p) => ({ ...p, minutesBody: e.target.value }))
                    }
                    className="sm:col-span-2 lg:col-span-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMeetingForm(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-xs text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-blue-700 text-white text-xs font-medium"
                  >
                    Save Meeting
                  </button>
                </div>
              </form>
            )}

            {meetings.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                No meetings logged yet. Record a meeting first, then attach voted actions below.
              </p>
            ) : (
              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                {meetings.map((m) => (
                  <div
                    key={m.id}
                    className={`border rounded-xl p-4 space-y-2 transition ${
                      selectedMeetingId === m.id
                        ? 'border-blue-600 bg-blue-50/30'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-semibold text-blue-800">
                          {MEETING_TYPE_LABELS[m.meeting_type]}
                        </span>
                        <h3 className="font-bold text-sm text-slate-900">{m.title}</h3>
                      </div>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                          m.is_approved
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {m.is_approved ? 'Approved' : 'Draft'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      Date: {String(m.meeting_date).slice(0, 10)} • {m.actions_count} voted action(s)
                      {m.chairperson ? ` • Chair: ${m.chairperson}` : ''}
                    </div>
                    {m.minutes_body && (
                      <p className="text-xs text-slate-600 line-clamp-2">{m.minutes_body}</p>
                    )}
                    <div className="pt-1 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedMeetingId((prev) => (prev === m.id ? '' : m.id))
                        }
                        className="px-2.5 py-1 rounded border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {selectedMeetingId === m.id ? 'Show All Actions' : 'Filter Actions'}
                      </button>
                      {isVerified && (
                        <button
                          type="button"
                          onClick={() => handleToggleApproveMeeting(m)}
                          className="px-2.5 py-1 rounded border border-slate-300 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          {m.is_approved ? 'Unapprove' : 'Approve Minutes'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Voted Actions & Clerk Linkage */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Voted Actions &amp; Clerk Cross-References
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Record formal motions and optionally link membership votes directly to Clerk Audit Trail entries.
                </p>
              </div>
              <button
                type="button"
                disabled={!isVerified || meetings.length === 0}
                onClick={() => setShowActionForm((v) => !v)}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium disabled:opacity-50"
              >
                {showActionForm ? 'Close Form' : '+ Add Voted Action'}
              </button>
            </div>

            {showActionForm && (
              <form
                onSubmit={handleCreateAction}
                className="mt-5 p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Meeting *</label>
                    <select
                      required
                      value={actionForm.meetingId}
                      onChange={(e) =>
                        setActionForm((p) => ({ ...p, meetingId: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    >
                      {meetings.map((m) => (
                        <option key={m.id} value={m.id}>
                          {String(m.meeting_date).slice(0, 10)} — {m.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Minute / Action Number *
                    </label>
                    <input
                      required
                      placeholder="e.g., ACT-2026-001"
                      value={actionForm.actionNumber}
                      onChange={(e) =>
                        setActionForm((p) => ({ ...p, actionNumber: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Category</label>
                    <select
                      value={actionForm.category}
                      onChange={(e) =>
                        setActionForm((p) => ({ ...p, category: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    >
                      <option value="GENERAL">General Governance</option>
                      <option value="MEMBERSHIP">Membership &amp; Transfers</option>
                      <option value="APPOINTMENTS">Officer Appointments</option>
                      <option value="FINANCE">Treasury &amp; Budget</option>
                      <option value="MINISTRY">Ministries &amp; Evangelism</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Action Title *
                    </label>
                    <input
                      required
                      placeholder="e.g., Recommend Letter of Transfer for Sis. Mutale"
                      value={actionForm.title}
                      onChange={(e) => setActionForm((p) => ({ ...p, title: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">Status</label>
                    <select
                      value={actionForm.status}
                      onChange={(e) => setActionForm((p) => ({ ...p, status: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    >
                      <option value="VOTED">Voted</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="PROPOSED">Proposed</option>
                      <option value="TABLED">Tabled</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Formal Motion / Resolution Text *
                    </label>
                    <textarea
                      required
                      rows={2}
                      placeholder="VOTED to..."
                      value={actionForm.motionText}
                      onChange={(e) =>
                        setActionForm((p) => ({ ...p, motionText: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <input
                    placeholder="Moved By"
                    value={actionForm.movedBy}
                    onChange={(e) => setActionForm((p) => ({ ...p, movedBy: e.target.value }))}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                  <input
                    placeholder="Seconded By"
                    value={actionForm.secondedBy}
                    onChange={(e) =>
                      setActionForm((p) => ({ ...p, secondedBy: e.target.value }))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                  <input
                    placeholder="Assigned To (Officer / Dept)"
                    value={actionForm.assignedTo}
                    onChange={(e) =>
                      setActionForm((p) => ({ ...p, assignedTo: e.target.value }))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />

                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-[11px] font-semibold text-blue-900 mb-1">
                      Link to Clerk Membership Transaction (Optional — populates minute reference &amp; vote date)
                    </label>
                    <select
                      value={actionForm.linkedMembershipTransactionId}
                      onChange={(e) =>
                        setActionForm((p) => ({
                          ...p,
                          linkedMembershipTransactionId: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs text-slate-900"
                    >
                      <option value="">-- No Clerk Transaction Link --</option>
                      {clerkTransactions.map((tx) => (
                        <option key={tx.id} value={tx.id}>
                          {String(tx.effective_date || tx.created_at).slice(0, 10)} •{' '}
                          {tx.first_name} {tx.last_name} — {tx.transaction_type}
                          {tx.board_action_id ? ' (Already Linked)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowActionForm(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-xs text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium"
                  >
                    Record Voted Action
                  </button>
                </div>
              </form>
            )}

            {actions.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                No voted actions recorded yet.
              </p>
            ) : (
              <>
                {/* Mobile Card View (< md) */}
                <div className="mt-5 space-y-3 md:hidden">
                  {actions.map((a) => (
                    <div key={a.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[11px] font-mono font-semibold text-slate-500">
                            {a.action_number} • {a.category}
                          </span>
                          <div className="font-bold text-sm text-slate-900">{a.title}</div>
                        </div>
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                            ACTION_STATUS_BADGE[a.status]
                          }`}
                        >
                          {a.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">{a.motion_text}</p>
                      <div className="text-[11px] text-slate-500">
                        Meeting: {a.meeting_title} ({String(a.meeting_date).slice(0, 10)})
                      </div>
                      {a.linked_transaction_id && (
                        <div className="text-[11px] font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded">
                          Linked Clerk Entry: {a.linked_person_first_name}{' '}
                          {a.linked_person_last_name} ({a.linked_transaction_type})
                        </div>
                      )}
                      {isVerified && a.status !== 'COMPLETED' && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateActionStatus(a.id, 'COMPLETED')}
                            className="px-2.5 py-1 rounded border border-slate-300 text-xs text-slate-700"
                          >
                            Mark Completed
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop Table View (>= md) */}
                <div className="mt-5 hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="py-2.5 pr-4">Action #</th>
                        <th className="py-2.5 pr-4">Meeting</th>
                        <th className="py-2.5 pr-4">Motion &amp; Clerk Link</th>
                        <th className="py-2.5 pr-4">Status</th>
                        <th className="py-2.5 text-right">Update</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {actions.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50/70">
                          <td className="py-3 pr-4 font-mono font-semibold text-slate-800 whitespace-nowrap">
                            {a.action_number}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            <div className="font-medium text-slate-900">{a.meeting_title}</div>
                            <div className="text-[11px] text-slate-400">
                              {String(a.meeting_date).slice(0, 10)}
                            </div>
                          </td>
                          <td className="py-3 pr-4 max-w-md">
                            <div className="font-semibold text-slate-900">{a.title}</div>
                            <p className="text-slate-600 mt-0.5 line-clamp-2">{a.motion_text}</p>
                            {a.linked_transaction_id && (
                              <span className="inline-block mt-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                                Clerk Link: {a.linked_person_first_name}{' '}
                                {a.linked_person_last_name} ({a.linked_transaction_type})
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`inline-block font-medium px-2.5 py-0.5 rounded-full border ${
                                ACTION_STATUS_BADGE[a.status]
                              }`}
                            >
                              {a.status}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            {isVerified && a.status !== 'COMPLETED' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateActionStatus(a.id, 'COMPLETED')}
                                className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium"
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
        </div>
      )}
    </div>
  );
}
