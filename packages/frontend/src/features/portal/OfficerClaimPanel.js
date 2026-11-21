"use client";
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

export default function OfficerClaimPanel({ activeTenant }) {
  const isVerified = activeTenant?.verification_status === 'VERIFIED';
  const [claims, setClaims] = useState([]);
  const [unclaimedPersons, setUnclaimedPersons] = useState([]);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [generatedInvite, setGeneratedInvite] = useState(null);
  const [feedback, setFeedback] = useState('');

  const loadData = useCallback(async () => {
    const [claimsRes, personsRes] = await Promise.all([
      apiFetch('/api/portal/claims'),
      apiFetch('/api/persons'),
    ]);
    if (claimsRes.ok) setClaims(claimsRes.data.claims || []);
    if (personsRes.ok) {
      const unclaimed = (personsRes.data.persons || []).filter((p) => !p.user_id);
      setUnclaimedPersons(unclaimed);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleIssueInvite = async (e) => {
    e.preventDefault();
    if (!selectedPersonId) return;
    setFeedback('');
    const res = await apiFetch('/api/portal/invites', {
      method: 'POST',
      body: JSON.stringify({ personId: selectedPersonId }),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setGeneratedInvite(res.data);
    setSelectedPersonId('');
    setFeedback('One-time profile claim invite code generated.');
  };

  const handleReviewClaim = async (claimId, status) => {
    setFeedback('');
    const res = await apiFetch(`/api/portal/claims/${claimId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setFeedback(res.error);
      return;
    }
    setFeedback(`Claim request ${status.toLowerCase()}.`);
    await loadData();
  };

  const pendingCount = claims.filter((c) => c.status === 'PENDING').length;

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Self-Service Portal Linking &amp; Claim Requests
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Generate single-use invite codes for congregants/students or approve pending self-service profile claims.
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold">
            {pendingCount} Pending Claim(s)
          </span>
        )}
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
          {feedback}
        </div>
      )}

      {/* Generate Invite Code Form */}
      {isVerified && (
        <form
          onSubmit={handleIssueInvite}
          className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end"
        >
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Select Unclaimed Member / Student Record
            </label>
            <select
              value={selectedPersonId}
              onChange={(e) => setSelectedPersonId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            >
              <option value="">-- Choose Unclaimed Person ({unclaimedPersons.length}) --</option>
              {unclaimedPersons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.last_name}, {p.first_name} ({p.email || p.phone || p.membership_status})
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={!selectedPersonId}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50"
          >
            Generate Claim Code
          </button>
        </form>
      )}

      {generatedInvite && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            Share this code with{' '}
            <strong>
              {generatedInvite.person.first_name} {generatedInvite.person.last_name}
            </strong>
            :
          </div>
          <code className="px-3 py-1 rounded bg-white border border-emerald-300 font-mono text-sm font-bold tracking-wider">
            {generatedInvite.invite.invite_code}
          </code>
        </div>
      )}

      {/* Pending & Historical Claims */}
      {claims.length === 0 ? (
        <p className="text-xs text-slate-500">No profile claim requests submitted yet.</p>
      ) : (
        <div className="space-y-2.5">
          {claims.map((c) => (
            <div
              key={c.id}
              className="border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div>
                <div className="font-semibold text-slate-900">
                  {c.user_full_name} ({c.user_email}) → Directory:{' '}
                  <span className="text-blue-800">
                    {c.person_first_name} {c.person_last_name}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Method: {c.verification_method} • Identifier: {c.submitted_identifier || '—'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {c.status === 'PENDING' && isVerified ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleReviewClaim(c.id, 'VERIFIED')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
                    >
                      Approve Link
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewClaim(c.id, 'REJECTED')}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700"
                    >
                      Reject
                    </button>
                  </>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[11px]">
                    {c.status}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
