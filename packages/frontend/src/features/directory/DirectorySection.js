"use client";
import { useEffect, useState, useCallback } from 'react';
import { apiFetch, API_URL } from '@/lib/api';

const STATUS_LABELS = {
  BAPTIZED_MEMBER: 'Baptized Member',
  PROFESSION_OF_FAITH: 'Profession of Faith',
  STUDENT_MEMBER: 'Student Member',
  VISITOR: 'Visitor / Interest',
  TRANSFERRED_OUT: 'Transferred Out',
  REMOVED: 'Removed',
  DECEASED: 'Deceased',
};

const STATUS_BADGE = {
  BAPTIZED_MEMBER: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PROFESSION_OF_FAITH: 'bg-teal-50 text-teal-700 border-teal-200',
  STUDENT_MEMBER: 'bg-blue-50 text-blue-700 border-blue-200',
  VISITOR: 'bg-amber-50 text-amber-700 border-amber-200',
  TRANSFERRED_OUT: 'bg-slate-100 text-slate-600 border-slate-200',
  REMOVED: 'bg-red-50 text-red-700 border-red-200',
  DECEASED: 'bg-slate-200 text-slate-700 border-slate-300',
};

const ACADEMIC_STATUS_LABELS = {
  FRESHMAN_INTAKE: 'Freshman Intake',
  ACTIVE_STUDENT: 'Active Student',
  STUDENT_LEADER: 'Student Leader',
  FINAL_YEAR: 'Final Year',
  ALUMNI_TRANSITIONED: 'Alumni Transitioned',
};

const ACADEMIC_STATUS_BADGE = {
  FRESHMAN_INTAKE: 'bg-sky-50 text-sky-800 border-sky-200',
  ACTIVE_STUDENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  STUDENT_LEADER: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  FINAL_YEAR: 'bg-amber-50 text-amber-800 border-amber-200',
  ALUMNI_TRANSITIONED: 'bg-slate-100 text-slate-700 border-slate-200',
};

const emptyPersonForm = (isPcm, defaultInstitution = '') => ({
  firstName: '',
  lastName: '',
  gender: '',
  dateOfBirth: '',
  phone: '',
  email: '',
  address: '',
  membershipStatus: isPcm ? 'STUDENT_MEMBER' : 'BAPTIZED_MEMBER',
  baptismDate: '',
  baptizingMinister: '',
  sabbathSchoolClass: '',
  studentId: '',
  programOfStudy: '',
  yearOfStudy: '',
  hostelOrResidence: '',
  homeChurch: '',
  householdId: '',
  notes: '',
  // PCM Enrichment fields
  academicInstitution: defaultInstitution,
  academicStatus: 'ACTIVE_STUDENT',
  campusFaculty: '',
  graduationYear: '',
  facultyAdvisorName: '',
  facultyAdvisorContact: '',
  emergencyContact: '',
  spiritualGifts: '',
  baptismalInterest: false,
  mentorEligible: false,
});

