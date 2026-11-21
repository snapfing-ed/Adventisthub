import Link from 'next/link';
import Footer from './ui/Footer';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-700 text-white font-bold text-sm flex items-center justify-center">
              AH
            </div>
            <span className="font-bold text-slate-900 text-base">AdventistHub</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-700 hover:text-slate-900 px-3 py-1.5"
            >
              Officer Sign In
            </Link>
            <Link
              href="/register"
              className="text-sm font-medium bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-lg transition"
            >
              Register Organization
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-20 text-center">
        <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
          Church Manual &amp; PCM Aligned
        </span>
        <h1 className="text-4xl font-extrabold text-slate-900 mt-5 tracking-tight">
          Administration &amp; Clerk Operations for Seventh-day Adventist Churches &amp; Campuses
        </h1>
        <p className="text-base text-slate-600 mt-4 max-w-2xl mx-auto">
          Manage congregant and student directories, baptisms, letters of transfer, nominating
          committee elections, and church board minutes in one isolated workspace.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/register"
            className="px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold text-sm transition"
          >
            Onboard Your Church or PCM Chapter
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-semibold text-sm transition"
          >
            Sign In to Portal
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
