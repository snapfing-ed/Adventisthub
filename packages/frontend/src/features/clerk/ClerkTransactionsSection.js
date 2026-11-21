"use client";
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

const TX_LABELS = {
  BAPTISM: 'Baptism',
  PROFESSION_OF_FAITH: 'Profession of Faith',
  TRANSFER_IN: 'Letter of Transfer (In)',
  TRANSFER_OUT: 'Letter of Transfer (Out)',
  DISCIPLINE_REMOVAL: 'Church Discipline / Removal',
  DEATH: 'Death',
  MISSING: 'Missing / Whereabouts Unknown',
  CAMPUS_GRADUATION: 'Campus Graduation / Alumni',
  CAMPUS_TRANSFER_OUT: 'Campus Transfer Out',
};

const TRANSFER_STAGE_LABELS = {
  REQUESTED: '1. Requested',
  FIRST_READING: '2. First Reading',
  BOARD_RECOMMENDED: '3. Board Voted',
  BUSINESS_VOTED: '4. Business Voted',
  COMPLETED: '5. Completed',
  CANCELLED: 'Cancelled',
};

const TRANSFER_STAGE_BADGE = {
  REQUESTED: 'bg-amber-50 text-amber-800 border-amber-200',
  FIRST_READING: 'bg-sky-50 text-sky-800 border-sky-200',
  BOARD_RECOMMENDED: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  BUSINESS_VOTED: 'bg-purple-50 text-purple-800 border-purple-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
};

const NEXT_STAGE = {
  REQUESTED: 'FIRST_READING',
  FIRST_READING: 'BOARD_RECOMMENDED',
  BOARD_RECOMMENDED: 'BUSINESS_VOTED',
  BUSINESS_VOTED: 'COMPLETED',
};

const TRANSFER_TYPES = ['TRANSFER_IN', 'TRANSFER_OUT', 'CAMPUS_TRANSFER_OUT'];

