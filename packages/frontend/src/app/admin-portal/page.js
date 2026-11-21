"use client";
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import DirectorySection from '@/features/directory/DirectorySection';
import OfficerClaimPanel from '@/features/portal/OfficerClaimPanel';
import ClerkTransactionsSection from '@/features/clerk/ClerkTransactionsSection';
import GovernanceSection from '@/features/governance/GovernanceSection';
import PcmMentorshipSection from '@/features/pcm/PcmMentorshipSection';
import TreasurySection from '@/features/treasury/TreasurySection';
import ErrorBoundary from '@/app/ui/ErrorBoundary';
import { apiFetch } from '@/lib/api';

const VALID_TABS = ['directory', 'clerk', 'governance', 'pcm', 'treasury', 'officers'];

function AdminPortalContent() {
  const router = useRouter();
  const { user, memberships, activeTenant, activeRole, loading, refreshSession, switchTenant, logout } =
    useAuth();

  const [activeTab, setActiveTab] = useState('directory');
  const [docUrl, setDocUrl] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [docMsg, setDocMsg] = useState('');

  const [officers, setOfficers] = useState([]);
  const [officerForm, setOfficerForm] = useState({
    fullName: '',
    email: '',
    temporaryPassword: '',
    role: 'CLERK',
  });
  const [officerMsg, setOfficerMsg] = useState('');

  useEffect(() => {
    const syncFromUrl = () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const t = params.get('tab');
      setActiveTab(t && VALID_TABS.includes(t) ? t : 'directory');
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  const navigateTab = useCallback((nextTab) => {
    if (!VALID_TABS.includes(nextTab)) return;
    setActiveTab(nextTab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', nextTab);
      window.history.pushState({ tab: nextTab }, '', url.toString());
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (activeTenant) {
      apiFetch('/api/tenants/memberships').then((res) => {
        if (res.ok) setOfficers(res.data.memberships || []);
      });
    }
  }, [activeTenant]);

  if (loading || !user) {
    return <div className="p-8 text-sm text-slate-600">Loading organization workspace...</div>;
  }

  const handleDocSubmit = async (e) => {
    e.preventDefault();
    setDocMsg('');
    const res = await apiFetch('/api/tenants/verification-doc', {
      method: 'PATCH',
      body: JSON.stringify({ verificationDocUrl: docUrl, verificationNotes: docNotes }),
    });
    if (res.ok) {
      setDocMsg('Credential link saved for Platform-Admin review.');
      await refreshSession();
    } else {
      setDocMsg(res.error);
    }
  };

  const handleAddOfficer = async (e) => {
    e.preventDefault();
    setOfficerMsg('');
    const res = await apiFetch('/api/tenants/memberships', {
      method: 'POST',
      body: JSON.stringify(officerForm),
    });
    if (res.ok) {
      setOfficerMsg('Officer access assigned.');
      setOfficerForm({ fullName: '', email: '', temporaryPassword: '', role: 'CLERK' });
      const listRes = await apiFetch('/api/tenants/memberships');
      if (listRes.ok) setOfficers(listRes.data.memberships || []);
    } else {
      setOfficerMsg(res.error);
    }
  };

  const isPcm = activeTenant?.organization_type === 'PCM_CHAPTER';

  const navItems = [
    {
      id: 'directory',
      label: isPcm ? 'Student Directory' : 'People & Roll',
      shortLabel: 'Directory',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      id: 'clerk',
      label: isPcm ? 'Secretary & Roll Audit' : 'Clerk Duties & Transfers',
      shortLabel: isPcm ? 'Secretary' : 'Clerk',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: 'governance',
      label: isPcm ? 'Governance & Minutes' : 'Board & Minutes',
      shortLabel: 'Board',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      id: 'pcm',
      label: isPcm ? 'PCM & Mentorship' : 'Campus Ministry (PCM)',
      shortLabel: 'PCM',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
        </svg>
      ),
    },
    {
      id: 'treasury',
      label: isPcm ? 'Chapter Treasury' : 'Treasury & Stewardship',
      shortLabel: 'Treasury',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'officers',
      label: isPcm ? 'Chapter Access (RBAC)' : 'Portal Access (RBAC)',
      shortLabel: 'Access',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
  ];

  const activeNav = navItems.find((n) => n.id === activeTab) || navItems[0];

  return (
    <div className="min-h-screen bg-slate-50 pb-16 md:pb-0">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              title="AdventistHub Home"
              className="w-9 h-9 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs flex items-center justify-center shrink-0 transition"
            >
              AH
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-900">
                  {activeTenant ? activeTenant.name : 'AdventistHub'}
                </span>
                {activeTenant && (
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      activeTenant.verification_status === 'VERIFIED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {activeTenant.verification_status}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isPcm ? 'PCM Campus Chapter' : 'Local SDA Church'} • {user.full_name} (
                {activeRole || 'Platform Admin'})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {memberships.length > 1 && (
              <select
                value={activeTenant?.id || ''}
                onChange={(e) => switchTenant(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
              >
                {memberships.map((m) => (
                  <option key={m.membership_id} value={m.tenant_id}>
                    {m.tenant_name} ({m.role})
                  </option>
                ))}
              </select>
            )}

            {user.is_platform_admin && (
              <Link
                href="/platform-admin"
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
              >
                Platform Governance
              </Link>
            )}

            <button
              onClick={async () => {
                await logout();
                router.push('/login');
              }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              Sign Out
            </button>
          </div>
        </div>

        {activeTenant && (
          <nav className="max-w-6xl mx-auto mt-3 pt-2.5 border-t border-slate-100 hidden md:flex items-center gap-1.5 overflow-x-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigateTab(item.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  activeTab === item.id
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        )}
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
        {activeTenant && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500">
            <Link href="/" className="hover:text-slate-800">
              AdventistHub
            </Link>
            <span>/</span>
            <button
              type="button"
              onClick={() => navigateTab('directory')}
              className="hover:text-slate-800 truncate max-w-[180px] sm:max-w-none"
            >
              {activeTenant.name}
            </button>
            <span>/</span>
            <span className="font-semibold text-slate-800">{activeNav.label}</span>
          </nav>
        )}

        {activeTenant && activeTenant.verification_status === 'PENDING' && (
          <section className="bg-amber-50 border border-amber-200 rounded-xl p-4 sm:p-5">
            <h2 className="text-sm font-bold text-amber-900">
              Restricted Sandbox Mode — Verification Pending
            </h2>
            <p className="text-xs text-amber-800 mt-1">
              You can configure officers now, while live {isPcm ? 'student' : 'congregant'} directory
              writes and clerk transactions unlock once a Platform Administrator verifies your organization.
            </p>
            <form onSubmit={handleDocSubmit} className="mt-4 flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                required
                placeholder="Pastor/Conference authorization letter URL (https://...)"
                value={docUrl}
                onChange={(e) => setDocUrl(e.target.value)}
                className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
              <input
                type="text"
                placeholder="Notes (e.g., Pastor name / Conference)"
                value={docNotes}
                onChange={(e) => setDocNotes(e.target.value)}
                className="sm:w-64 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-amber-900 text-white text-xs font-medium hover:bg-amber-950"
              >
                Submit Credential
              </button>
            </form>
            {docMsg && <p className="text-xs text-amber-900 font-medium mt-2">{docMsg}</p>}
          </section>
        )}

        {activeTenant && activeTab === 'directory' && (
          <ErrorBoundary>
            <div className="space-y-6">
              <DirectorySection activeTenant={activeTenant} />
              <OfficerClaimPanel activeTenant={activeTenant} />
            </div>
          </ErrorBoundary>
        )}

        {activeTenant && activeTab === 'clerk' && (
          <ErrorBoundary>
            <ClerkTransactionsSection activeTenant={activeTenant} onNavigateTab={navigateTab} />
          </ErrorBoundary>
        )}

        {activeTenant && activeTab === 'governance' && (
          <ErrorBoundary>
            <GovernanceSection activeTenant={activeTenant} />
          </ErrorBoundary>
        )}

        {activeTenant && activeTab === 'pcm' && (
          <ErrorBoundary>
            <PcmMentorshipSection activeTenant={activeTenant} onNavigateTab={navigateTab} />
          </ErrorBoundary>
        )}

        {activeTenant && activeTab === 'treasury' && (
          <ErrorBoundary>
            <TreasurySection activeTenant={activeTenant} />
          </ErrorBoundary>
        )}

        {activeTenant && activeTab === 'officers' && (
          <ErrorBoundary>
            <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
              <h2 className="text-base font-bold text-slate-900">
                {isPcm ? 'Chapter Leadership & RBAC' : 'Church Officers & RBAC'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Assign login accounts and Church Manual / PCM roles for your leadership team.
              </p>

              {(activeRole === 'ADMIN' || user.is_platform_admin) && (
                <form
                  onSubmit={handleAddOfficer}
                  className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
                >
                  <input
                    required
                    placeholder="Full Name"
                    value={officerForm.fullName}
                    onChange={(e) => setOfficerForm((p) => ({ ...p, fullName: e.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Email"
                    value={officerForm.email}
                    onChange={(e) => setOfficerForm((p) => ({ ...p, email: e.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  />
                  <input
                    placeholder="Temp Password (min 8 chars)"
                    value={officerForm.temporaryPassword}
                    onChange={(e) =>
                      setOfficerForm((p) => ({ ...p, temporaryPassword: e.target.value }))
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  />
                  <select
                    value={officerForm.role}
                    onChange={(e) => setOfficerForm((p) => ({ ...p, role: e.target.value }))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  >
                    <option value="CLERK">{isPcm ? 'Secretary (CLERK)' : 'Church Clerk'}</option>
                    <option value="PASTOR">{isPcm ? 'Campus Chaplain (PASTOR)' : 'Pastor'}</option>
                    <option value="ELDER">Elder</option>
                    <option value="TREASURER">Treasurer</option>
                    <option value="PCM_LEADER">PCM Leader</option>
                    <option value="ADMIN">Portal Admin</option>
                  </select>
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-700 text-white text-xs font-medium px-4 py-2 hover:bg-blue-800"
                  >
                    Assign Role
                  </button>
                </form>
              )}
              {officerMsg && <p className="text-xs text-blue-700 font-medium mt-2">{officerMsg}</p>}

              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2 pr-4">Officer</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Role</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {officers.map((o) => (
                      <tr key={o.id}>
                        <td className="py-2.5 pr-4 font-medium text-slate-900">{o.full_name}</td>
                        <td className="py-2.5 pr-4 text-slate-600">{o.email}</td>
                        <td className="py-2.5 pr-4">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-medium">
                            {o.role}
                          </span>
                        </td>
                        <td className="py-2.5 text-emerald-700">
                          {o.is_active ? 'Active' : 'Inactive'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </ErrorBoundary>
        )}
      </main>

      {activeTenant && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-30 grid grid-cols-6">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => navigateTab(item.id)}
              className={`flex flex-col items-center justify-center py-2 text-[10px] font-semibold ${
                activeTab === item.id ? 'text-blue-700' : 'text-slate-500'
              }`}
            >
              {item.icon}
              <span className="mt-0.5">{item.shortLabel}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

export default function AdminPortalPage() {
  return (
    <AuthProvider>
      <AdminPortalContent />
    </AuthProvider>
  );
}
