'use client';

import { BookUser, ChevronRight, Construction } from 'lucide-react';
import Link from 'next/link';

export default function AnnuairePage() {
  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>
      <div
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}
      >
        <div className="relative z-10 max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/90">Annuaire</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <BookUser className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Annuaire</h1>
              <p className="text-white/70 text-sm">Numéros de téléphone et contacts utiles</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-16 flex flex-col items-center justify-center gap-4">
        <div className="bg-white rounded-2xl border border-blue-200 p-10 flex flex-col items-center gap-4 shadow-sm max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center">
            <Construction className="h-8 w-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Page en cours de construction</h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            L&apos;annuaire des numéros de téléphone utiles sera disponible prochainement.
          </p>
          <Link
            href="/"
            className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
