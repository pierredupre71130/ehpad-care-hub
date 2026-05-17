'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChefHat, Printer, Loader2, Search, ChevronRight, Eye,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useModuleAccess } from '@/lib/use-module-access';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

type Floor = 'RDC' | '1ER';
type Repas = 'midi' | 'soir';
type Choix = '' | 'N' | 'H' | 'SS' | 'AUTRE';

interface Resident {
  id: string;
  title: string | null;
  first_name: string | null;
  last_name: string;
  room: string | null;
  floor: string | null;
  archived: boolean | null;
}

interface FicheMenu {
  id: string;
  resident_id: string;
  repas: Repas;
  entree: Choix;
  viande: Choix;
  legumes: Choix;
  fromage: Choix;
  dessert: Choix;
  observation: string;
}

const CHOIX: { value: Choix; label: string; cls: string }[] = [
  { value: 'N',     label: 'N',     cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { value: 'H',     label: 'H',     cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'SS',    label: 'SS',    cls: 'bg-rose-100 text-rose-800 border-rose-300' },
  { value: 'AUTRE', label: 'AUTRE', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
];

function shortInitials(prenom: string | null | undefined): string {
  if (!prenom) return '';
  const parts = prenom.split(/[\s-]+/).filter(Boolean);
  return parts.map(p => p.charAt(0).toUpperCase()).filter(Boolean).join('') + '.';
}

function compareRooms(a: string | null, b: string | null): number {
  return (a || '').localeCompare(b || '', undefined, { numeric: true, sensitivity: 'base' });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FichesMenuPage() {
  const supabase = createClient();
  const qc = useQueryClient();
  const access = useModuleAccess('fichesMenu');
  const readOnly = access === 'read';

  const [floor, setFloor] = useState<Floor>('RDC');
  const [repas, setRepas] = useState<Repas>('midi');
  const [search, setSearch] = useState('');

  // ── Queries ────────────────────────────────────────────────
  const { data: residents = [], isLoading: loadingResidents } = useQuery({
    queryKey: ['residents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('residents')
        .select('id, title, first_name, last_name, room, floor, archived')
        .eq('archived', false);
      if (error) throw error;
      return (data ?? []) as Resident[];
    },
  });

  const { data: fiches = [], isLoading: loadingFiches } = useQuery({
    queryKey: ['fiches_menu'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fiches_menu').select('*');
      if (error) throw error;
      return (data ?? []) as FicheMenu[];
    },
  });

  // ── Mutations ──────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async ({ residentId, patch }: { residentId: string; patch: Partial<FicheMenu> }) => {
      const existing = fiches.find(f => f.resident_id === residentId && f.repas === repas);
      const payload: Partial<FicheMenu> = {
        resident_id: residentId,
        repas,
        ...patch,
      };
      if (existing) {
        const { error } = await supabase.from('fiches_menu')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fiches_menu').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fiches_menu'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Derived ───────────────────────────────────────────────
  const floorResidents = useMemo(() => {
    const q = search.toLowerCase().trim();
    return residents
      .filter(r => (r.floor || '').toUpperCase() === floor)
      .filter(r => r.last_name?.trim())
      .filter(r => !q || `${r.last_name} ${r.first_name || ''} ${r.room || ''}`.toLowerCase().includes(q))
      .sort((a, b) => compareRooms(a.room, b.room));
  }, [residents, floor, search]);

  const fichesByResident = useMemo(() => {
    const map = new Map<string, FicheMenu>();
    fiches.filter(f => f.repas === repas).forEach(f => map.set(f.resident_id, f));
    return map;
  }, [fiches, repas]);

  // ── Print ─────────────────────────────────────────────────
  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Autorisez les popups pour imprimer'); return; }
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const repasLabel = repas === 'midi' ? 'MIDI' : 'SOIR';
    const trRows = floorResidents.map(r => {
      const f = fichesByResident.get(r.id);
      const cell = (v: Choix) => {
        if (!v) return '<td class="cx"></td>';
        const opt = CHOIX.find(o => o.value === v);
        return `<td class="cx"><span class="badge ${v}">${opt?.label || v}</span></td>`;
      };
      return `<tr>
        <td class="room">${esc(r.room || '')}</td>
        <td class="nom"><b>${esc(r.last_name.toUpperCase())}</b> ${esc(shortInitials(r.first_name))}</td>
        ${cell((f?.entree || '') as Choix)}
        ${cell((f?.viande || '') as Choix)}
        ${cell((f?.legumes || '') as Choix)}
        ${cell((f?.fromage || '') as Choix)}
        ${cell((f?.dessert || '') as Choix)}
        <td class="obs">${esc(f?.observation || '')}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Fiche Menu — ${repasLabel} — ${floor}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;color:#0f172a;padding:8mm;font-size:10pt}
  @page{size:A4 landscape;margin:8mm}
  h1{font-size:14pt;margin-bottom:2mm}
  .sub{color:#64748b;font-size:9pt;margin-bottom:5mm}
  table{width:100%;border-collapse:collapse}
  th{background:#1e293b;color:white;padding:4px 6px;text-align:left;font-size:8.5pt;text-transform:uppercase;letter-spacing:0.04em;border:1px solid #1e293b}
  td{border:1px solid #cbd5e1;padding:4px 6px;vertical-align:middle;font-size:9.5pt}
  tr:nth-child(even) td{background:#f8fafc}
  td.room{text-align:center;font-weight:700;width:14mm}
  td.nom{width:38mm}
  td.cx{text-align:center;width:18mm;height:9mm}
  td.obs{font-size:8.5pt;color:#475569}
  .badge{display:inline-block;padding:1.5px 6px;border-radius:9999px;font-weight:700;font-size:9pt;border:1px solid}
  .badge.N{background:#d1fae5;color:#065f46;border-color:#6ee7b7}
  .badge.H{background:#dbeafe;color:#1e3a8a;border-color:#93c5fd}
  .badge.SS{background:#fee2e2;color:#991b1b;border-color:#fca5a5}
  .badge.AUTRE{background:#fef3c7;color:#92400e;border-color:#fcd34d}
  .legend{margin-top:5mm;border:1px solid #cbd5e1;border-radius:3px;padding:3mm 5mm;background:#f8fafc;display:flex;gap:8mm;font-size:8.5pt;color:#475569;flex-wrap:wrap}
  .legend b{color:#0f172a;margin-right:2mm}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head><body>
<h1>Fiche Menu — ${repasLabel} — ${floor}</h1>
<div class="sub">${floorResidents.length} résident${floorResidents.length > 1 ? 's' : ''} · imprimée le ${new Date().toLocaleDateString('fr-FR')}</div>
<table>
  <thead><tr>
    <th>Chambre</th>
    <th>Nom</th>
    <th>Entrée</th>
    <th>Viande</th>
    <th>Légumes</th>
    <th>Fromage</th>
    <th>Dessert</th>
    <th>Observation</th>
  </tr></thead>
  <tbody>${trRows}</tbody>
</table>
<div class="legend">
  <span><b>N</b> Normal</span>
  <span><b>H</b> Haché</span>
  <span><b>SS</b> Sans</span>
  <span><b>AUTRE</b> à substituer</span>
</div>
</body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  if (loadingResidents || loadingFiches) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f97316, #c2410c)' }}>
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/60 text-xs mb-4">
            <Link href="/" className="hover:text-white/90">Accueil</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/90">Fiches Menu</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <ChefHat className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-white">Fiches Menu</h1>
              <p className="text-white/70 text-sm">Menus midi et soir par résident, par étage</p>
            </div>
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white text-orange-700 text-sm font-semibold hover:bg-orange-50 transition-colors">
              <Printer className="h-4 w-4" /> Imprimer ({repas === 'midi' ? 'Midi' : 'Soir'} · {floor})
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {readOnly && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700 font-medium">
            <Eye className="h-4 w-4" /> Lecture seule
          </div>
        )}

        {/* Tabs étage + repas */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1 shadow-sm">
            {(['RDC', '1ER'] as const).map(f => (
              <button key={f} onClick={() => setFloor(f)}
                className={cn('px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                  floor === f ? 'bg-orange-600 text-white' : 'text-slate-500 hover:bg-slate-50')}>
                {f === 'RDC' ? 'RDC' : '1er étage'}
              </button>
            ))}
          </div>
          <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1 shadow-sm">
            {(['midi', 'soir'] as const).map(rp => (
              <button key={rp} onClick={() => setRepas(rp)}
                className={cn('px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                  repas === rp ? 'bg-orange-600 text-white' : 'text-slate-500 hover:bg-slate-50')}>
                {rp === 'midi' ? 'Menu MIDI' : 'Menu SOIR'}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher (nom, chambre)…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-orange-400" />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b text-xs uppercase tracking-wide text-slate-500">
                <th className="text-center px-2 py-2 w-16">Ch.</th>
                <th className="text-left px-2 py-2" style={{ minWidth: 130 }}>Résident</th>
                <th className="text-center px-2 py-2" style={{ minWidth: 150 }}>Entrée</th>
                <th className="text-center px-2 py-2" style={{ minWidth: 150 }}>Viande</th>
                <th className="text-center px-2 py-2" style={{ minWidth: 150 }}>Légumes</th>
                <th className="text-center px-2 py-2" style={{ minWidth: 150 }}>Fromage</th>
                <th className="text-center px-2 py-2" style={{ minWidth: 150 }}>Dessert</th>
                <th className="text-left px-2 py-2" style={{ minWidth: 180 }}>Observation</th>
              </tr>
            </thead>
            <tbody>
              {floorResidents.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">Aucun résident pour cet étage</td></tr>
              ) : floorResidents.map(r => {
                const f = fichesByResident.get(r.id);
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50/50">
                    <td className="px-2 py-1.5 text-center font-semibold text-slate-700">{r.room}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className="font-semibold text-slate-800">{r.last_name.toUpperCase()}</span>{' '}
                      <span className="text-slate-500 text-xs">{shortInitials(r.first_name)}</span>
                    </td>
                    {(['entree', 'viande', 'legumes', 'fromage', 'dessert'] as const).map(field => (
                      <td key={field} className="px-2 py-1.5 text-center">
                        <ChoixGroup
                          value={(f?.[field] as Choix) || ''}
                          onChange={v => saveMutation.mutate({ residentId: r.id, patch: { [field]: v } })}
                          readOnly={readOnly}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5">
                      <ObsInput
                        value={f?.observation || ''}
                        onSave={v => saveMutation.mutate({ residentId: r.id, patch: { observation: v } })}
                        readOnly={readOnly}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Légende */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap gap-4 text-xs text-slate-700">
          <span className="font-semibold text-slate-500 uppercase tracking-wide">Légende</span>
          {CHOIX.map(o => (
            <span key={o.value} className="flex items-center gap-1.5">
              <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full border ${o.cls}`}>{o.label}</span>
              {o.value === 'N' && 'Normal'}
              {o.value === 'H' && 'Haché'}
              {o.value === 'SS' && 'Sans'}
              {o.value === 'AUTRE' && 'à substituer'}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ChoixGroup : sélection N/H/SS/AUTRE ──────────────────────────────────────

function ChoixGroup({
  value, onChange, readOnly,
}: {
  value: Choix;
  onChange: (v: Choix) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 justify-center">
      {CHOIX.map(o => {
        const active = value === o.value;
        return (
          <button key={o.value}
            disabled={readOnly}
            onClick={() => onChange(active ? '' : o.value)}
            title={
              o.value === 'N' ? 'Normal' :
              o.value === 'H' ? 'Haché' :
              o.value === 'SS' ? 'Sans' : 'à substituer'
            }
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              active ? o.cls : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── ObsInput : zone de saisie observation ────────────────────────────────────

function ObsInput({
  value, onSave, readOnly,
}: {
  value: string;
  onSave: (v: string) => void;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onSave(draft); }}
      disabled={readOnly}
      placeholder={readOnly ? '' : '—'}
      className="w-full px-2 py-1 text-sm border border-slate-200 rounded outline-none focus:border-orange-400 disabled:bg-slate-50 disabled:cursor-not-allowed"
    />
  );
}
