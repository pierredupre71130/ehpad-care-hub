'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X, Printer, HeartPulse } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { HomeButton } from '@/components/ui/home-button';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface Resident {
  id: string;
  room: string;
  title: string;
  first_name: string;
  last_name: string;
  date_naissance: string;
  floor: string;
}

interface NiveauSoinRecord {
  id?: string;
  resident_id: string;  // TEXT (Base44 ID format, not UUID)
  resident_name: string;
  gir: string;
  niveau_soin: string;
  appel_nuit: boolean | null;
  appel_nuit_info: string;
  pompes_funebres: string;
}

type ModalType = 'gir' | 'niveau' | 'appel' | null;

interface PendingChange {
  resident: Resident;
  field: string;
  value: string | boolean | null;
}

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────

const GIR_OPTIONS = ['1', '2', '3', '4', 'N/A'];
const NIVEAU_OPTIONS = ['A', 'B', 'C', 'D', 'En cours'];

function getDailyPassword(): string {
  const now = new Date();
  const day   = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return day + month;
}

// ─────────────────────────────────────────────────────────────
// COULEURS
// ─────────────────────────────────────────────────────────────

function girColor(v: string): string {
  const map: Record<string, string> = {
    '1':   'bg-red-500    text-white border-red-500',
    '2':   'bg-orange-400 text-white border-orange-400',
    '3':   'bg-yellow-400 text-slate-800 border-yellow-400',
    '4':   'bg-green-400  text-white border-green-400',
    'N/A': 'bg-slate-500  text-white border-slate-500',
  };
  return map[v] ?? 'bg-slate-200 text-slate-700 border-slate-300';
}

function niveauColor(v: string): string {
  const map: Record<string, string> = {
    A:          'bg-blue-600   text-white border-blue-600',
    B:          'bg-blue-400   text-white border-blue-400',
    C:          'bg-indigo-400 text-white border-indigo-400',
    D:          'bg-indigo-200 text-slate-800 border-indigo-200',
    'En cours': 'bg-amber-400  text-slate-800 border-amber-400',
  };
  return map[v] ?? 'bg-slate-200 text-slate-700 border-slate-300';
}

// ─────────────────────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────────────────────

async function fetchResidents(): Promise<Resident[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('residents')
    .select('*')
    .order('last_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Resident[];
}

async function fetchNiveaux(): Promise<NiveauSoinRecord[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('niveau_soin')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as NiveauSoinRecord[];
}

async function upsertNiveau(
  existing: NiveauSoinRecord | undefined,
  resident: Resident,
  patch: Partial<NiveauSoinRecord>
): Promise<NiveauSoinRecord> {
  const sb = createClient();
  const residentName = `${resident.last_name} ${resident.first_name ?? ''}`.trim();

  if (existing?.id) {
    const { data, error } = await sb
      .from('niveau_soin')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as NiveauSoinRecord;
  } else {
    const payload: Partial<NiveauSoinRecord> = {
      resident_id: resident.id,
      resident_name: residentName,
      gir: '',
      niveau_soin: '',
      appel_nuit: null,
      appel_nuit_info: '',
      pompes_funebres: '',
      ...patch,
    };
    const { data, error } = await sb
      .from('niveau_soin')
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as NiveauSoinRecord;
  }
}

// Sync appel_nuit back to residents table
async function syncAppelNuit(residentId: string, value: boolean | null) {
  const sb = createClient();
  await sb.from('residents').update({ appel_nuit: value }).eq('id', residentId);
}

// ─────────────────────────────────────────────────────────────
// COMPOSANTS
// ─────────────────────────────────────────────────────────────

function ToggleGroup({
  options, value, onChange, colorFn,
}: {
  options: string[];
  value: string | undefined | null;
  onChange: (v: string | null) => void;
  colorFn: (v: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(value === opt ? null : opt)}
          className={cn(
            'px-2 py-0.5 rounded text-xs font-bold border transition-colors',
            value === opt
              ? colorFn(opt)
              : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
          )}
        >
          {opt === 'N/A'
            ? <span title="Moins de 60 ans — GIR non applicable">⊘ <span className="font-normal">(&lt;60 ans)</span></span>
            : opt}
        </button>
      ))}
    </div>
  );
}

function SummaryModal({
  title, count, onClose, children,
}: {
  title: string;
  count: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-bold text-slate-800 text-base">
            {title}{' '}
            <span className="text-slate-400 font-normal text-sm">({count} résidents)</span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-slate-100">{children}</div>
      </div>
    </div>
  );
}

function ConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xs">
        <h2 className="font-bold text-slate-800 text-base mb-2">Modifier cette valeur ?</h2>
        <p className="text-sm text-slate-500 mb-5">
          Êtes-vous sûr de vouloir modifier cette valeur déjà paramétrée ?
        </p>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="flex-1 bg-purple-700 hover:bg-purple-800 text-white rounded-lg py-2 text-sm font-semibold transition-colors"
          >
            Confirmer
          </button>
          <button
            onClick={onCancel}
            className="flex-1 border border-slate-300 rounded-lg py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE PRINCIPALE
// ─────────────────────────────────────────────────────────────

export default function GIRNiveauSoinPage() {
  const queryClient = useQueryClient();

  // ── Auth mot de passe journalier ──
  const [pageUnlocked, setPageUnlocked] = useState(false);
  const [pagePassword, setPagePassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // ── UI state ──
  const [modal, setModal] = useState<ModalType>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [localUpdates, setLocalUpdates] = useState<Record<string, Partial<NiveauSoinRecord>>>({});

  // ── Data ──
  const { data: residents = [], isLoading: loadingResidents } = useQuery({
    queryKey: ['residents'],
    queryFn: fetchResidents,
  });

  const { data: niveaux = [], isLoading: loadingNiveaux } = useQuery({
    queryKey: ['niveau_soin'],
    queryFn: fetchNiveaux,
  });

  // Map resident_id → record (with local overrides)
  const records = useMemo(() => {
    const map: Record<string, NiveauSoinRecord> = {};
    niveaux.forEach(n => { map[n.resident_id] = n; });
    Object.entries(localUpdates).forEach(([id, patch]) => {
      map[id] = { ...(map[id] ?? { resident_id: id, resident_name: '', gir: '', niveau_soin: '', appel_nuit: null, appel_nuit_info: '', pompes_funebres: '' }), ...patch };
    });
    return map;
  }, [niveaux, localUpdates]);

  const getRec = useCallback((residentId: string): NiveauSoinRecord =>
    records[residentId] ?? { resident_id: residentId, resident_name: '', gir: '', niveau_soin: '', appel_nuit: null, appel_nuit_info: '', pompes_funebres: '' },
    [records]
  );

  // ── Update logic ──
  const doUpdate = useCallback(async (
    resident: Resident,
    field: string,
    value: string | boolean | null
  ) => {
    const existing = records[resident.id];
    const patch = { [field]: value } as Partial<NiveauSoinRecord>;

    setLocalUpdates(prev => ({
      ...prev,
      [resident.id]: { ...(prev[resident.id] ?? {}), ...patch },
    }));
    setSaving(s => ({ ...s, [resident.id]: true }));

    try {
      const updated = await upsertNiveau(existing, resident, patch);
      setLocalUpdates(prev => ({ ...prev, [resident.id]: { ...(prev[resident.id] ?? {}), id: updated.id } }));
      if (field === 'appel_nuit') {
        await syncAppelNuit(resident.id, value as boolean | null);
        queryClient.invalidateQueries({ queryKey: ['residents'] });
      }
      queryClient.invalidateQueries({ queryKey: ['niveau_soin'] });
    } finally {
      setSaving(s => ({ ...s, [resident.id]: false }));
    }
  }, [records, queryClient]);

  const updateField = useCallback((
    resident: Resident,
    field: string,
    value: string | boolean | null
  ) => {
    const existing = records[resident.id];
    const protectedFields = ['gir', 'niveau_soin', 'appel_nuit'];
    const currentVal = existing?.[field as keyof NiveauSoinRecord];
    const hasValue = currentVal !== undefined && currentVal !== null && currentVal !== '';

    if (protectedFields.includes(field) && hasValue) {
      setPendingChange({ resident, field, value });
      return;
    }
    doUpdate(resident, field, value);
  }, [records, doUpdate]);

  const handleConfirm = () => {
    if (!pendingChange) return;
    const { resident, field, value } = pendingChange;
    setPendingChange(null);
    doUpdate(resident, field, value);
  };

  // ── Sorted residents + summary counts ──
  const sorted = useMemo(() =>
    [...residents].sort((a, b) => (a.last_name ?? '').localeCompare(b.last_name ?? '', 'fr')),
    [residents]
  );

  const sansGir    = useMemo(() => sorted.filter(r => { const g = getRec(r.id).gir; return !g || g === ''; }), [sorted, getRec]);
  const sansNiveau = useMemo(() => sorted.filter(r => !getRec(r.id).niveau_soin), [sorted, getRec]);
  const sansAppel  = useMemo(() => sorted.filter(r => {
    const v = getRec(r.id).appel_nuit;
    return v === undefined || v === null;
  }), [sorted, getRec]);

  // ── Password gate ──
  const tryUnlock = () => {
    if (pagePassword === getDailyPassword()) {
      setPageUnlocked(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  if (loadingResidents || loadingNiveaux) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!pageUnlocked) {
    return (
      <>
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-80">
          <HeartPulse className="h-8 w-8 text-purple-700 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800 mb-1 text-center">GIR / Niveau de soin</h2>
          <p className="text-xs text-slate-400 text-center mb-5">Mot de passe journalier requis</p>
          <input
            autoFocus
            type="password"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-purple-500 text-center tracking-widest"
            value={pagePassword}
            onChange={e => { setPagePassword(e.target.value); setPasswordError(false); }}
            onKeyDown={e => e.key === 'Enter' && tryUnlock()}
            placeholder="••••"
          />
          {passwordError && (
            <p className="text-xs text-red-500 mb-2 text-center">Mot de passe incorrect</p>
          )}
          <button
            onClick={tryUnlock}
            className="w-full bg-purple-800 hover:bg-purple-700 text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            Accéder
          </button>
        </div>
      </div>
      <HomeButton />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <div className="print:hidden bg-purple-800 text-white py-4 px-6 shadow-md flex items-center justify-between">
        <h1 className="text-xl font-bold flex-1 text-center">GIR / Niveau de soin / Appel Nuit</h1>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
        >
          <Printer className="h-4 w-4" /> Imprimer
        </button>
      </div>

      {/* ══ VERSION IMPRESSION ══════════════════════════════════ */}
      <div className="hidden print:block" style={{ padding: '4mm', fontFamily: 'Arial, sans-serif' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 'bold', textAlign: 'center', marginBottom: '8px' }}>
          GIR / Niveau de soin / Appel Nuit
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#581c87', color: 'white' }}>
              {['Résident', 'Chambre', 'GIR', 'Niveau de soin', 'Appel nuit', 'Info appel nuit', 'Pompes funèbres'].map(h => (
                <th key={h} style={{ border: '1px solid #ccc', padding: '6px 9px', textAlign: h === 'Résident' || h === 'Info appel nuit' || h === 'Pompes funèbres' ? 'left' : 'center' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, idx) => {
              const rec = getRec(r.id);
              return (
                <tr key={r.id} style={{ background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                  <td style={{ border: '1px solid #ccc', padding: '5px 9px', fontWeight: 600 }}>
                    {r.title} {r.last_name} {r.first_name ?? ''}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 9px', textAlign: 'center' }}>{r.room}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 9px', textAlign: 'center', fontWeight: 700 }}>{rec.gir || '—'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 9px', textAlign: 'center', fontWeight: 700 }}>{rec.niveau_soin || '—'}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 9px', textAlign: 'center' }}>
                    {rec.appel_nuit === true ? 'Oui' : rec.appel_nuit === false ? 'Non' : '—'}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 9px' }}>{rec.appel_nuit_info}</td>
                  <td style={{ border: '1px solid #ccc', padding: '5px 9px' }}>{rec.pompes_funebres}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: '12px', border: '1px solid #94a3b8', borderRadius: '8px', padding: '8px 12px', fontSize: '9px', lineHeight: '1.6', color: '#1e293b', pageBreakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, marginBottom: '4px' }}>Légende — Niveau de soin</p>
          <p><strong>A</strong> : Prolonger la vie par tous les soins nécessaires</p>
          <p><strong>B</strong> : Prolonger la vie par des soins limités</p>
          <p><strong>C</strong> : Assurer le confort prioritairement à prolonger la vie</p>
          <p><strong>D</strong> : Assurer le confort sans viser à prolonger la vie</p>
          <p style={{ marginTop: '6px', fontStyle: 'italic', color: '#475569' }}>
            En dehors de niveau de soins indiqué, le médecin contacté définira la conduite à tenir.
          </p>
        </div>
      </div>

      {/* ══ MODALES ══════════════════════════════════════════════ */}
      {pendingChange && (
        <ConfirmModal onConfirm={handleConfirm} onCancel={() => setPendingChange(null)} />
      )}

      {modal === 'gir' && (
        <SummaryModal title="Résidents sans GIR" count={sansGir.length} onClose={() => setModal(null)}>
          {sansGir.map(r => (
            <div key={r.id} className="flex items-center justify-between px-5 py-3 gap-3">
              <span className="text-sm font-medium text-slate-700">
                {r.title} {r.last_name} {r.first_name ?? ''}{' '}
                <span className="text-xs text-slate-400">Ch.{r.room}</span>
              </span>
              <ToggleGroup options={GIR_OPTIONS} value={getRec(r.id).gir} onChange={v => { updateField(r, 'gir', v); }} colorFn={girColor} />
            </div>
          ))}
        </SummaryModal>
      )}

      {modal === 'niveau' && (
        <SummaryModal title="Résidents sans niveau de soin" count={sansNiveau.length} onClose={() => setModal(null)}>
          {sansNiveau.map(r => (
            <div key={r.id} className="flex items-center justify-between px-5 py-3 gap-3">
              <span className="text-sm font-medium text-slate-700">
                {r.title} {r.last_name} {r.first_name ?? ''}{' '}
                <span className="text-xs text-slate-400">Ch.{r.room}</span>
              </span>
              <ToggleGroup options={NIVEAU_OPTIONS} value={getRec(r.id).niveau_soin} onChange={v => updateField(r, 'niveau_soin', v)} colorFn={niveauColor} />
            </div>
          ))}
        </SummaryModal>
      )}

      {modal === 'appel' && (
        <SummaryModal title="Résidents sans appel nuit défini" count={sansAppel.length} onClose={() => setModal(null)}>
          {sansAppel.map(r => (
            <div key={r.id} className="flex items-center justify-between px-5 py-3 gap-3">
              <span className="text-sm font-medium text-slate-700">
                {r.title} {r.last_name} {r.first_name ?? ''}{' '}
                <span className="text-xs text-slate-400">Ch.{r.room}</span>
              </span>
              <div className="flex gap-1">
                <button onClick={() => updateField(r, 'appel_nuit', true)} className="px-2 py-0.5 rounded text-xs font-bold border border-red-500 bg-white text-red-500 hover:bg-red-50">Oui</button>
                <button onClick={() => updateField(r, 'appel_nuit', false)} className="px-2 py-0.5 rounded text-xs font-bold border border-green-500 bg-white text-green-500 hover:bg-green-50">Non</button>
              </div>
            </div>
          ))}
        </SummaryModal>
      )}

      {/* ══ BADGES RÉSUMÉ + LÉGENDE ══════════════════════════════ */}
      <div className="flex flex-wrap gap-3 p-4 print:hidden">
        <button
          onClick={() => setModal('gir')}
          className="flex flex-col items-center justify-center bg-red-50 border-2 border-red-300 hover:bg-red-100 rounded-xl px-5 py-3 transition-colors"
        >
          <span className="text-3xl font-bold text-red-600">{sansGir.length}</span>
          <span className="text-xs text-red-500 font-semibold mt-1">Sans GIR</span>
        </button>
        <button
          onClick={() => setModal('niveau')}
          className="flex flex-col items-center justify-center bg-blue-50 border-2 border-blue-300 hover:bg-blue-100 rounded-xl px-5 py-3 transition-colors"
        >
          <span className="text-3xl font-bold text-blue-600">{sansNiveau.length}</span>
          <span className="text-xs text-blue-500 font-semibold mt-1">Sans niveau de soin</span>
        </button>
        <button
          onClick={() => setModal('appel')}
          className="flex flex-col items-center justify-center bg-amber-50 border-2 border-amber-300 hover:bg-amber-100 rounded-xl px-5 py-3 transition-colors"
        >
          <span className="text-3xl font-bold text-amber-600">{sansAppel.length}</span>
          <span className="text-xs text-amber-500 font-semibold mt-1">Sans appel nuit défini</span>
        </button>
        <div className="border border-slate-300 rounded-xl px-4 py-3 bg-white text-xs text-slate-700 leading-5 max-w-sm">
          <p className="font-bold text-slate-800 mb-1">Légende — Niveau de soin</p>
          <p><span className="font-bold text-blue-700">A</span> : Prolonger la vie par tous les soins nécessaires</p>
          <p><span className="font-bold text-blue-500">B</span> : Prolonger la vie par des soins limités</p>
          <p><span className="font-bold text-indigo-500">C</span> : Assurer le confort prioritairement à prolonger la vie</p>
          <p><span className="font-bold text-indigo-400">D</span> : Assurer le confort sans viser à prolonger la vie</p>
          <p className="mt-1.5 italic text-slate-500">
            En dehors de niveau de soins indiqué, le médecin contacté définira la conduite à tenir.
          </p>
        </div>
      </div>

      {/* ══ TABLEAU INTERACTIF ══════════════════════════════════ */}
      <div className="px-4 pb-8 overflow-x-auto print:hidden">
        <table className="w-full border-collapse min-w-[900px] bg-white shadow rounded-xl overflow-hidden">
          <thead>
            <tr className="bg-purple-800 text-white text-sm">
              <th className="border border-purple-700 px-3 py-2 text-left font-semibold">Résident</th>
              <th className="border border-purple-700 px-3 py-2 text-center font-semibold w-36">GIR</th>
              <th className="border border-purple-700 px-3 py-2 text-center font-semibold w-52">Niveau de soin</th>
              <th className="border border-purple-700 px-3 py-2 text-center font-semibold w-60">Appel de nuit</th>
              <th className="border border-purple-700 px-3 py-2 text-left font-semibold">Pompes funèbres</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, idx) => {
              const rec = getRec(r.id);
              return (
                <tr key={r.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>

                  {/* Résident */}
                  <td className="border border-slate-300 px-2 py-1.5 text-sm font-medium text-slate-800 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {saving[r.id] && <Loader2 className="h-3 w-3 animate-spin text-slate-400 flex-shrink-0" />}
                      <span>{r.title} {r.last_name} {r.first_name ?? ''}</span>
                      <span className="text-xs text-slate-400 ml-1">Ch.{r.room}</span>
                    </div>
                  </td>

                  {/* GIR */}
                  <td className="border border-slate-300 px-2 py-1.5 text-sm text-center">
                    <ToggleGroup
                      options={GIR_OPTIONS}
                      value={rec.gir}
                      onChange={v => updateField(r, 'gir', v)}
                      colorFn={girColor}
                    />
                  </td>

                  {/* Niveau de soin */}
                  <td className="border border-slate-300 px-2 py-1.5 text-sm">
                    <ToggleGroup
                      options={NIVEAU_OPTIONS}
                      value={rec.niveau_soin}
                      onChange={v => updateField(r, 'niveau_soin', v)}
                      colorFn={niveauColor}
                    />
                  </td>

                  {/* Appel de nuit */}
                  <td className="border border-slate-300 px-2 py-1.5 text-sm">
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-1">
                        <button
                          onClick={() => updateField(r, 'appel_nuit', true)}
                          className={cn(
                            'px-2 py-0.5 rounded text-xs font-bold border transition-colors',
                            rec.appel_nuit === true
                              ? 'bg-red-500 text-white border-red-500'
                              : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
                          )}
                        >Oui</button>
                        <button
                          onClick={() => updateField(r, 'appel_nuit', false)}
                          className={cn(
                            'px-2 py-0.5 rounded text-xs font-bold border transition-colors',
                            rec.appel_nuit === false
                              ? 'bg-green-500 text-white border-green-500'
                              : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
                          )}
                        >Non</button>
                      </div>
                      {rec.appel_nuit === true && (
                        <textarea
                          value={rec.appel_nuit_info ?? ''}
                          onChange={e => updateField(r, 'appel_nuit_info', e.target.value)}
                          onBlur={e => doUpdate(r, 'appel_nuit_info', e.target.value)}
                          placeholder="Informations..."
                          rows={2}
                          className="w-full border border-slate-200 rounded px-2 py-1 text-xs resize-none focus:outline-none focus:border-purple-400"
                        />
                      )}
                    </div>
                  </td>

                  {/* Pompes funèbres */}
                  <td className="border border-slate-300 px-2 py-1.5 text-sm">
                    <textarea
                      value={rec.pompes_funebres ?? ''}
                      onChange={e => setLocalUpdates(prev => ({
                        ...prev,
                        [r.id]: { ...(prev[r.id] ?? {}), pompes_funebres: e.target.value },
                      }))}
                      onBlur={e => doUpdate(r, 'pompes_funebres', e.target.value)}
                      placeholder="Nom, coordonnées..."
                      rows={2}
                      className="w-full border border-slate-200 rounded px-2 py-1 text-xs resize-none focus:outline-none focus:border-purple-400"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <HomeButton />
    </div>
  );
}
