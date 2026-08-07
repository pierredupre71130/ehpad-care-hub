import { headers } from 'next/headers';

export default async function AccesRefusePage() {
  const h = await headers();
  const city    = h.get('x-vercel-ip-city')            ?? '(non détecté)';
  const country = h.get('x-vercel-ip-country')         ?? '(non détecté)';
  const region  = h.get('x-vercel-ip-country-region')  ?? '(non détecté)';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">Accès non autorisé</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          L&apos;accès est réservé aux connexions depuis Gueugnon et Paray-le-Monial.
        </p>

        {/* Infos de debug — à supprimer une fois le filtre calé */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-slate-700 mb-2">Localisation détectée :</p>
          <p><span className="text-slate-400">Ville :</span> <strong>{decodeURIComponent(city)}</strong></p>
          <p><span className="text-slate-400">Pays :</span> <strong>{country}</strong></p>
          <p><span className="text-slate-400">Région :</span> <strong>{region}</strong></p>
        </div>

        <p className="text-xs text-slate-400 mt-4">
          Contactez l&apos;administrateur si vous pensez que c&apos;est une erreur.
        </p>
      </div>
    </div>
  );
}
