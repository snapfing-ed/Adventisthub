"use client";
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

const FUND_CATEGORY_LABELS = {
  TITHE: 'Tithe (10% Conference Trust)',
  CONFERENCE_OFFERING: 'Conference / World Mission Offering',
  LOCAL_BUDGET: 'Local Church / Chapter Budget',
  PROJECT_PLEDGE: 'Building / Special Project Pledge',
  CAMP_MEETING: 'Camp Meeting / Evangelism',
  PCM_CHAPTER_FUND: 'PCM Chapter Operations Fund',
};

const STATUS_BADGE = {
  POSTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  DRAFT: 'bg-amber-50 text-amber-800 border-amber-200',
  VOIDED: 'bg-red-50 text-red-700 border-red-200',
};

const REMIT_BADGE = {
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
  SUBMITTED: 'bg-blue-50 text-blue-800 border-blue-200',
  RECONCILED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function fmtMoney(val, currency = 'ZMW') {
  const num = Number(val || 0);
  return `${currency} ${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function TreasurySection({ activeTenant, activeRole }) {
  const isPcm = activeTenant?.organization_type === 'PCM_CHAPTER';
  const isVerified = activeTenant?.verification_status === 'VERIFIED';
  const canWrite =
    isVerified &&
    (['ADMIN', 'TREASURER'].includes(activeRole) ||
      (isPcm && activeRole === 'PCM_LEADER') ||
      !activeRole);

  const [subView, setSubView] = useState('receipts'); // 'receipts' | 'funds' | 'remittances'
  const [summary, setSummary] = useState(null);
  const [funds, setFunds] = useState([]);
  const [persons, setPersons] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [remittances, setRemittances] = useState([]);

  const [searchQ, setSearchQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  // Receipt creation drawer/form
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receiptForm, setReceiptForm] = useState({
    contributionDate: new Date().toISOString().slice(0, 10),
    personId: '',
    contributorLabel: '',
    paymentMethod: 'CASH',
    referenceCode: '',
    currency: 'ZMW',
    status: 'POSTED',
    notes: '',
    lineItems: [{ fundId: '', amount: '', memo: '' }],
  });

  // Fund creation form
  const [showFundForm, setShowFundForm] = useState(false);
  const [fundForm, setFundForm] = useState({
    code: '',
    name: '',
    category: isPcm ? 'PCM_CHAPTER_FUND' : 'LOCAL_BUDGET',
    isTrustFund: false,
    targetAmount: '',
    description: '',
  });

  // Remittance period calculator & payment modal state
  const [calcPeriod, setCalcPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [editingRemitId, setEditingRemitId] = useState('');
  const [remitPayForm, setRemitPayForm] = useState({
    remittedAmount: '',
    remittanceDate: new Date().toISOString().slice(0, 10),
    referenceNumber: '',
    status: 'SUBMITTED',
    notes: '',
  });

  const loadTreasuryData = useCallback(async () => {
    setLoading(true);
    const cParams = new URLSearchParams();
    if (statusFilter) cParams.set('status', statusFilter);
    if (searchQ.trim()) cParams.set('q', searchQ.trim());

    const [sumRes, fundRes, pRes, cRes, remRes] = await Promise.all([
      apiFetch('/api/treasury/summary'),
      apiFetch('/api/funds'),
      apiFetch('/api/persons'),
      apiFetch(`/api/contributions?${cParams.toString()}`),
      apiFetch('/api/remittances'),
    ]);

    if (sumRes.ok) setSummary(sumRes.data);
    if (fundRes.ok) {
      const fList = fundRes.data.funds || [];
      setFunds(fList);
      if (fList.length > 0) {
        setReceiptForm((prev) => ({
          ...prev,
          lineItems: prev.lineItems.map((li, idx) =>
            idx === 0 && !li.fundId ? { ...li, fundId: fList[0].id } : li
          ),
        }));
      }
    }
    if (pRes.ok) setPersons(pRes.data.persons || []);
    if (cRes.ok) setContributions(cRes.data.contributions || []);
    if (remRes.ok) setRemittances(remRes.data.remittances || []);
    setLoading(false);
  }, [statusFilter, searchQ]);

  useEffect(() => {
    loadTreasuryData();
  }, [loadTreasuryData]);

  const handleSeedFunds = async () => {
    setFeedback('');
    const res = await apiFetch('/api/funds/seed-defaults', { method: 'POST' });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setFeedback(`Initialized ${res.data.count} standard SDA stewardship fund(s).`);
    await loadTreasuryData();
  };

  const handleCreateFund = async (e) => {
    e.preventDefault();
    setFeedback('');
    const res = await apiFetch('/api/funds', {
      method: 'POST',
      body: JSON.stringify(fundForm),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setShowFundForm(false);
    setFundForm({
      code: '',
      name: '',
      category: isPcm ? 'PCM_CHAPTER_FUND' : 'LOCAL_BUDGET',
      isTrustFund: false,
      targetAmount: '',
      description: '',
    });
    setFeedback('Stewardship fund created.');
    await loadTreasuryData();
  };

  const addLineItem = () => {
    const activeFunds = funds.filter((f) => f.is_active);
    setReceiptForm((prev) => ({
      ...prev,
      lineItems: [
        ...prev.lineItems,
        { fundId: activeFunds[0]?.id || '', amount: '', memo: '' },
      ],
    }));
  };

  const removeLineItem = (idx) => {
    setReceiptForm((prev) => ({
      ...prev,
      lineItems: prev.lineItems.filter((_, i) => i !== idx),
    }));
  };

  const updateLineItem = (idx, field, value) => {
    setReceiptForm((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item
      ),
    }));
  };

  const receiptTotal = receiptForm.lineItems.reduce(
    (sum, li) => sum + (Number(li.amount) || 0),
    0
  );

  const handleCreateReceipt = async (e) => {
    e.preventDefault();
    setFeedback('');
    const res = await apiFetch('/api/contributions', {
      method: 'POST',
      body: JSON.stringify(receiptForm),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setShowReceiptForm(false);
    setReceiptForm((prev) => ({
      ...prev,
      personId: '',
      contributorLabel: '',
      referenceCode: '',
      notes: '',
      lineItems: [{ fundId: funds[0]?.id || '', amount: '', memo: '' }],
    }));
    setFeedback(`Receipt ${res.data.contribution.receipt_number} recorded.`);
    await loadTreasuryData();
  };

  const handlePostDraft = async (id) => {
    setFeedback('');
    const res = await apiFetch(`/api/contributions/${id}/post`, { method: 'PATCH' });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setFeedback('Draft receipt posted to official ledger.');
    await loadTreasuryData();
  };

  const handleVoidReceipt = async (id, receiptNumber) => {
    const reason = window.prompt(
      `Enter mandatory audit reason for voiding receipt ${receiptNumber}:`
    );
    if (!reason) return;
    setFeedback('');
    const res = await apiFetch(`/api/contributions/${id}/void`, {
      method: 'PATCH',
      body: JSON.stringify({ voidReason: reason }),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setFeedback(`Receipt ${receiptNumber} voided and logged.`);
    await loadTreasuryData();
  };

  const handleExportCsv = async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    const headers = {};
    if (typeof window !== 'undefined') {
      const tid = localStorage.getItem('ah_active_tenant_id');
      if (tid) headers['x-tenant-id'] = tid;
    }
    const resp = await fetch(`${baseUrl}/api/contributions/export?${params.toString()}`, {
      credentials: 'include',
      headers,
    });
    if (!resp.ok) {
      setFeedback('Failed to export CSV ledger.');
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adventisthub-treasury-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCalculateRemittance = async (e) => {
    e.preventDefault();
    setFeedback('');
    const res = await apiFetch('/api/remittances/calculate', {
      method: 'POST',
      body: JSON.stringify({ reportingPeriod: calcPeriod }),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setFeedback(`Calculated Conference/Field remittance for ${calcPeriod}.`);
    await loadTreasuryData();
  };

  const handleSaveRemittancePayment = async (e) => {
    e.preventDefault();
    if (!editingRemitId) return;
    setFeedback('');
    const res = await apiFetch(`/api/remittances/${editingRemitId}`, {
      method: 'PATCH',
      body: JSON.stringify(remitPayForm),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setEditingRemitId('');
    setFeedback('Remittance payment/reconciliation updated.');
    await loadTreasuryData();
  };

  const totals = summary?.totals || {};
  const activeFunds = funds.filter((f) => f.is_active);

  return (
    <div className="space-y-6">
      {/* KPI Strip: Trust Funds vs Local Church/Chapter Funds */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Posted Receipts</div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            {fmtMoney(totals.total_posted)}
          </div>
        </div>
        <div className="bg-white border border-blue-200 rounded-xl p-4">
          <div className="text-xs text-blue-700 font-medium">
            Conference Trust Funds (Tithe + Offerings)
          </div>
          <div className="text-xl sm:text-2xl font-bold text-blue-800 mt-1">
            {fmtMoney(totals.total_trust_funds)}
          </div>
        </div>
        <div className="bg-white border border-emerald-200 rounded-xl p-4">
          <div className="text-xs text-emerald-700 font-medium">
            {isPcm ? 'Local Chapter Budget Funds' : 'Local Church Budget & Projects'}
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-700 mt-1">
            {fmtMoney(totals.total_local_funds)}
          </div>
        </div>
        <div className="bg-white border border-amber-200 rounded-xl p-4">
          <div className="text-xs text-amber-800 font-medium">Unremitted Trust Balance</div>
          <div className="text-xl sm:text-2xl font-bold text-amber-800 mt-1">
            {fmtMoney(summary?.remittances?.pending_remittance_balance)}
          </div>
        </div>
      </div>

      {/* Sub-navigation & CSV Export */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSubView('receipts')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              subView === 'receipts'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Tithe &amp; Offering Receipts
          </button>
          <button
            type="button"
            onClick={() => setSubView('funds')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              subView === 'funds'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Stewardship Funds ({funds.length})
          </button>
          <button
            type="button"
            onClick={() => setSubView('remittances')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              subView === 'remittances'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Conference Remittances ({remittances.length})
          </button>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Export CSV Ledger
        </button>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
          {feedback}
        </div>
      )}

      {/* ── VIEW 1: ITEMIZED RECEIPTS & CONTRIBUTIONS ─────────────────────── */}
      {subView === 'receipts' && (
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isPcm
                  ? 'Chapter Tithe & Offering Receipts'
                  : 'Itemized Tithe & Offering Receipts'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Record named {isPcm ? 'student' : 'member'} envelopes or loose Sabbath offerings split across Trust and Local funds.
              </p>
            </div>

            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  if (activeFunds.length === 0) {
                    setSubView('funds');
                    setFeedback('Create or seed Stewardship Funds first before recording receipts.');
                  } else {
                    setShowReceiptForm((v) => !v);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium"
              >
                {showReceiptForm ? 'Close Receipt Form' : '+ Record Receipt'}
              </button>
            )}
          </div>

          {showReceiptForm && (
            <form
              onSubmit={handleCreateReceipt}
              className="mt-5 p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4"
            >
              <div className="text-xs font-bold text-slate-800">
                New Itemized Stewardship Receipt
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    {isPcm ? 'Student / Donor (Optional)' : 'Member / Donor (Optional)'}
                  </label>
                  <select
                    value={receiptForm.personId}
                    onChange={(e) =>
                      setReceiptForm((p) => ({ ...p, personId: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    <option value="">-- Loose / Anonymous Offering --</option>
                    {persons.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.last_name}, {p.first_name}
                      </option>
                    ))}
                  </select>
                </div>

                {!receiptForm.personId && (
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">
                      Offering / Visitor Label
                    </label>
                    <input
                      placeholder="e.g., Sabbath School Loose Offering"
                      value={receiptForm.contributorLabel}
                      onChange={(e) =>
                        setReceiptForm((p) => ({ ...p, contributorLabel: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Date *</label>
                  <input
                    type="date"
                    required
                    value={receiptForm.contributionDate}
                    onChange={(e) =>
                      setReceiptForm((p) => ({ ...p, contributionDate: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={receiptForm.paymentMethod}
                    onChange={(e) =>
                      setReceiptForm((p) => ({ ...p, paymentMethod: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    <option value="CASH">Cash Envelope</option>
                    <option value="MOBILE_MONEY">Mobile Money</option>
                    <option value="BANK_TRANSFER">Bank Transfer / EFT</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Entry Status</label>
                  <select
                    value={receiptForm.status}
                    onChange={(e) =>
                      setReceiptForm((p) => ({ ...p, status: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  >
                    <option value="POSTED">Post Immediately</option>
                    <option value="DRAFT">Save as Draft (Count Verification)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Transaction Ref #
                  </label>
                  <input
                    placeholder="Optional bank/MoMo ref"
                    value={receiptForm.referenceCode}
                    onChange={(e) =>
                      setReceiptForm((p) => ({ ...p, referenceCode: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              </div>

              {/* Dynamic Line Items */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Envelope Breakdown (Fund Splits)
                  </span>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="text-xs font-semibold text-blue-700 hover:underline"
                  >
                    + Add Fund Line
                  </button>
                </div>

                {receiptForm.lineItems.map((li, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <select
                      required
                      value={li.fundId}
                      onChange={(e) => updateLineItem(idx, 'fundId', e.target.value)}
                      className="sm:col-span-5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    >
                      <option value="">-- Select Stewardship Fund --</option>
                      {activeFunds.map((f) => (
                        <option key={f.id} value={f.id}>
                          [{f.code}] {f.name} ({f.is_trust_fund ? 'Trust' : 'Local'})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="Amount"
                      value={li.amount}
                      onChange={(e) => updateLineItem(idx, 'amount', e.target.value)}
                      className="sm:col-span-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                    <input
                      placeholder="Line memo (optional)"
                      value={li.memo}
                      onChange={(e) => updateLineItem(idx, 'memo', e.target.value)}
                      className="sm:col-span-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                    <div className="sm:col-span-1 text-right">
                      {receiptForm.lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLineItem(idx)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="text-sm font-bold text-slate-900">
                  Receipt Total: {fmtMoney(receiptTotal, receiptForm.currency)}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReceiptForm(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-xs text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-blue-700 text-white text-xs font-medium"
                  >
                    Save Receipt
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Filter Bar */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="search"
              placeholder="Search receipt #, member/student name, or offering label..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            >
              <option value="">All Receipt Statuses</option>
              <option value="POSTED">Posted</option>
              <option value="DRAFT">Draft</option>
              <option value="VOIDED">Voided</option>
            </select>
          </div>

          {loading ? (
            <p className="text-xs text-slate-500 mt-6">Loading treasury ledger...</p>
          ) : contributions.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500">
              No receipts found. Click <strong>+ Record Receipt</strong> to enter tithe and offerings.
            </div>
          ) : (
            <>
              {/* Mobile Card View (< md) */}
              <div className="mt-5 space-y-3 md:hidden">
                {contributions.map((c) => {
                  const donor = c.person_first_name
                    ? `${c.person_first_name} ${c.person_last_name}`
                    : c.contributor_label || 'Loose / Anonymous Offering';
                  return (
                    <div key={c.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[11px] font-mono font-semibold text-slate-500">
                            {c.receipt_number} • {String(c.contribution_date).slice(0, 10)}
                          </span>
                          <div className="font-bold text-sm text-slate-900">{donor}</div>
                        </div>
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                            STATUS_BADGE[c.status]
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        {fmtMoney(c.total_amount, c.currency)}{' '}
                        <span className="text-xs font-normal text-slate-500">
                          ({c.payment_method})
                        </span>
                      </div>
                      <div className="space-y-1 pt-1 border-t border-slate-100">
                        {(c.line_items || []).map((li) => (
                          <div
                            key={li.id}
                            className="flex justify-between text-[11px] text-slate-600"
                          >
                            <span>
                              {li.fund_name}{' '}
                              <span
                                className={
                                  li.is_trust_fund ? 'text-blue-700 font-medium' : 'text-emerald-700'
                                }
                              >
                                ({li.is_trust_fund ? 'Trust' : 'Local'})
                              </span>
                            </span>
                            <span className="font-medium">
                              {fmtMoney(li.amount, c.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                      {c.void_reason && (
                        <div className="text-[11px] text-red-700 bg-red-50 px-2 py-1 rounded">
                          Void reason: {c.void_reason}
                        </div>
                      )}
                      {canWrite && c.status !== 'VOIDED' && (
                        <div className="pt-1 flex gap-2">
                          {c.status === 'DRAFT' && (
                            <button
                              type="button"
                              onClick={() => handlePostDraft(c.id)}
                              className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-medium"
                            >
                              Post Receipt
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleVoidReceipt(c.id, c.receipt_number)}
                            className="px-2.5 py-1 rounded border border-red-200 text-red-700 text-xs"
                          >
                            Void
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View (>= md) */}
              <div className="mt-5 hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2.5 pr-4">Receipt # / Date</th>
                      <th className="py-2.5 pr-4">Contributor</th>
                      <th className="py-2.5 pr-4">Fund Breakdown</th>
                      <th className="py-2.5 pr-4">Total</th>
                      <th className="py-2.5 pr-4">Status</th>
                      <th className="py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contributions.map((c) => {
                      const donor = c.person_first_name
                        ? `${c.person_first_name} ${c.person_last_name}`
                        : c.contributor_label || 'Loose / Anonymous Offering';
                      return (
                        <tr key={c.id} className="hover:bg-slate-50/70 align-top">
                          <td className="py-3 pr-4 whitespace-nowrap">
                            <div className="font-mono font-semibold text-slate-900">
                              {c.receipt_number}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {String(c.contribution_date).slice(0, 10)} • {c.payment_method}
                            </div>
                          </td>
                          <td className="py-3 pr-4 font-medium text-slate-900">{donor}</td>
                          <td className="py-3 pr-4 space-y-1">
                            {(c.line_items || []).map((li) => (
                              <div key={li.id} className="flex items-center gap-2 text-[11px]">
                                <span
                                  className={`px-1.5 py-0.5 rounded font-medium ${
                                    li.is_trust_fund
                                      ? 'bg-blue-50 text-blue-800'
                                      : 'bg-emerald-50 text-emerald-700'
                                  }`}
                                >
                                  {li.is_trust_fund ? 'Trust' : 'Local'}
                                </span>
                                <span className="text-slate-700">{li.fund_name}:</span>
                                <span className="font-semibold text-slate-900">
                                  {fmtMoney(li.amount, c.currency)}
                                </span>
                              </div>
                            ))}
                            {c.void_reason && (
                              <div className="text-[11px] text-red-700">
                                Voided: {c.void_reason}
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-4 font-bold text-slate-900 whitespace-nowrap">
                            {fmtMoney(c.total_amount, c.currency)}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`inline-block font-medium px-2.5 py-0.5 rounded-full border ${
                                STATUS_BADGE[c.status]
                              }`}
                            >
                              {c.status}
                            </span>
                          </td>
                          <td className="py-3 text-right space-x-2 whitespace-nowrap">
                            {canWrite && c.status === 'DRAFT' && (
                              <button
                                type="button"
                                onClick={() => handlePostDraft(c.id)}
                                className="px-2.5 py-1 rounded bg-emerald-600 text-white font-medium"
                              >
                                Post
                              </button>
                            )}
                            {canWrite && c.status !== 'VOIDED' && (
                              <button
                                type="button"
                                onClick={() => handleVoidReceipt(c.id, c.receipt_number)}
                                className="text-red-600 hover:underline font-medium"
                              >
                                Void
                              </button>
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
      )}

      {/* ── VIEW 2: STEWARDSHIP FUNDS & CHART OF ACCOUNTS ─────────────────── */}
      {subView === 'funds' && (
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Stewardship Funds &amp; Trust Classification
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Conference Trust Funds (Tithe &amp; Conference Offerings) are strictly separated from Local Church / Chapter Budget accounts.
              </p>
            </div>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                {funds.length === 0 && (
                  <button
                    type="button"
                    onClick={handleSeedFunds}
                    className="px-3.5 py-2 rounded-lg border border-blue-300 bg-blue-50 text-blue-800 text-xs font-semibold hover:bg-blue-100"
                  >
                    Load Standard SDA Funds
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowFundForm((v) => !v)}
                  className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium"
                >
                  {showFundForm ? 'Close Form' : '+ Add Fund'}
                </button>
              </div>
            )}
          </div>

          {showFundForm && (
            <form
              onSubmit={handleCreateFund}
              className="mt-5 p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  required
                  placeholder="Fund Code (e.g., BLD-2026)"
                  value={fundForm.code}
                  onChange={(e) => setFundForm((p) => ({ ...p, code: e.target.value }))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
                <input
                  required
                  placeholder="Fund Name (e.g., Sanctuary Roof Project)"
                  value={fundForm.name}
                  onChange={(e) => setFundForm((p) => ({ ...p, name: e.target.value }))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
                <select
                  value={fundForm.category}
                  onChange={(e) => {
                    const cat = e.target.value;
                    const trust = ['TITHE', 'CONFERENCE_OFFERING', 'CAMP_MEETING'].includes(cat);
                    setFundForm((p) => ({ ...p, category: cat, isTrustFund: trust }));
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                >
                  {Object.entries(FUND_CATEGORY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Target / Budget Amount (Optional)"
                  value={fundForm.targetAmount}
                  onChange={(e) =>
                    setFundForm((p) => ({ ...p, targetAmount: e.target.value }))
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={fundForm.isTrustFund}
                    onChange={(e) =>
                      setFundForm((p) => ({ ...p, isTrustFund: e.target.checked }))
                    }
                  />
                  Remit to Conference / Field Treasury (Trust Fund)
                </label>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-700 text-white text-xs font-medium"
                >
                  Save Fund
                </button>
              </div>
            </form>
          )}

          {funds.length === 0 ? (
            <p className="text-xs text-slate-500 py-10 text-center">
              No funds configured yet. Click <strong>Load Standard SDA Funds</strong> to populate Tithe, Combined Offerings, and Local Budget.
            </p>
          ) : (
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {funds.map((f) => (
                <div
                  key={f.id}
                  className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-slate-600">{f.code}</span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                          f.is_trust_fund
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {f.is_trust_fund ? 'Conference Trust' : 'Local Budget'}
                      </span>
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 mt-1">{f.name}</h3>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {FUND_CATEGORY_LABELS[f.category]}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex items-baseline justify-between">
                    <span className="text-xs text-slate-500">Collected</span>
                    <span className="text-sm font-bold text-slate-900">
                      {fmtMoney(f.collected_amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── VIEW 3: CONFERENCE / FIELD REMITTANCES ────────────────────────── */}
      {subView === 'remittances' && (
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Monthly Conference / Field Trust Remittances
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Aggregate posted Tithe and Conference Offerings by reporting month and track bank remittance reconciliation.
              </p>
            </div>

            {canWrite && (
              <form onSubmit={handleCalculateRemittance} className="flex items-center gap-2">
                <input
                  type="month"
                  required
                  value={calcPeriod}
                  onChange={(e) => setCalcPeriod(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium"
                >
                  Calculate Period
                </button>
              </form>
            )}
          </div>

          {editingRemitId && (
            <form
              onSubmit={handleSaveRemittancePayment}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
            >
              <div className="text-xs font-bold text-slate-900">
                Record Conference Remittance Transfer / Reconciliation
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Remitted Amount"
                  value={remitPayForm.remittedAmount}
                  onChange={(e) =>
                    setRemitPayForm((p) => ({ ...p, remittedAmount: e.target.value }))
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
                <input
                  type="date"
                  required
                  value={remitPayForm.remittanceDate}
                  onChange={(e) =>
                    setRemitPayForm((p) => ({ ...p, remittanceDate: e.target.value }))
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
                <input
                  required
                  placeholder="Bank / Conference Receipt Ref #"
                  value={remitPayForm.referenceNumber}
                  onChange={(e) =>
                    setRemitPayForm((p) => ({ ...p, referenceNumber: e.target.value }))
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
                <select
                  value={remitPayForm.status}
                  onChange={(e) =>
                    setRemitPayForm((p) => ({ ...p, status: e.target.value }))
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                >
                  <option value="SUBMITTED">Submitted to Conference</option>
                  <option value="RECONCILED">Reconciled with Field Receipt</option>
                  <option value="PENDING">Pending</option>
                </select>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 rounded-lg bg-blue-700 text-white text-xs font-medium px-3 py-2"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingRemitId('')}
                    className="rounded-lg border border-slate-300 text-xs text-slate-700 px-3 py-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}

          {remittances.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">
              No monthly remittances calculated yet. Pick a month above and click{' '}
              <strong>Calculate Period</strong>.
            </p>
          ) : (
            <>
              {/* Mobile Cards (< md) */}
              <div className="space-y-3 md:hidden">
                {remittances.map((r) => (
                  <div key={r.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-900">
                        Period {r.reporting_period}
                      </span>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                          REMIT_BADGE[r.status]
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 space-y-0.5">
                      <div>Tithe (10%): {fmtMoney(r.tithe_amount)}</div>
                      <div>Conference Offerings: {fmtMoney(r.conference_offering_amount)}</div>
                      <div className="font-bold text-slate-900">
                        Total Trust Due: {fmtMoney(r.total_trust_due)}
                      </div>
                      <div>
                        Remitted: {fmtMoney(r.remitted_amount)}{' '}
                        {r.reference_number ? `(Ref: ${r.reference_number})` : ''}
                      </div>
                    </div>
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRemitId(r.id);
                          setRemitPayForm({
                            remittedAmount: r.total_trust_due,
                            remittanceDate: new Date().toISOString().slice(0, 10),
                            referenceNumber: r.reference_number || '',
                            status: 'SUBMITTED',
                            notes: r.notes || '',
                          });
                        }}
                        className="px-3 py-1 rounded border border-slate-300 text-xs font-medium text-slate-700"
                      >
                        Record Remittance
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop Table (>= md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2.5 pr-4">Period</th>
                      <th className="py-2.5 pr-4">Tithe (10%)</th>
                      <th className="py-2.5 pr-4">Conf. Offerings</th>
                      <th className="py-2.5 pr-4">Total Trust Due</th>
                      <th className="py-2.5 pr-4">Remitted</th>
                      <th className="py-2.5 pr-4">Status</th>
                      <th className="py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {remittances.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/70">
                        <td className="py-3 pr-4 font-bold text-slate-900">
                          {r.reporting_period}
                        </td>
                        <td className="py-3 pr-4 text-slate-700">{fmtMoney(r.tithe_amount)}</td>
                        <td className="py-3 pr-4 text-slate-700">
                          {fmtMoney(r.conference_offering_amount)}
                        </td>
                        <td className="py-3 pr-4 font-bold text-blue-800">
                          {fmtMoney(r.total_trust_due)}
                        </td>
                        <td className="py-3 pr-4 text-slate-900">
                          {fmtMoney(r.remitted_amount)}
                          {r.reference_number && (
                            <span className="block text-[11px] text-slate-400">
                              Ref: {r.reference_number}
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`inline-block font-medium px-2.5 py-0.5 rounded-full border ${
                              REMIT_BADGE[r.status]
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRemitId(r.id);
                                setRemitPayForm({
                                  remittedAmount: r.total_trust_due,
                                  remittanceDate: new Date().toISOString().slice(0, 10),
                                  referenceNumber: r.reference_number || '',
                                  status: 'SUBMITTED',
                                  notes: r.notes || '',
                                });
                              }}
                              className="px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium"
                            >
                              Record Payment
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
    </div>
  );
}
