'use client';

import { TriangleAlert, ChevronRight, Construction } from 'lucide-react';
import Link from 'next/link';

export default function DeclarationChutesPage() {
  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>
      <div
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #c2410c 0%, #9a3412 100%)' }}
      >
        <div className="relative z-10 max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/90">Déclaration de Chutes</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <TriangleAlert className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Déclaration de Chutes</h1>
              <p className="text-white/70 text-sm">Fiches de déclaration et suivi des chutes</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-16 flex flex-col items-center justify-center gap-4">
        <div className="bg-white rounded-2xl border border-orange-200 p-10 flex flex-col items-center gap-4 shadow-sm max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center">
            <Construction className="h-8 w-8 text-orange-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Page en cours de construction</h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            Ce module sera disponible prochainement. Le contenu est en cours de préparation.
          </p>
          <Link
            href="/"
            className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-orange-700 hover:bg-orange-800 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