export default function DirectorySection({ activeTenant }) {
  const isPcm = activeTenant?.organization_type === 'PCM_CHAPTER';
  const isVerified = activeTenant?.verification_status === 'VERIFIED';
  const defaultCampus = activeTenant?.city_or_campus || '';

  const allowedStatuses = isPcm
    ? ['STUDENT_MEMBER', 'VISITOR', 'TRANSFERRED_OUT', 'REMOVED', 'DECEASED']
    : ['BAPTIZED_MEMBER', 'PROFESSION_OF_FAITH', 'VISITOR', 'TRANSFERRED_OUT', 'REMOVED', 'DECEASED'];

  const [persons, setPersons] = useState([]);
  const [counts, setCounts] = useState([]);
  const [households, setHouseholds] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [householdFilter, setHouseholdFilter] = useState('');
  const [academicStatusFilter, setAcademicStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [showAddPerson, setShowAddPerson] = useState(false);
  const [showAddHousehold, setShowAddHousehold] = useState(false);
  const [showTransitionForm, setShowTransitionForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [feedback, setFeedback] = useState('');

  const [personForm, setPersonForm] = useState(() => emptyPersonForm(isPcm, defaultCampus));
  const [householdForm, setHouseholdForm] = useState({
    householdName: '',
    primaryPhone: '',
    address: '',
  });
  const [transitionForm, setTransitionForm] = useState({
    fromStatus: 'FINAL_YEAR',
    toStatus: 'ALUMNI_TRANSITIONED',
    graduationYear: String(new Date().getFullYear()),
  });

  useEffect(() => {
    if (!editingId) {
      setPersonForm(emptyPersonForm(isPcm, defaultCampus));
    }
  }, [isPcm, defaultCampus, editingId]);

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (statusFilter) params.set('status', statusFilter);
    if (!isPcm && householdFilter) params.set('householdId', householdFilter);

    const requests = [
      apiFetch(`/api/persons?${params.toString()}`),
      isPcm ? apiFetch('/api/pcm/profiles') : apiFetch('/api/households'),
    ];

    const [pRes, secondaryRes] = await Promise.all(requests);

    let basePersons = pRes.ok ? pRes.data.persons || [] : [];
    if (pRes.ok) {
      setCounts(pRes.data.counts || []);
    }

    if (isPcm) {
      const pcmMap = new Map();
      if (secondaryRes.ok) {
        for (const prof of secondaryRes.data.profiles || []) {
          pcmMap.set(prof.person_id, prof);
        }
      }
      let merged = basePersons.map((p) => {
        const prof = pcmMap.get(p.id);
        return {
          ...p,
          pcm_profile_id: prof?.pcm_profile_id || null,
          academic_institution: prof?.academic_institution || defaultCampus,
          academic_status: prof?.academic_status || 'ACTIVE_STUDENT',
          campus_faculty: prof?.campus_faculty || '',
          graduation_year: prof?.graduation_year || '',
          faculty_advisor_name: prof?.faculty_advisor_name || '',
          faculty_advisor_contact: prof?.faculty_advisor_contact || '',
          emergency_contact: prof?.emergency_contact || '',
          spiritual_gifts: prof?.spiritual_gifts || '',
          baptismal_interest: Boolean(prof?.baptismal_interest),
          mentor_eligible: Boolean(prof?.mentor_eligible),
        };
      });

      if (academicStatusFilter) {
        merged = merged.filter((p) => p.academic_status === academicStatusFilter);
      }
      setPersons(merged);
      setHouseholds([]);
    } else {
      setPersons(basePersons);
      if (secondaryRes.ok) {
        setHouseholds(secondaryRes.data.households || []);
      }
    }

    setLoading(false);
  }, [query, statusFilter, householdFilter, academicStatusFilter, isPcm, defaultCampus]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const startEdit = (p) => {
    setEditingId(p.id);
    setShowAddPerson(true);
    setShowAddHousehold(false);
    setShowTransitionForm(false);
    setShowCsvImport(false);
    setPersonForm({
      firstName: p.first_name || '',
      lastName: p.last_name || '',
      gender: p.gender || '',
      dateOfBirth: p.date_of_birth ? String(p.date_of_birth).slice(0, 10) : '',
      phone: p.phone || '',
      email: p.email || '',
      address: p.address || '',
      membershipStatus: p.membership_status || (isPcm ? 'STUDENT_MEMBER' : 'BAPTIZED_MEMBER'),
      baptismDate: p.baptism_date ? String(p.baptism_date).slice(0, 10) : '',
      baptizingMinister: p.baptizing_minister || '',
      sabbathSchoolClass: p.sabbath_school_class || '',
      studentId: p.student_id || '',
      programOfStudy: p.program_of_study || '',
      yearOfStudy: p.year_of_study || '',
      hostelOrResidence: p.hostel_or_residence || '',
      homeChurch: p.home_church || '',
      householdId: p.household_id || '',
      notes: p.notes || '',
      academicInstitution: p.academic_institution || defaultCampus,
      academicStatus: p.academic_status || 'ACTIVE_STUDENT',
      campusFaculty: p.campus_faculty || '',
      graduationYear: p.graduation_year ? String(p.graduation_year) : '',
      facultyAdvisorName: p.faculty_advisor_name || '',
      facultyAdvisorContact: p.faculty_advisor_contact || '',
      emergencyContact: p.emergency_contact || '',
      spiritualGifts: p.spiritual_gifts || '',
      baptismalInterest: Boolean(p.baptismal_interest),
      mentorEligible: Boolean(p.mentor_eligible),
    });
  };

  const handleSavePerson = async (e) => {
    e.preventDefault();
    setFeedback('');
    const url = editingId ? `/api/persons/${editingId}` : '/api/persons';
    const method = editingId ? 'PATCH' : 'POST';

    const payload = { ...personForm };
    if (isPcm) {
      payload.householdId = '';
    }

    const res = await apiFetch(url, {
      method,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }

    const savedPersonId = editingId || res.data?.person?.id || res.data?.id;

    // Save PCM academic & spiritual enrichment profile in the same flow
    if (isPcm && savedPersonId) {
      const pcmRes = await apiFetch(`/api/pcm/profiles/${savedPersonId}`, {
        method: 'PUT',
        body: JSON.stringify({
          academicInstitution: personForm.academicInstitution || defaultCampus,
          academicStatus: personForm.academicStatus || 'ACTIVE_STUDENT',
          campusFaculty: personForm.campusFaculty,
          programOfStudy: personForm.programOfStudy,
          studentNumber: personForm.studentId,
          yearOfStudy: personForm.yearOfStudy,
          graduationYear: personForm.graduationYear,
          facultyAdvisorName: personForm.facultyAdvisorName,
          facultyAdvisorContact: personForm.facultyAdvisorContact,
          baptismalInterest: Boolean(personForm.baptismalInterest),
          spiritualGifts: personForm.spiritualGifts,
          emergencyContact: personForm.emergencyContact,
          mentorEligible: Boolean(personForm.mentorEligible),
          notes: personForm.notes,
        }),
      });
      if (!pcmRes.ok) {
        setFeedback(`Student saved, but PCM enrichment warning: ${pcmRes.error}`);
        await loadDirectory();
        return;
      }
    }

    setShowAddPerson(false);
    setEditingId(null);
    setPersonForm(emptyPersonForm(isPcm, defaultCampus));
    setFeedback(
      editingId
        ? `${isPcm ? 'Student record & PCM profile' : 'Member record'} updated.`
        : `${isPcm ? 'Student & PCM profile' : 'Member'} added to directory.`
    );
    await loadDirectory();
  };

  const handleCreateHousehold = async (e) => {
    e.preventDefault();
    setFeedback('');
    const res = await apiFetch('/api/households', {
      method: 'POST',
      body: JSON.stringify(householdForm),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setShowAddHousehold(false);
    setHouseholdForm({ householdName: '', primaryPhone: '', address: '' });
    setFeedback('Household group created.');
    await loadDirectory();
  };

  const handleSemesterTransition = async (e) => {
    e.preventDefault();
    setFeedback('');
    const res = await apiFetch('/api/pcm/profiles/semester-transition', {
      method: 'POST',
      body: JSON.stringify(transitionForm),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setShowTransitionForm(false);
    setFeedback(
      `Semester transition completed: ${res.data.updatedCount} student profile(s) updated.`
    );
    await loadDirectory();
  };

  const handleCsvFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(String(ev.target?.result || ''));
    };
    reader.readAsText(file);
  };

  const handleImportCsv = async (e) => {
    e.preventDefault();
    setImporting(true);
    setFeedback('');
    const res = await apiFetch('/api/persons/import', {
      method: 'POST',
      body: JSON.stringify({ csvText }),
    });
    setImporting(false);
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    const { imported = 0, skipped = [] } = res.data;
    setShowCsvImport(false);
    setCsvText('');
    setFeedback(
      `Imported ${imported} record(s).${skipped.length ? ` Skipped ${skipped.length}: ${skipped[0]}` : ''}`
    );
    await loadDirectory();
  };

  const downloadCsvTemplate = () => {
    const template = isPcm
      ? 'first_name,last_name,membership_status,gender,phone,email,student_id,program_of_study,hostel_or_residence,home_church,baptism_date\nMercy,Mwansa,STUDENT_MEMBER,Female,+260977000111,mercy@example.com,202309876,BSc Nursing,Kafue Hostel,Kabwe Central SDA,2019-08-17'
      : 'first_name,last_name,membership_status,gender,phone,email,address,sabbath_school_class,baptism_date,baptizing_minister\nJohn,Banda,BAPTIZED_MEMBER,Male,+260977000222,john@example.com,Plot 14 Mansa,Faith Action Unit,2018-06-12,Pr. M. Phiri';
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isPcm ? 'pcm-students-template.csv' : 'church-members-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (statusFilter) params.set('status', statusFilter);
    if (!isPcm && householdFilter) params.set('householdId', householdFilter);

    const headers = {};
    if (typeof window !== 'undefined') {
      const tid = localStorage.getItem('ah_active_tenant_id');
      if (tid) headers['x-tenant-id'] = tid;
    }

    const res = await fetch(`${API_URL}/api/persons/export?${params.toString()}`, {
      credentials: 'include',
      headers,
    });
    if (!res.ok) {
      setFeedback('Failed to export CSV.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTenant?.slug || 'directory'}-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPeople = counts.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="space-y-6">
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Directory</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalPeople}</div>
        </div>
        {counts.slice(0, 3).map((c) => (
          <div key={c.membership_status} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500 truncate">
              {STATUS_LABELS[c.membership_status] || c.membership_status}
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{c.count}</div>
          </div>
        ))}
      </div>

      {/* Main Directory Card */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isPcm ? 'Campus Student Directory & Lifecycle Profiles' : 'Congregation & Membership Roll'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isPcm
                ? 'Manage campus students, academic lifecycle stages, mentor eligibility, and home church connections.'
                : 'Church Manual congregant directory, baptismal records, and optional family households.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              disabled={!isVerified}
              onClick={() => {
                setShowCsvImport((v) => !v);
                setShowAddHousehold(false);
                setShowTransitionForm(false);
                setShowAddPerson(false);
                setEditingId(null);
              }}
              className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Import CSV
            </button>

            {isPcm ? (
              <button
                type="button"
                disabled={!isVerified}
                onClick={() => {
                  setShowTransitionForm((v) => !v);
                  setShowAddPerson(false);
                  setShowCsvImport(false);
                  setEditingId(null);
                }}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Semester Transition
              </button>
            ) : (
              <button
                type="button"
                disabled={!isVerified}
                onClick={() => {
                  setShowAddHousehold((v) => !v);
                  setShowAddPerson(false);
                  setShowCsvImport(false);
                  setEditingId(null);
                }}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                + Household
              </button>
            )}

            <button
              type="button"
              disabled={!isVerified}
              onClick={() => {
                if (showAddPerson) {
                  setShowAddPerson(false);
                  setEditingId(null);
                  setPersonForm(emptyPersonForm(isPcm, defaultCampus));
                } else {
                  setEditingId(null);
                  setPersonForm(emptyPersonForm(isPcm, defaultCampus));
                  setShowAddPerson(true);
                  setShowAddHousehold(false);
                  setShowTransitionForm(false);
                  setShowCsvImport(false);
                }
              }}
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium disabled:opacity-50"
            >
              + Add {isPcm ? 'Student' : 'Person'}
            </button>
          </div>
        </div>

        {feedback && (
          <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
            {feedback}
          </div>
        )}

        {/* Batch Semester / Graduation Transition Drawer (PCM Only) */}
        {isPcm && showTransitionForm && (
          <form
            onSubmit={handleSemesterTransition}
            className="mt-5 p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3"
          >
            <div className="text-xs font-bold text-amber-950">
              Batch Semester / Graduation Lifecycle Promotion
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">From Stage</label>
                <select
                  value={transitionForm.fromStatus}
                  onChange={(e) =>
                    setTransitionForm((p) => ({ ...p, fromStatus: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                >
                  {Object.entries(ACADEMIC_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Promote To Stage</label>
                <select
                  value={transitionForm.toStatus}
                  onChange={(e) =>
                    setTransitionForm((p) => ({ ...p, toStatus: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                >
                  {Object.entries(ACADEMIC_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">
                  Filter Graduation Year (Optional)
                </label>
                <input
                  type="number"
                  placeholder="e.g., 2026"
                  value={transitionForm.graduationYear}
                  onChange={(e) =>
                    setTransitionForm((p) => ({ ...p, graduationYear: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                >
                  Run Batch Transition
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Bulk CSV Import Drawer */}
        {showCsvImport && (
          <form
            onSubmit={handleImportCsv}
            className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-800">
                Bulk Import {isPcm ? 'Students' : 'Members'} via CSV
              </div>
              <button
                type="button"
                onClick={downloadCsvTemplate}
                className="text-xs font-medium text-blue-700 hover:underline text-left"
              >
                Download Sample CSV Template
              </button>
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFileUpload}
              className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <textarea
              required
              rows={4}
              placeholder="Or paste CSV rows here (must include first_name,last_name header)..."
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-3 text-xs font-mono text-slate-900"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCsvImport(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={importing}
                className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium disabled:opacity-50"
              >
                {importing ? 'Importing...' : 'Run CSV Import'}
              </button>
            </div>
          </form>
        )}

        {/* Optional Household Creation Drawer (Local Church Only) */}
        {!isPcm && showAddHousehold && (
          <form
            onSubmit={handleCreateHousehold}
            className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3"
          >
            <input
              required
              placeholder="Household / Family Name (e.g., Banda Family)"
              value={householdForm.householdName}
              onChange={(e) => setHouseholdForm((p) => ({ ...p, householdName: e.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
            <input
              placeholder="Primary Phone"
              value={householdForm.primaryPhone}
              onChange={(e) => setHouseholdForm((p) => ({ ...p, primaryPhone: e.target.value }))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
            <div className="flex gap-2">
              <input
                placeholder="Residential Address"
                value={householdForm.address}
                onChange={(e) => setHouseholdForm((p) => ({ ...p, address: e.target.value }))}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium"
              >
                Save
              </button>
            </div>
          </form>
        )}

        {/* Add / Edit Person or Student + PCM Enrichment Form */}
        {showAddPerson && (
          <form
            onSubmit={handleSavePerson}
            className="mt-5 p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-5"
          >
            <div className="text-xs font-bold text-slate-800">
              {editingId
                ? `Edit ${isPcm ? 'Student & PCM Lifecycle' : 'Person'} Record`
                : `New ${isPcm ? 'Student & PCM Lifecycle' : 'Person'} Record`}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <input
                required
                placeholder="First Name *"
                value={personForm.firstName}
                onChange={(e) => setPersonForm((p) => ({ ...p, firstName: e.target.value }))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
              <input
                required
                placeholder="Last Name *"
                value={personForm.lastName}
                onChange={(e) => setPersonForm((p) => ({ ...p, lastName: e.target.value }))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
              <select
                value={personForm.membershipStatus}
                onChange={(e) => setPersonForm((p) => ({ ...p, membershipStatus: e.target.value }))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              >
                {allowedStatuses.map((val) => (
                  <option key={val} value={val}>
                    {STATUS_LABELS[val]}
                  </option>
                ))}
              </select>

              <select
                value={personForm.gender}
                onChange={(e) => setPersonForm((p) => ({ ...p, gender: e.target.value }))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              >
                <option value="">Gender (Optional)</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>

              <input
                placeholder="Phone (+260...)"
                value={personForm.phone}
                onChange={(e) => setPersonForm((p) => ({ ...p, phone: e.target.value }))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
              <input
                type="email"
                placeholder="Email (Optional)"
                value={personForm.email}
                onChange={(e) => setPersonForm((p) => ({ ...p, email: e.target.value }))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />

              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">Baptism Date</label>
                <input
                  type="date"
                  value={personForm.baptismDate}
                  onChange={(e) => setPersonForm((p) => ({ ...p, baptismDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <input
                placeholder="Baptizing Minister"
                value={personForm.baptizingMinister}
                onChange={(e) => setPersonForm((p) => ({ ...p, baptizingMinister: e.target.value }))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 self-end"
              />

              {isPcm ? (
                <input
                  placeholder="Home Church"
                  value={personForm.homeChurch}
                  onChange={(e) => setPersonForm((p) => ({ ...p, homeChurch: e.target.value }))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 self-end"
                />
              ) : (
                <select
                  value={personForm.householdId}
                  onChange={(e) => setPersonForm((p) => ({ ...p, householdId: e.target.value }))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 self-end"
                >
                  <option value="">No Household Group (Optional)</option>
                  {households.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.household_name}
                    </option>
                  ))}
                </select>
              )}

              {!isPcm && (
                <>
                  <input
                    placeholder="Sabbath School Class / Action Unit"
                    value={personForm.sabbathSchoolClass}
                    onChange={(e) =>
                      setPersonForm((p) => ({ ...p, sabbathSchoolClass: e.target.value }))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                  <input
                    placeholder="Residential Address"
                    value={personForm.address}
                    onChange={(e) => setPersonForm((p) => ({ ...p, address: e.target.value }))}
                    className="sm:col-span-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </>
              )}
            </div>

            {/* Integrated Campus Academic & Discipleship Enrichment (PCM Only) */}
            {isPcm && (
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="text-xs font-bold text-blue-900">
                  Campus Academic &amp; Discipleship Enrichment
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Campus Lifecycle Stage
                    </label>
                    <select
                      value={personForm.academicStatus}
                      onChange={(e) =>
                        setPersonForm((p) => ({ ...p, academicStatus: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    >
                      {Object.entries(ACADEMIC_STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Academic Institution / Campus
                    </label>
                    <input
                      placeholder="e.g., Mulungushi University"
                      value={personForm.academicInstitution}
                      onChange={(e) =>
                        setPersonForm((p) => ({ ...p, academicInstitution: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Faculty / School
                    </label>
                    <input
                      placeholder="e.g., School of Science & Technology"
                      value={personForm.campusFaculty}
                      onChange={(e) =>
                        setPersonForm((p) => ({ ...p, campusFaculty: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Program of Study
                    </label>
                    <input
                      placeholder="e.g., BSc Computer Science"
                      value={personForm.programOfStudy}
                      onChange={(e) =>
                        setPersonForm((p) => ({ ...p, programOfStudy: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Student ID Number
                    </label>
                    <input
                      placeholder="e.g., 202401928"
                      value={personForm.studentId}
                      onChange={(e) =>
                        setPersonForm((p) => ({ ...p, studentId: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Study Year</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        placeholder="1–6"
                        value={personForm.yearOfStudy}
                        onChange={(e) =>
                          setPersonForm((p) => ({ ...p, yearOfStudy: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">Grad Year</label>
                      <input
                        type="number"
                        min={2000}
                        max={2050}
                        placeholder="2027"
                        value={personForm.graduationYear}
                        onChange={(e) =>
                          setPersonForm((p) => ({ ...p, graduationYear: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Hostel / Campus Residence
                    </label>
                    <input
                      placeholder="e.g., Zambezi Hostel"
                      value={personForm.hostelOrResidence}
                      onChange={(e) =>
                        setPersonForm((p) => ({ ...p, hostelOrResidence: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Faculty Advisor / Chaplain
                    </label>
                    <input
                      placeholder="e.g., Dr. M. Phiri"
                      value={personForm.facultyAdvisorName}
                      onChange={(e) =>
                        setPersonForm((p) => ({ ...p, facultyAdvisorName: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Emergency Contact
                    </label>
                    <input
                      placeholder="Parent/Guardian name & phone"
                      value={personForm.emergencyContact}
                      onChange={(e) =>
                        setPersonForm((p) => ({ ...p, emergencyContact: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Spiritual Gifts &amp; Ministry Interests
                    </label>
                    <input
                      placeholder="e.g., Music/Choir, Personal Evangelism, Literature, Hospitality"
                      value={personForm.spiritualGifts}
                      onChange={(e) =>
                        setPersonForm((p) => ({ ...p, spiritualGifts: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>

                  <div className="flex flex-col justify-center gap-2 pt-2">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-800">
                      <input
                        type="checkbox"
                        checked={personForm.baptismalInterest}
                        onChange={(e) =>
                          setPersonForm((p) => ({ ...p, baptismalInterest: e.target.checked }))
                        }
                      />
                      Baptismal / Bible Study Interest
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-slate-800">
                      <input
                        type="checkbox"
                        checked={personForm.mentorEligible}
                        onChange={(e) =>
                          setPersonForm((p) => ({ ...p, mentorEligible: e.target.checked }))
                        }
                      />
                      Approved Peer / Alumni / Faculty Mentor
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddPerson(false);
                  setEditingId(null);
                  setPersonForm(emptyPersonForm(isPcm, defaultCampus));
                }}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium"
              >
                {editingId ? 'Update Record' : 'Save to Directory'}
              </button>
            </div>
          </form>
        )}

        {/* Search & Filter Controls */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="search"
            placeholder={
              isPcm
                ? 'Search name, student ID, phone, or email...'
                : 'Search name, phone, or email...'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
          >
            <option value="">All Statuses</option>
            {allowedStatuses.map((val) => (
              <option key={val} value={val}>
                {STATUS_LABELS[val]}
              </option>
            ))}
          </select>

          {isPcm ? (
            <select
              value={academicStatusFilter}
              onChange={(e) => setAcademicStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            >
              <option value="">All Campus Stages</option>
              {Object.entries(ACADEMIC_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={householdFilter}
              onChange={(e) => setHouseholdFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            >
              <option value="">All Households</option>
              {households.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.household_name} ({h.member_count})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Directory List: Mobile Cards (< md) + Desktop Table (>= md) */}
        {loading ? (
          <p className="text-xs text-slate-500 mt-6">Loading directory...</p>
        ) : persons.length === 0 ? (
          <div className="text-center py-10 text-xs text-slate-500">
            No records found. Click <strong>+ Add {isPcm ? 'Student' : 'Person'}</strong> or{' '}
            <strong>Import CSV</strong> to populate your roll.
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="mt-5 space-y-3 md:hidden">
              {persons.map((p) => (
                <div key={p.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm text-slate-900">
                        {p.first_name} {p.last_name}
                      </div>
                      {p.student_id && (
                        <div className="text-[11px] text-slate-500">ID: {p.student_id}</div>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                        isPcm
                          ? ACADEMIC_STATUS_BADGE[p.academic_status]
                          : STATUS_BADGE[p.membership_status] || 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {isPcm
                        ? ACADEMIC_STATUS_LABELS[p.academic_status]
                        : STATUS_LABELS[p.membership_status] || p.membership_status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 space-y-0.5">
                    {p.phone && <div>Phone: {p.phone}</div>}
                    {p.email && <div>Email: {p.email}</div>}
                    {isPcm && p.program_of_study && (
                      <div>
                        Program: {p.program_of_study}
                        {p.graduation_year ? ` • Class of ${p.graduation_year}` : ''}
                      </div>
                    )}
                    {!isPcm && p.household_name && <div>Household: {p.household_name}</div>}
                  </div>
                  {isPcm && (
                    <div className="flex flex-wrap gap-1.5">
                      {p.baptismal_interest && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Baptism Interest
                        </span>
                      )}
                      {p.mentor_eligible && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                          Mentor Eligible
                        </span>
                      )}
                    </div>
                  )}
                  {isVerified && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        {isPcm ? 'Edit / Enrich Profile' : 'Edit Record'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="mt-5 hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2.5 pr-4">Name</th>
                    <th className="py-2.5 pr-4">{isPcm ? 'Campus Stage & Readiness' : 'Status'}</th>
                    <th className="py-2.5 pr-4">Contact</th>
                    <th className="py-2.5 pr-4">{isPcm ? 'Academic & Home Church' : 'Household / Class'}</th>
                    <th className="py-2.5 pr-4">Baptism</th>
                    <th className="py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {persons.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-4">
                        <div className="font-semibold text-slate-900">
                          {p.first_name} {p.last_name}
                        </div>
                        {p.student_id && <div className="text-slate-500">#{p.student_id}</div>}
                      </td>
                      <td className="py-3 pr-4 space-y-1">
                        {isPcm ? (
                          <>
                            <span
                              className={`inline-block font-medium px-2.5 py-0.5 rounded-full border ${
                                ACADEMIC_STATUS_BADGE[p.academic_status]
                              }`}
                            >
                              {ACADEMIC_STATUS_LABELS[p.academic_status]}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {p.baptismal_interest && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Baptism Interest
                                </span>
                              )}
                              {p.mentor_eligible && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                  Mentor
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <span
                            className={`inline-block font-medium px-2.5 py-0.5 rounded-full border ${
                              STATUS_BADGE[p.membership_status] || 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {STATUS_LABELS[p.membership_status] || p.membership_status}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        <div>{p.phone || '—'}</div>
                        <div className="text-slate-400">{p.email || ''}</div>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {isPcm ? (
                          <div>
                            <div className="font-medium text-slate-800">
                              {[p.program_of_study, p.graduation_year ? `Class of ${p.graduation_year}` : '']
                                .filter(Boolean)
                                .join(' • ') || '—'}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {[p.campus_faculty, p.home_church].filter(Boolean).join(' • ')}
                            </div>
                          </div>
                        ) : (
                          [p.household_name, p.sabbath_school_class].filter(Boolean).join(' • ') || '—'
                        )}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">
                        {p.baptism_date ? String(p.baptism_date).slice(0, 10) : '—'}
                      </td>
                      <td className="py-3 text-right">
                        {isVerified && (
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            className="text-blue-700 font-medium hover:underline"
                          >
                            {isPcm ? (p.pcm_profile_id ? 'Edit / Enrich' : 'Enrich') : 'Edit'}
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
  );
}
