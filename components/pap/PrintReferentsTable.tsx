'use client';

import { X, Printer } from 'lucide-react';

interface Resident {
  id: string;
  title?: string;
  first_name: string;
  last_name: string;
  room: string;
  section?: string;
  referent?: string;
}

export default function PrintReferentsTable({ residents, onClose }: { residents: Resident[]; onClose: () => void }) {
  const grouped: Record<string, Resident[]> = {};
  [...residents]
    .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || '', 'fr'))
    .forEach(r => {
      const ref = r.referent?.trim() || '— Sans référent —';
      if (!grouped[ref]) grouped[ref] = [];
      grouped[ref].push(r);
    });

  const sortedRefs = Object.keys(grouped).sort((a, b) => {
    if (a === '— Sans référent —') return 1;
    if (b === '— Sans référent —') return -1;
    return a.localeCompare(b, 'fr');
  });

  const handlePrint = () => {
    const rows = sortedRefs.map(ref => {
      const res = grouped[ref];
      const isSans = ref === '— Sans référent —';
      return `<tr>
        <td style="font-weight:600;vertical-align:top;padding:8px 12px;background:${isSans ? '#fff7ed' : '#f8fafc'};border:1px solid #cbd5e1;white-space:nowrap;color:${isSans ? '#9a3412' : '#1e293b'};">${ref}</td>
        <td style="padding:8px 12px;border:1px solid #cbd5e1;vertical-align:top;">
          ${res.map(r => `<div style="font-size:12px;padding:2px 0;"><strong>${r.last_name}</strong> ${r.first_name || ''} <span style="color:#94a3b8;">— Ch.${r.room}</span></div>`).join('')}
        </td>
        <td style="padding:8px 12px;border:1px solid #cbd5e1;text-align:center;vertical-align:top;color:#64748b;">${res.length}</td>
      </tr>`;
    }).join('');

    const win = window.open('', '_blank')!;
    win.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Tableau des référents</title>
<style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;font-size:13px;color:#1e293b}h1{font-size:18px;margin-bottom:4px}.subtitle{font-size:12px;color:#64748b;margin-bottom:16px}table{width:100%;border-collapse:collapse}th{background:#1e293b;color:white;padding:8px 12px;text-align:left;font-size:12px;border:1px solid #1e293b}th:last-child{text-align:center;width:60px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
</head><body>
<h1>Tableau des référents soignants</h1>
<div class="subtitle">Imprimé le ${new Date().toLocaleDateString('fr-FR')} — ${residents.length} résidents</div>
<table><thead><tr><th style="width:160px;">Référent</th><th>Résidents attitrés</th><th>Nb</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-slate-900">Tableau référents / résidents</h2>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
              <Printer className="h-4 w-4" /> Imprimer
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-800 text-white">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold w-40">Référent</th>
                <th className="text-left px-4 py-2.5 font-semibold">Résidents attitrés</th>
                <th className="text-center px-4 py-2.5 font-semibold w-12">Nb</th>
              </tr>
            </thead>
            <tbody>
              {sortedRefs.map((ref, i) => {
                const res = grouped[ref];
                const isSans = ref === '— Sans référent —';
                return (
                  <tr key={ref} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className={`px-4 py-3 font-semibold align-top border-b border-slate-100 ${isSans ? 'text-orange-700' : 'text-slate-800'}`}>{ref}</td>
                    <td className="px-4 py-3 border-b border-slate-100">
                      <div className="flex flex-col gap-0.5">
                        {res.map(r => (
                          <span key={r.id} className="text-xs text-slate-700">
                            <strong>{r.last_name}</strong> {r.first_name || ''}
                            <span className="text-slate-400 ml-1">— Ch.{r.room}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100 text-center font-bold text-slate-600">{res.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
