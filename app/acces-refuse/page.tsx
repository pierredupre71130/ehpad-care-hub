export default function AccesRefusePage() {
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
          L&apos;accès à cette application est réservé aux connexions depuis les sites autorisés
          (Gueugnon et Paray-le-Monial).
        </p>
        <p className="text-xs text-slate-400">
          Si vous êtes un administrateur, connectez-vous depuis un site autorisé ou contactez le responsable informatique.
        </p>
      </div>
    </div>
  );
}
