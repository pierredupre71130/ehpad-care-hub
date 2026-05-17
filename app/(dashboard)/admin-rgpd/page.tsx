'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  ShieldCheck, Home, Download, UserX, Loader2,
  AlertTriangle, Check, ChevronDown, Search, FileText,
} from 'lucide-react';
import { AdminPasswordGate } from '@/components/ui/admin-password-gate';
import { toast } from 'sonner';

// ── Génération HTML lisible pour l'export PDF ────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  consignes_nuit: 'Consignes de nuit',
  pap: "PAP (Projet d'Accompagnement Personnalisé)",
  pap_versions: 'PAP — versions archivées',
  poids: 'Mesures de poids',
  vaccination: 'Vaccinations',
  contentions: 'Contentions',
  niveau_soin: 'GIR / Niveau de soin',
  prises_en_charge: 'Prises en charge',
  bilans: 'Bilans spéciaux',
  planning_bilans: 'Planning bilans sanguins',
  dossier_nutritionnel: 'Dossier nutritionnel',
  complement_alimentaire: 'Compléments alimentaires',
  suivi_clinique_nutritionnel: 'Suivi clinique nutritionnel',
  suivi_antalgique: 'Suivi antalgique / morphiniques',
};

const FIELD_LABELS: Record<string, string> = {
  // Champs résident
  first_name: 'Prénom', last_name: 'Nom', date_naissance: 'Date de naissance',
  date_entree: "Date d'entrée", date_sortie: 'Date de sortie',
  room: 'Chambre', section: 'Section', floor: 'Étage', title: 'Civilité',
  referent: 'Référent', medecin: 'Médecin', sexe: 'Sexe',
  // Champs génériques
  created_at: 'Créé le', updated_at: 'Modifié le', id: 'ID interne',
  resident_id: 'ID résident', resident_name: 'Nom résident', archived: 'Archivé',
};

