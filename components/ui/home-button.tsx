'use client';

import { useRouter } from 'next/navigation';
import { Home } from 'lucide-react';

export function HomeButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push('/')}
      style={{
        position: 'fixed',
        top: '16px',
        left: '16px',
        zIndex: 9999,
      }}
      className="flex items-center gap-2 bg-white border border-slate-200 shadow-lg rounded-full px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:shadow-xl transition-all"
      title="Retour à l'accueil"
    >
      <Home className="h-4 w-4 text-blue-600" />
      Accueil
    </button>
  );
}
