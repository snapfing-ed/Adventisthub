"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    organizationType: 'CHURCH',
    organizationName: '',
    slug: '',
    country: 'Zambia',
    regionOrConference: '',
    cityOrCampus: '',
    fullName: '',
    email: '',
    phone: '',
    password: '',
    verificationCode: '',
    verificationDocUrl: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(form),
    });

    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }

    router.push('/admin-portal');
  };

  const isPcm = form.organizationType === 'PCM_CHAPTER';

  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="mb-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
            AdventistHub Onboarding
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-3">
            Register Your Organization
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Set up a dedicated portal for your local Seventh-day Adventist church or campus PCM chapter.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Organization Type Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Organization Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'CHURCH', title: 'Local SDA Church', desc: 'Church Manual clerk, board & membership workflows' },
                { value: 'PCM_CHAPTER', title: 'PCM Campus Chapter', desc: 'Public Campus Ministries student & mentor governance' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, organizationType: opt.value }))}
                  className={`text-left p-4 rounded-xl border transition ${
                    form.organizationType === opt.value
                      ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-600/20'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="font-semibold text-slate-900 text-sm">{opt.title}</div>
                  <div className="text-xs text-slate-500 mt-1">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Organization Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {isPcm ? 'PCM Chapter Name' : 'Church Name'}
              </label>
              <input
                name="organizationName"
                required
                placeholder={isPcm ? 'e.g., Mulungushi University SDA PCM' : 'e.g., Kabwata Seventh-day Adventist Church'}
                value={form.organizationName}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Subdomain Slug
              </label>
              <div className="flex items-center rounded-lg border border-slate-300 overflow-hidden">
                <input
                  name="slug"
                  placeholder="e.g., kabwata"
                  value={form.slug}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-sm text-slate-900 outline-none"
                />
                <span className="bg-slate-100 px-2.5 py-2 text-xs text-slate-500 border-l border-slate-300">
                  .adventisthub.com
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Conference / Field / Union
              </label>
              <input
                name="regionOrConference"
                placeholder="e.g., Central Zambia Conference"
                value={form.regionOrConference}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Country
              </label>
              <input
                name="country"
                value={form.country}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {isPcm ? 'University / College Campus' : 'City / District'}
              </label>
              <input
                name="cityOrCampus"
                placeholder={isPcm ? 'e.g., Main Campus, Kabwe' : 'e.g., Lusaka'}
                value={form.cityOrCampus}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>

          {/* Primary Administrator */}
          <div className="border-t border-slate-200 pt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <h2 className="text-sm font-semibold text-slate-900">Primary Administrator Account</h2>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input
                name="fullName"
                required
                placeholder="e.g., Elder John Banda"
                value={form.fullName}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone (Optional)</label>
              <input
                name="phone"
                placeholder="+260..."
                value={form.phone}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
              <input
                name="email"
                type="email"
                required
                value={form.email}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password (min 8 chars)</label>
              <input
                name="password"
                type="password"
                minLength={8}
                required
                value={form.password}
                onChange={handleChange}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>

          {/* Dual Verification Track */}
          <div className="border-t border-slate-200 pt-5 bg-slate-50 p-4 rounded-xl space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Organization Verification</h2>
            <p className="text-xs text-slate-600">
              Enter a Conference/Chaplaincy invite code for instant verification, or provide a credential/authorization link for Platform-Admin review.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Fast-Track Invite Code (Optional)
                </label>
                <input
                  name="verificationCode"
                  placeholder="ADV-XXXXXX"
                  value={form.verificationCode}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm uppercase text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Credential / Letter URL (Optional)
                </label>
                <input
                  name="verificationDocUrl"
                  type="url"
                  placeholder="https://..."
                  value={form.verificationDocUrl}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-medium text-sm transition disabled:opacity-50"
          >
            {submitting ? 'Creating Organization...' : 'Create Organization Portal'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6">
          Already have an officer account?{' '}
          <Link href="/login" className="text-blue-700 font-medium hover:underline">
            Sign in here
          </Link>
        </p>
      </div>
    </main>
  );
}