export default function ClerkTransactionsSection({ activeTenant, onNavigateTab }) {
  const isPcm = activeTenant?.organization_type === 'PCM_CHAPTER';
  const isVerified = activeTenant?.verification_status === 'VERIFIED';

  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState({
    total_transactions: 0,
    pending_transfers: 0,
    additions_count: 0,
    transfers_out_count: 0,
  });
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState('');
  const [transferFilter, setTransferFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [feedback, setFeedback] = useState('');

  const [form, setForm] = useState({
    personId: '',
    transactionType: 'BAPTISM',
    transferStatus: 'REQUESTED',
    firstReadingDate: '',
    boardVoteDate: '',
    businessMeetingDate: '',
    effectiveDate: new Date().toISOString().slice(0, 10),
    otherChurchOrChapter: '',
    officiatingMinister: '',
    minuteReference: '',
    remarks: '',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (typeFilter) params.set('type', typeFilter);
    if (transferFilter) params.set('transferStatus', transferFilter);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());

    const [txRes, pRes] = await Promise.all([
      apiFetch(`/api/membership-transactions?${params.toString()}`),
      apiFetch('/api/persons'),
    ]);

    if (txRes.ok) {
      setTransactions(txRes.data.transactions || []);
      if (txRes.data.stats) setStats(txRes.data.stats);
    }
    if (pRes.ok) {
      setPersons(pRes.data.persons || []);
    }
    setLoading(false);
  }, [typeFilter, transferFilter, searchQuery]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const availableTxTypes = isPcm
    ? [
        'BAPTISM',
        'PROFESSION_OF_FAITH',
        'TRANSFER_IN',
        'CAMPUS_GRADUATION',
        'CAMPUS_TRANSFER_OUT',
        'DEATH',
      ]
    : [
        'BAPTISM',
        'PROFESSION_OF_FAITH',
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'DISCIPLINE_REMOVAL',
        'MISSING',
        'DEATH',
      ];

  const isTransferType = TRANSFER_TYPES.includes(form.transactionType);

  const handleRecordSubmit = async (e) => {
    e.preventDefault();
    setFeedback('');

    const res = await apiFetch('/api/membership-transactions', {
      method: 'POST',
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      setFeedback(res.error);
      return;
    }

    setShowForm(false);
    setForm({
      personId: '',
      transactionType: 'BAPTISM',
      transferStatus: 'REQUESTED',
      firstReadingDate: '',
      boardVoteDate: '',
      businessMeetingDate: '',
      effectiveDate: new Date().toISOString().slice(0, 10),
      otherChurchOrChapter: '',
      officiatingMinister: '',
      minuteReference: '',
      remarks: '',
    });
    setFeedback(
      isTransferType && form.transferStatus !== 'COMPLETED'
        ? 'Transfer initiated and logged. Directory status will update automatically once marked Completed.'
        : 'Transaction recorded and Directory roll status updated.'
    );
    await loadAll();
  };

  const handleAdvanceTransfer = async (tx, targetStage) => {
    setFeedback('');
    const today = new Date().toISOString().slice(0, 10);
    const patchBody = { transferStatus: targetStage };
    if (targetStage === 'FIRST_READING' && !tx.first_reading_date) {
      patchBody.firstReadingDate = today;
    }
    if (targetStage === 'BOARD_RECOMMENDED' && !tx.board_vote_date) {
      patchBody.boardVoteDate = today;
    }
    if (targetStage === 'BUSINESS_VOTED' && !tx.business_meeting_date) {
      patchBody.businessMeetingDate = today;
    }
    if (targetStage === 'COMPLETED') {
      patchBody.effectiveDate = today;
    }

    const res = await apiFetch(`/api/membership-transactions/${tx.id}`, {
      method: 'PATCH',
      body: JSON.stringify(patchBody),
    });

    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setFeedback(
      targetStage === 'COMPLETED'
        ? 'Transfer completed and person membership status updated!'
        : `Transfer stage updated to ${TRANSFER_STAGE_LABELS[targetStage]}.`
    );
    await loadAll();
  };

  const handleSaveEditTx = async (e) => {
    e.preventDefault();
    if (!editingTx) return;
    setFeedback('');

    const res = await apiFetch(`/api/membership-transactions/${editingTx.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        transferStatus: editingTx.transfer_status,
        firstReadingDate: editingTx.first_reading_date
          ? String(editingTx.first_reading_date).slice(0, 10)
          : null,
        boardVoteDate: editingTx.board_vote_date
          ? String(editingTx.board_vote_date).slice(0, 10)
          : null,
        businessMeetingDate: editingTx.business_meeting_date
          ? String(editingTx.business_meeting_date).slice(0, 10)
          : null,
        effectiveDate: editingTx.effective_date
          ? String(editingTx.effective_date).slice(0, 10)
          : null,
        minuteReference: editingTx.minute_reference,
        remarks: editingTx.remarks,
      }),
    });

    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setEditingTx(null);
    setFeedback('Clerk record updated.');
    await loadAll();
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Clerk Entries</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {stats.total_transactions}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Open Transfers</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">
            {stats.pending_transfers}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Baptisms & Prof. Faith</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {stats.additions_count}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">
            {isPcm ? 'Graduations / Transfers' : 'Letters Granted Out'}
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {stats.transfers_out_count}
          </div>
        </div>
      </div>

      {/* Main Clerk Register Section */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isPcm
                ? 'Chapter Secretary & Campus Roll Audit Trail'
                : 'Church Clerk Duties & Membership Audit Trail'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isPcm
                ? 'Record student baptisms, campus transfers, and graduations with full audit history.'
                : 'Church Manual baptisms, professions of faith, two-reading letters of transfer, and roll adjustments.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            
            <button
              type="button"
              disabled={!isVerified}
              onClick={() => {
                setShowForm((v) => !v);
                setEditingTx(null);
              }}
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium disabled:opacity-50"
            >
              {showForm ? 'Close Form' : '+ Record Clerk Action'}
            </button>
          </div>
        </div>

        {feedback && (
          <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
            {feedback}
          </div>
        )}

        {/* Record New Clerk Transaction Form */}
        {showForm && (
          <form
            onSubmit={handleRecordSubmit}
            className="mt-5 p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800">
                New Official Membership Transaction
              </span>
              {persons.length === 0 && onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('directory')}
                  className="text-xs text-blue-700 underline"
                >
                  Add person in Directory first →
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">
                  {isPcm ? 'Select Student / Member *' : 'Select Person *'}
                </label>
                <select
                  required
                  value={form.personId}
                  onChange={(e) => setForm((p) => ({ ...p, personId: e.target.value }))}
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
                  Transaction Type *
                </label>
                <select
                  value={form.transactionType}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, transactionType: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                >
                  {availableTxTypes.map((t) => (
                    <option key={t} value={t}>
                      {TX_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>

              {isTransferType ? (
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Church Manual Transfer Stage
                  </label>
                  <select
                    value={form.transferStatus}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, transferStatus: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    {Object.entries(TRANSFER_STAGE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Effective / Ceremony Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.effectiveDate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, effectiveDate: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              )}

              {isTransferType && (
                <>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      {form.transactionType === 'TRANSFER_IN'
                        ? 'Sending Church / Chapter *'
                        : 'Receiving Church / Chapter *'}
                    </label>
                    <input
                      required
                      placeholder="e.g., Kabwe Central SDA Church"
                      value={form.otherChurchOrChapter}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, otherChurchOrChapter: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      First Reading Date
                    </label>
                    <input
                      type="date"
                      value={form.firstReadingDate}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, firstReadingDate: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Effective Date
                    </label>
                    <input
                      type="date"
                      value={form.effectiveDate}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, effectiveDate: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">
                  {isPcm ? 'Executive / Board Vote Date' : 'Church Board Vote Date'}
                </label>
                <input
                  type="date"
                  value={form.boardVoteDate}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, boardVoteDate: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">
                  {isPcm ? 'Chapter Business Meeting Date' : 'Business Meeting (2nd Reading) Date'}
                </label>
                <input
                  type="date"
                  value={form.businessMeetingDate}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, businessMeetingDate: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">
                  Officiating Pastor / Minister
                </label>
                <input
                  placeholder="e.g., Pr. M. Phiri"
                  value={form.officiatingMinister}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, officiatingMinister: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 mb-1">
                  Minute / Vote Reference
                </label>
                <input
                  placeholder="e.g., BM-2026-11-04"
                  value={form.minuteReference}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, minuteReference: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] text-slate-600 mb-1">
                  Clerk Remarks / Pastoral Notes
                </label>
                <input
                  placeholder="Optional context, baptismal class cohort, or transfer notes..."
                  value={form.remarks}
                  onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium"
              >
                Save Official Entry
              </button>
            </div>
          </form>
        )}

        {/* Inline Edit Transfer / Minute Details Drawer */}
        {editingTx && (
          <form
            onSubmit={handleSaveEditTx}
            className="mt-5 p-4 sm:p-5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-4"
          >
            <div className="text-xs font-bold text-slate-900">
              Update Clerk Record: {editingTx.first_name} {editingTx.last_name} (
              {TX_LABELS[editingTx.transaction_type]})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {editingTx.transfer_status && (
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Transfer Stage
                  </label>
                  <select
                    value={editingTx.transfer_status}
                    onChange={(e) =>
                      setEditingTx((p) => ({ ...p, transfer_status: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    {Object.entries(TRANSFER_STAGE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">
                  First Reading Date
                </label>
                <input
                  type="date"
                  value={
                    editingTx.first_reading_date
                      ? String(editingTx.first_reading_date).slice(0, 10)
                      : ''
                  }
                  onChange={(e) =>
                    setEditingTx((p) => ({ ...p, first_reading_date: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">
                  Board Vote Date
                </label>
                <input
                  type="date"
                  value={
                    editingTx.board_vote_date
                      ? String(editingTx.board_vote_date).slice(0, 10)
                      : ''
                  }
                  onChange={(e) =>
                    setEditingTx((p) => ({ ...p, board_vote_date: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">
                  Business Meeting Date
                </label>
                <input
                  type="date"
                  value={
                    editingTx.business_meeting_date
                      ? String(editingTx.business_meeting_date).slice(0, 10)
                      : ''
                  }
                  onChange={(e) =>
                    setEditingTx((p) => ({
                      ...p,
                      business_meeting_date: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">
                  Minute Reference
                </label>
                <input
                  value={editingTx.minute_reference || ''}
                  onChange={(e) =>
                    setEditingTx((p) => ({ ...p, minute_reference: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-[11px] text-slate-600 mb-1">Remarks</label>
                <input
                  value={editingTx.remarks || ''}
                  onChange={(e) =>
                    setEditingTx((p) => ({ ...p, remarks: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}

        {/* Filter Bar */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="search"
            placeholder="Search person, church/chapter, or minute ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
          >
            <option value="">All Transaction Types</option>
            {Object.entries(TX_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={transferFilter}
            onChange={(e) => setTransferFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
          >
            <option value="">All Transfer Stages</option>
            {Object.entries(TRANSFER_STAGE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Chronological Audit Register: Mobile Cards (< md) + Desktop Table (>= md) */}
        {loading ? (
          <p className="text-xs text-slate-500 mt-6">Loading audit register...</p>
        ) : transactions.length === 0 ? (
          <div className="text-center py-10 text-xs text-slate-500">
            No membership transactions recorded yet. Click{' '}
            <strong>+ Record Clerk Action</strong> to log a baptism, transfer, or status change.
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="mt-5 space-y-3 md:hidden">
              {transactions.map((tx) => {
                const nextStage = tx.transfer_status ? NEXT_STAGE[tx.transfer_status] : null;
                return (
                  <div
                    key={tx.id}
                    className="border border-slate-200 rounded-xl p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-sm text-slate-900">
                          {tx.first_name} {tx.last_name}
                        </div>
                        <div className="text-xs font-medium text-blue-800">
                          {TX_LABELS[tx.transaction_type] || tx.transaction_type}
                        </div>
                      </div>
                      {tx.transfer_status && (
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                            TRANSFER_STAGE_BADGE[tx.transfer_status] ||
                            'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {TRANSFER_STAGE_LABELS[tx.transfer_status]}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-600 space-y-0.5">
                      <div>
                        Roll Change: <span className="font-medium">{tx.previous_status || '—'}</span> →{' '}
                        <span className="font-medium">{tx.new_status}</span>
                      </div>
                      <div>Effective: {String(tx.effective_date).slice(0, 10)}</div>
                      {tx.other_church_or_chapter && (
                        <div>Church/Chapter: {tx.other_church_or_chapter}</div>
                      )}
                      {tx.minute_reference && <div>Minute Ref: {tx.minute_reference}</div>}
                    </div>

                    {isVerified && (
                      <div className="pt-2 flex flex-wrap gap-2">
                        {nextStage && (
                          <button
                            type="button"
                            onClick={() => handleAdvanceTransfer(tx, nextStage)}
                            className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-medium"
                          >
                            Advance → {TRANSFER_STAGE_LABELS[nextStage]}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingTx(tx)}
                          className="px-2.5 py-1 rounded border border-slate-300 text-xs text-slate-700"
                        >
                          Edit Dates / Notes
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="mt-5 hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2.5 pr-4">Date</th>
                    <th className="py-2.5 pr-4">Member / Student</th>
                    <th className="py-2.5 pr-4">Action & Status</th>
                    <th className="py-2.5 pr-4">Church / Minister / Ref</th>
                    <th className="py-2.5 pr-4">Votes & Stage</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((tx) => {
                    const nextStage = tx.transfer_status
                      ? NEXT_STAGE[tx.transfer_status]
                      : null;
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/70 align-top">
                        <td className="py-3 pr-4 whitespace-nowrap text-slate-700 font-medium">
                          {String(tx.effective_date).slice(0, 10)}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-slate-900">
                            {tx.first_name} {tx.last_name}
                          </div>
                          <div className="text-slate-500">
                            {tx.previous_status || '—'} → {tx.new_status}
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-blue-900">
                            {TX_LABELS[tx.transaction_type] || tx.transaction_type}
                          </div>
                          {tx.recorded_by_name && (
                            <div className="text-slate-400">By {tx.recorded_by_name}</div>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {tx.other_church_or_chapter && (
                            <div>{tx.other_church_or_chapter}</div>
                          )}
                          {tx.officiating_minister && (
                            <div>Min: {tx.officiating_minister}</div>
                          )}
                          {tx.minute_reference && (
                            <div className="font-mono text-[11px] text-slate-500">
                              Ref: {tx.minute_reference}
                            </div>
                          )}
                          {!tx.other_church_or_chapter &&
                            !tx.officiating_minister &&
                            !tx.minute_reference &&
                            '—'}
                        </td>
                        <td className="py-3 pr-4 space-y-1">
                          {tx.transfer_status && (
                            <span
                              className={`inline-block font-medium px-2.5 py-0.5 rounded-full border ${
                                TRANSFER_STAGE_BADGE[tx.transfer_status] ||
                                'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {TRANSFER_STAGE_LABELS[tx.transfer_status]}
                            </span>
                          )}
                          <div className="text-[11px] text-slate-500 space-y-0.5">
                            {tx.first_reading_date && (
                              <div>1st Read: {String(tx.first_reading_date).slice(0, 10)}</div>
                            )}
                            {tx.board_vote_date && (
                              <div>Board: {String(tx.board_vote_date).slice(0, 10)}</div>
                            )}
                            {tx.business_meeting_date && (
                              <div>
                                Business: {String(tx.business_meeting_date).slice(0, 10)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-right space-y-1.5">
                          {isVerified && nextStage && (
                            <div>
                              <button
                                type="button"
                                onClick={() => handleAdvanceTransfer(tx, nextStage)}
                                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium whitespace-nowrap"
                              >
                                → {TRANSFER_STAGE_LABELS[nextStage]}
                              </button>
                            </div>
                          )}
                          {isVerified && (
                            <div>
                              <button
                                type="button"
                                onClick={() => setEditingTx(tx)}
                                className="text-blue-700 font-medium hover:underline"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