function fmtKey(k: string): string {
  return FIELD_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '<span style="color:#cbd5e1">—</span>';
  if (typeof v === 'boolean') return v ? '<b style="color:#16a34a">Oui</b>' : '<span style="color:#94a3b8">Non</span>';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(v)) {
      try {
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) {
          return v.length > 10
            ? d.toLocaleString('fr-FR')
            : d.toLocaleDateString('fr-FR');
        }
      } catch { /* ignore */ }
    }
    return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return '<span style="color:#cbd5e1">—</span>';
    return v.map(x => typeof x === 'object' ? `<pre style="margin:0;font-size:9px">${JSON.stringify(x, null, 2)}</pre>` : String(x)).join(', ');
  }
  if (typeof v === 'object') {
    return `<pre style="margin:0;font-size:9px;white-space:pre-wrap">${JSON.stringify(v, null, 2)}</pre>`;
  }
  return String(v);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderRecord(rec: Record<string, any>): string {
  const fields = Object.entries(rec).filter(([k]) => !['id', 'resident_id', 'resident_name'].includes(k));
  return `<table class="record-table">${fields.map(([k, v]) =>
    `<tr><td class="k">${fmtKey(k)}</td><td class="v">${fmtVal(v)}</td></tr>`).join('')}</table>`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderSection(key: string, records: any[]): string {
  const label = SECTION_LABELS[key] || key;
  if (!records || records.length === 0) {
    return `<section class="empty"><h2>${label}</h2><p class="muted">Aucune donnée</p></section>`;
  }
  return `<section><h2>${label} <span class="count">(${records.length})</span></h2>${records.map((r, i) =>
    `<div class="record"><div class="record-h">Entrée ${i + 1}</div>${renderRecord(r)}</div>`,
  ).join('')}</section>`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildRgpdHtml(data: any): string {
  const r = data.resident || {};
  const nom = `${(r.last_name || '').toUpperCase()} ${r.first_name || ''}`.trim() || 'Résident';
  const dateExp = data.export_date ? new Date(data.export_date).toLocaleString('fr-FR') : new Date().toLocaleString('fr-FR');
  const med = data.donnees_medicales || {};
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Export RGPD — ${nom}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11px;color:#0f172a;padding:10mm;background:#fff}
  @page{size:A4 portrait;margin:10mm}
  .header{border:2px solid #1e40af;border-radius:5px;padding:8px 12px;margin-bottom:10px;background:#eff6ff}
  .header h1{font-size:18px;color:#1e40af;margin-bottom:2px}
  .header .sub{font-size:10px;color:#475569;margin-bottom:4px}
  .header .meta{display:flex;flex-wrap:wrap;gap:14px;font-size:10px;color:#475569;margin-top:4px}
  .header .meta b{color:#0f172a}
  section{margin-bottom:8px;page-break-inside:avoid}
  section.empty{opacity:0.6}
  h2{font-size:12px;color:white;background:#334155;padding:4px 8px;border-radius:3px;margin-bottom:4px;letter-spacing:0.04em;text-transform:uppercase}
  h2 .count{font-weight:400;opacity:0.7;text-transform:none;letter-spacing:0;margin-left:6px}
  .muted{color:#94a3b8;font-style:italic;font-size:10px;padding:3px 8px}
  .record{border:1px solid #e2e8f0;border-radius:3px;margin-bottom:4px;page-break-inside:avoid}
  .record-h{background:#f1f5f9;color:#475569;font-size:9px;font-weight:700;padding:2px 6px;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:0.03em}
  table.record-table{width:100%;border-collapse:collapse}
  table.record-table td{padding:2px 6px;font-size:10px;vertical-align:top;border-bottom:1px solid #f1f5f9}
  table.record-table td.k{font-weight:600;color:#475569;width:34%;background:#fafafa}
  table.record-table td.v{color:#0f172a}
  table.record-table tr:last-child td{border-bottom:none}
  pre{font-family:Consolas,monospace;background:#fff}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head><body>

<div class="header">
  <h1>Export RGPD — ${nom}</h1>
  <div class="sub">${data.export_type || "Droit d'accès (Article 15 RGPD)"} · ${data.etablissement || ''}</div>
  <div class="meta">
    <span><b>Chambre :</b> ${fmtVal(r.room)}</span>
    <span><b>Date naissance :</b> ${fmtVal(r.date_naissance)}</span>
    <span><b>Date d'entrée :</b> ${fmtVal(r.date_entree)}</span>
    <span><b>Médecin :</b> ${fmtVal(r.medecin)}</span>
    <span><b>Date export :</b> ${dateExp}</span>
  </div>
</div>

<section>
  <h2>Fiche résident</h2>
  <div class="record"><div class="record-h">Données administratives</div>${renderRecord(r)}</div>
</section>

${Object.keys(SECTION_LABELS).map(key => renderSection(key, med[key] || [])).join('')}

</body></html>`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Resident {
  id: string;
  last_name: string;
  first_name?: string;
  room?: string;
  floor?: string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchResidents(): Promise<Resident[]> {
  const sb = createClient();
  const { data } = await sb
    .from('residents')
    .select('id, last_name, first_name, room, floor')
    .order('last_name');
  return (data ?? []) as Resident[];
}

async function anonymizeResident(residentId: string) {
  const res = await fetch('/api/admin/rgpd/anonymize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ residentId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Erreur anonymisation');
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminRGPDPage() {
  return (
    <AdminPasswordGate title="Outils RGPD" subtitle="Réservé aux administrateurs">
      <RGPDContent />
    </AdminPasswordGate>
  );
}

function RGPDContent() {
  const [selectedId, setSelectedId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [confirmAnonymize, setConfirmAnonymize] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { data: residents = [], isLoading } = useQuery({
    queryKey: ['rgpd', 'residents'],
    queryFn: fetchResidents,
  });

  const selected = residents.find(r => r.id === selectedId);

  const filtered = residents.filter(r => {
    const q = search.toLowerCase();
    return (
      r.last_name.toLowerCase().includes(q) ||
      (r.first_name ?? '').toLowerCase().includes(q) ||
      (r.room ?? '').toLowerCase().includes(q)
    );
  });

  const anonymizeMutation = useMutation({
    mutationFn: () => anonymizeResident(selectedId),
    onSuccess: () => {
      toast.success('Résident anonymisé avec succès');
      setConfirmAnonymize(false);
      setSelectedId('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleExport = async () => {
    if (!selectedId) return;
    setIsExporting(true);
    try {
      const res = await fetch(`/api/admin/rgpd/export?residentId=${selectedId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Erreur export');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RGPD_${selected?.last_name ?? 'export'}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export téléchargé');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (!selectedId) return;
    // Ouvrir la fenêtre IMMÉDIATEMENT (sinon le navigateur bloque le popup
    // car il ne le voit plus comme déclenché par un clic utilisateur après le await).
    const w = window.open('', '_blank');
    if (!w) { toast.error('Veuillez autoriser les popups pour imprimer'); return; }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Export RGPD…</title></head><body style="font-family:Arial,sans-serif;padding:40px;text-align:center;color:#475569"><p>Préparation de l&apos;export en cours…</p></body></html>`);
    setIsExporting(true);
    try {
      const res = await fetch(`/api/admin/rgpd/export?residentId=${selectedId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Erreur export');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await res.json() as any;
      const html = buildRgpdHtml(data);
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 500);
      toast.success('Aperçu PDF ouvert');
    } catch (e) {
      w.close();
      toast.error((e as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#dde4ee' }}>

      {/* Header */}
      <header className="relative z-10 w-full"
        style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e4a7a 100%)' }}>
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.15)' }}>
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <nav className="flex items-center gap-1 text-white/50 text-xs mb-0.5">
              <Link href="/" className="hover:text-white/80 transition-colors flex items-center gap-1">
                <Home className="h-3 w-3" /> Accueil
              </Link>
              <span>›</span>
              <span className="text-white/80">Outils RGPD</span>
            </nav>
            <h1 className="text-xl font-bold text-white">Outils RGPD</h1>
            <p className="text-sm text-white/60 mt-0.5">Droits d&apos;accès et d&apos;effacement — Règlement UE 2016/679</p>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 pb-16 space-y-6">

        {/* Notice légale */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold mb-1">Obligations légales — dossiers médicaux</p>
            <p className="text-amber-700 leading-relaxed">
              En France, les dossiers médicaux doivent être conservés <strong>20 ans</strong> après le dernier acte médical
              (Article R. 1112-7 du Code de la Santé Publique). L&apos;anonymisation remplace les données
              d&apos;identification personnelle tout en conservant les données médicales conformément à cette obligation.
            </p>
          </div>
        </div>

        {/* Sélection du résident */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">
            Sélectionner un résident
          </h2>

          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
            </div>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDropdown(v => !v)}
                className="w-full flex items-center justify-between gap-2 border border-slate-200 rounded-xl px-4 py-3 text-sm text-left hover:border-slate-300 transition-colors bg-white"
              >
                <span className={selected ? 'text-slate-800 font-medium' : 'text-slate-400'}>
                  {selected
                    ? `${selected.last_name} ${selected.first_name ?? ''} — Ch. ${selected.room ?? '?'} (${selected.floor ?? '?'})`
                    : 'Choisir un résident...'
                  }
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
              </button>

              {showDropdown && (
                <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-slate-100">
                    <div className="flex items-center gap-2 px-2">
                      <Search className="h-4 w-4 text-slate-400" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Rechercher..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="flex-1 text-sm outline-none py-1"
                      />
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {filtered.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-slate-400">Aucun résultat</div>
                    ) : filtered.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => { setSelectedId(r.id); setShowDropdown(false); setSearch(''); setConfirmAnonymize(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center gap-3"
                      >
                        <span className="font-medium text-slate-800">{r.last_name} {r.first_name ?? ''}</span>
                        <span className="text-slate-400 text-xs">Ch. {r.room ?? '?'} — {r.floor ?? '?'}</span>
                        {r.id === selectedId && <Check className="h-3.5 w-3.5 text-blue-500 ml-auto" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions RGPD */}
        {selected && (
          <div className="grid sm:grid-cols-2 gap-4">

            {/* Export */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Download className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Exporter les données</h3>
                  <p className="text-xs text-slate-500">Article 15 RGPD — Droit d&apos;accès</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Télécharge l&apos;intégralité des données de <strong>{selected.last_name} {selected.first_name ?? ''}</strong>.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleExportPDF}
                  disabled={isExporting}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
                >
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  {isExporting ? 'Export en cours...' : 'Exporter en PDF (lisible)'}
                </button>
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-xl px-4 py-2 text-xs font-semibold transition-colors border border-slate-200"
                >
                  <Download className="h-3.5 w-3.5" />
                  Télécharger le JSON brut
                </button>
              </div>
              <p className="text-[11px] text-slate-400 italic mt-3">
                Astuce : dans la boîte d&apos;impression, choisis « Enregistrer en PDF » comme destination pour obtenir un fichier PDF.
              </p>
            </div>

            {/* Anonymisation */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  <UserX className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Anonymiser</h3>
                  <p className="text-xs text-slate-500">Article 17 RGPD — Droit à l&apos;effacement</p>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Remplace le nom, prénom et photo de <strong>{selected.last_name} {selected.first_name ?? ''}</strong> par
                &quot;ANONYMISÉ&quot;. Les données médicales sont conservées (obligation légale 20 ans).
              </p>

              {!confirmAnonymize ? (
                <button
                  onClick={() => setConfirmAnonymize(true)}
                  className="w-full flex items-center justify-center gap-2 border-2 border-red-200 hover:border-red-400 hover:bg-red-50 text-red-600 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
                >
                  <UserX className="h-4 w-4" />
                  Anonymiser ce résident
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-red-600 font-semibold text-center">⚠️ Cette action est irréversible</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => anonymizeMutation.mutate()}
                      disabled={anonymizeMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl px-3 py-2 text-sm font-semibold transition-colors"
                    >
                      {anonymizeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Confirmer
                    </button>
                    <button
                      onClick={() => setConfirmAnonymize(false)}
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
