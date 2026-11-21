"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

export default function MemberSignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const res = await apiFetch('/api/auth/register-member', {
      method: 'POST',
      body: JSON.stringify(form),
    });

    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }

    router.push('/member-portal');
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full">
          Member &amp; Student Portal
        </span>
        <h1 className="text-2xl font-bold text-slate-900 mt-3">Create Personal Account</h1>
        <p className="text-xs text-slate-600 mt-1">
          Create your AdventistHub login to claim your church or campus chapter profile with an invite code.
        </p>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
            <input
              required
              placeholder="e.g., Esther Kasongo"
              value={form.fullName}
              onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email Address *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Phone (Optional)</label>
            <input
              placeholder="+260..."
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Password (min 8 chars) *
            </label>
            <input
              type="password"
              minLength={8}
              required
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold text-sm transition disabled:opacity-50"
          >
            {submitting ? 'Creating Account...' : 'Continue to Claim Profile →'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-700 font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
