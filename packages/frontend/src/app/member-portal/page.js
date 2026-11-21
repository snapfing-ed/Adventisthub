import { Suspense } from 'react';
import MemberPortalWorkspace from '@/features/portal/MemberPortalWorkspace';

export const metadata = {
  title: 'Member & Student Portal | AdventistHub',
};

export default function MemberPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
          Loading portal...
        </div>
      }
    >
      <MemberPortalWorkspace />
    </Suspense>
  );
}
