"use client";
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

export default function PlatformAdminPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState([]);
  const [codes, setCodes] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [codeForm, setCodeForm] = useState({
    issuedToLabel: '',
    allowedOrgType: '',
    maxUses: 1,
    expiresInDays: 30,
  });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const meRes = await apiFetch('/api/auth/me');
    if (!meRes.ok || !meRes.data?.user?.is_platform_admin) {
      router.push('/login');
      return;
    }

    const query = statusFilter ? `?status=${statusFilter}` : '';
    const [tRes, cRes] = await Promise.all([
      apiFetch(`/api/admin/tenants${query}`),
      apiFetch('/api/admin/verification-codes'),
    ]);

    if (tRes.ok) setTenants(tRes.data.tenants || []);
    if (cRes.ok) setCodes(cRes.data.verificationCodes || []);
    setLoading(false);
  }, [statusFilter, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateStatus = async (tenantId, status) => {
    await apiFetch(`/api/admin/tenants/${tenantId}/verify`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadData();
  };

  const generateCode = async (e) => {
    e.preventDefault();
    await apiFetch('/api/admin/verification-codes', {
      method: 'POST',
      body: JSON.stringify({
        issuedToLabel: codeForm.issuedToLabel || null,
        allowedOrgType: codeForm.allowedOrgType || null,
        maxUses: Number(codeForm.maxUses) || 1,
        expiresInDays: Number(codeForm.expiresInDays) || 30,
      }),
    });
    setCodeForm({ issuedToLabel: '', allowedOrgType: '', maxUses: 1, expiresInDays: 30 });
    await loadData();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white px-4 sm:px-6 py-4 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold">AdventistHub Platform Governance</h1>
            <p className="text-xs text-slate-300">Tenant Verification & Fast-Track Invite Codes</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">Home</Link>
            <Link
              href="/admin-portal"
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium"
            >
              Organization Workspace
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-8">
        {/* Generate Invite Code */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
          <h2 className="text-base font-bold text-slate-900">Generate Fast-Track Verification Code</h2>
          <form onSubmit={generateCode} className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3">
            <input
              placeholder="Issued to (e.g., Central Zambia Conf.)"
              value={codeForm.issuedToLabel}
              onChange={(e) => setCodeForm((p) => ({ ...p, issuedToLabel: e.target.value }))}
              className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            />
            <select
              value={codeForm.allowedOrgType}
              onChange={(e) => setCodeForm((p) => ({ ...p, allowedOrgType: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
            >
              <option value="">Any Org Type</option>
              <option value="CHURCH">CHURCH only</option>
              <option value="PCM_CHAPTER">PCM_CHAPTER only</option>
            </select>
            <input
              type="number"
              min={1}
              value={codeForm.maxUses}
              onChange={(e) => setCodeForm((p) => ({ ...p, maxUses: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
              title="Max Uses"
            />
            <button
              type="submit"
              className="rounded-lg bg-blue-700 text-white text-xs font-medium px-4 py-2 hover:bg-blue-800"
            >
              Create Code
            </button>
          </form>

          {codes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {codes.map((c) => (
                <div
                  key={c.id}
                  className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50"
                >
                  <span className="font-mono font-bold text-blue-800">{c.code}</span>{' '}
                  <span className="text-slate-500">
                    ({c.uses_count}/{c.max_uses} used{c.issued_to_label ? ` • ${c.issued_to_label}` : ''})
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Tenant Verification Queue */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900">Registered Organizations</h2>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">PENDING</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>
          </div>

          {loading ? (
            <p className="text-xs text-slate-500">Loading organizations...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Organization</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Conference / Location</th>
                    <th className="py-2 pr-4">Credential</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tenants.map((t) => (
                    <tr key={t.id}>
                      <td className="py-3 pr-4">
                        <div className="font-semibold text-slate-900">{t.name}</div>
                        <div className="text-slate-500">{t.slug}.adventisthub.com</div>
                      </td>
                      <td className="py-3 pr-4">{t.organization_type}</td>
                      <td className="py-3 pr-4 text-slate-600">
                        {[t.region_or_conference, t.city_or_campus, t.country]
                          .filter(Boolean)
                          .join(' • ') || '—'}
                      </td>
                      <td className="py-3 pr-4">
                        {t.verification_doc_url ? (
                          <a
                            href={t.verification_doc_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-700 underline"
                          >
                            View Document
                          </a>
                        ) : (
                          <span className="text-slate-400">None submitted</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-semibold">{t.verification_status}</td>
                      <td className="py-3 space-x-2">
                        {t.verification_status !== 'VERIFIED' && (
                          <button
                            onClick={() => updateStatus(t.id, 'VERIFIED')}
                            className="px-2.5 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            Approve
                          </button>
                        )}
                        {t.verification_status !== 'SUSPENDED' && (
                          <button
                            onClick={() => updateStatus(t.id, 'SUSPENDED')}
                            className="px-2.5 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                          >
                            Suspend
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
