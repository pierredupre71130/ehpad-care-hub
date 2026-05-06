'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X, Printer, Eye } from 'lucide-react';
import { useModuleAccess } from '@/lib/use-module-access';
import { useAuth } from '@/lib/auth-context';
import { useEffectiveRole } from '@/lib/use-effective-role';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────
// HEADER COMPONENTS
// ─────────────────────────────────────────────────────────────

const NODES: [number, number][] = [
  [60,80],[180,30],[320,110],[480,55],[630,130],[790,40],[940,105],[1100,25],[1260,90],[1420,50],
  [100,220],[250,175],[410,240],[570,195],[720,260],[880,185],[1030,245],[1190,170],[1350,230],[1470,195],
  [40,380],[200,340],[360,410],[530,360],[680,420],[840,355],[1000,395],[1160,330],[1320,400],[1460,360],
  [120,540],[280,500],[440,565],[600,510],[760,570],[920,505],[1080,555],[1240,490],[1390,545],[1490,510],
];
const EDGES: [number, number][] = (() => {
  const e: [number, number][] = [];
  for (let i = 0; i < NODES.length; i++)
    for (let j = i + 1; j < NODES.length; j++) {
      const dx = NODES[i][0] - NODES[j][0], dy = NODES[i][1] - NODES[j][1];
      if (dx * dx + dy * dy < 220 * 220) e.push([i, j]);
    }
  return e;
})();

function NetworkBackground() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 1500 600" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      {EDGES.map(([i, j], idx) => (
        <line key={idx} x1={NODES[i][0]} y1={NODES[i][1]} x2={NODES[j][0]} y2={NODES[j][1]}
          stroke="#8aabcc" strokeWidth="0.7" strokeOpacity="0.3" />
      ))}
      {NODES.map(([x, y], idx) => (
        <circle key={idx} cx={x} cy={y} r="3" fill="#8aabcc" fillOpacity="0.4" />
      ))}
    </svg>
  );
}

function CaduceusIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="19" cy="19" r="18" fill="white" fillOpacity="0.15" />
      <line x1="19" y1="5" x2="19" y2="33" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <path d="M13 9.5 Q10 5 14 4 Q17 3 19 6 Q21 3 24 4 Q28 5 25 9.5" stroke="white" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      <path d="M19 10 Q13 13.5 15 17 Q17 20 19 19 Q21 18 23 21 Q25 24.5 19 28" stroke="white" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      <path d="M19 10 Q25 13.5 23 17 Q21 20 19 19 Q17 18 15 21 Q13 24.5 19 28" stroke="white" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

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
    .eq('archived', false)
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
  options, value, onChange, colorFn, readOnly,
}: {
  options: string[];
  value: string | undefined | null;
  onChange: (v: string | null) => void;
  colorFn: (v: string) => string;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => !readOnly && onChange(value === opt ? null : opt)}
          disabled={readOnly}
          className={cn(
            'px-2 py-0.5 rounded text-xs font-bold border transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
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

// Champs autorisés par rôle (null = tous les champs autorisés)
const ROLE_ALLOWED_FIELDS: Record<string, string[] | null> = {
  secretaire: ['gir', 'appel_nuit', 'appel_nuit_info', 'pompes_funebres'],
  cadre:      ['gir', 'appel_nuit', 'appel_nuit_info', 'pompes_funebres'],
  medecin:    ['niveau_soin'],
};

export default function GIRNiveauSoinPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const access = useModuleAccess('girNiveauSoin');
  const readOnly = access === 'read';
  const effectiveRole = useEffectiveRole();

  // Restriction par champ selon le rôle effectif (tient compte du rôle simulé par l'admin)
  const allowedFields = effectiveRole ? (ROLE_ALLOWED_FIELDS[effectiveRole] ?? null) : null;
  const canEdit = useCallback((field: string): boolean => {
    if (readOnly) return false;
    if (allowedFields === null) return true; // tous les champs autorisés
    return allowedFields.includes(field);
  }, [readOnly, allowedFields]);

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

  if (loadingResidents || loadingNiveaux) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <header className="print:hidden relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}>
        <div className="absolute inset-0 pointer-events-none"><NetworkBackground /></div>
        <div className="relative z-10 max-w-6xl mx-auto px-6 py-5">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <span>›</span>
            <span className="text-white/75">GIR / Niveau de soin / Appel Nuit</span>
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <CaduceusIcon />
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight leading-none">
                  GIR / Niveau de soin / Appel Nuit
                </h1>
                <p className="text-sm text-white/60 mt-0.5">Résidence La Fourrier</p>
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 bg-white text-slate-800 hover:bg-white/90 rounded-xl px-4 py-2 text-sm font-semibold shadow-md transition-colors"
            >
              <Printer className="h-4 w-4" /> Imprimer
            </button>
          </div>
        </div>
      </header>

      {/* ══ VERSION IMPRESSION ══════════════════════════════════ */}
      <div className="hidden print:block" style={{ padding: '6mm', fontFamily: 'Arial, sans-serif', color: '#0f172a' }}>
        {/* En-tête */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(90deg,#581c87,#7c3aed)',
          color: 'white', padding: '8px 14px', borderRadius: '6px', marginBottom: '8px',
        }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.02em' }}>
              GIR · Niveau de soin · Appel nuit
            </div>
            <div style={{ fontSize: '9px', opacity: 0.85, marginTop: '1px' }}>
              EHPAD Care Hub — Récapitulatif des résidents
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '9px', opacity: 0.9 }}>
            <div><b>{sorted.length}</b> résidents</div>
            <div>Imprimé le {new Date().toLocaleDateString('fr-FR')}</div>
          </div>
        </div>

        {/* Tableau */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '4%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '21%' }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#1e1b4b', color: 'white' }}>
              {['#', 'Résident', 'Chambre', 'GIR', 'Niveau soin', 'Appel nuit', 'Info appel nuit', 'Pompes funèbres'].map((h, i) => (
                <th key={h} style={{
                  border: '1px solid #1e1b4b', padding: '5px 7px',
                  textAlign: i === 1 || i === 6 || i === 7 ? 'left' : 'center',
                  fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, idx) => {
              const rec = getRec(r.id);
              const girMap: Record<string, string> = {
                '1': '#ef4444', '2': '#fb923c', '3': '#facc15', '4': '#4ade80', 'N/A': '#64748b',
              };
              const girBg = girMap[rec.gir] ?? '#e2e8f0';
              const girFg = ['3'].includes(rec.gir) ? '#0f172a' : 'white';

              const niveauMap: Record<string, string> = {
                A: '#2563eb', B: '#60a5fa', C: '#818cf8', D: '#c7d2fe', 'En cours': '#fbbf24',
              };
              const niveauBg = niveauMap[rec.niveau_soin] ?? '#e2e8f0';
              const niveauFg = ['D', 'En cours'].includes(rec.niveau_soin) ? '#0f172a' : 'white';

              const appelBg = rec.appel_nuit === true ? '#dc2626' : rec.appel_nuit === false ? '#16a34a' : '#cbd5e1';
              const appelTxt = rec.appel_nuit === true ? 'OUI' : rec.appel_nuit === false ? 'Non' : '—';

              const badge = (txt: string, bg: string, fg: string) =>
                <span style={{
                  display: 'inline-block', minWidth: '26px', padding: '2px 7px',
                  background: bg, color: fg, borderRadius: '10px',
                  fontWeight: 700, fontSize: '10.5px', letterSpacing: '0.02em',
                }}>{txt || '—'}</span>;

              return (
                <tr key={r.id} style={{ background: idx % 2 === 0 ? 'white' : '#f8fafc', pageBreakInside: 'avoid' }}>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px 7px', textAlign: 'center', color: '#94a3b8', fontSize: '9px' }}>{idx + 1}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px 7px', fontWeight: 600 }}>
                    {r.title} {r.last_name?.toUpperCase()} <span style={{ fontWeight: 400 }}>{r.first_name ?? ''}</span>
                  </td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px 7px', textAlign: 'center', fontWeight: 600 }}>{r.room}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px 7px', textAlign: 'center' }}>{badge(rec.gir, girBg, girFg)}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px 7px', textAlign: 'center' }}>{badge(rec.niveau_soin, niveauBg, niveauFg)}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px 7px', textAlign: 'center' }}>{badge(appelTxt, appelBg, 'white')}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px 7px', fontSize: '10px', color: rec.appel_nuit_info ? '#0f172a' : '#cbd5e1' }}>
                    {rec.appel_nuit_info || '—'}
                  </td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '4px 7px', fontSize: '10px', color: rec.pompes_funebres ? '#0f172a' : '#cbd5e1' }}>
                    {rec.pompes_funebres || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Légende */}
        <div style={{
          marginTop: '10px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          pageBreakInside: 'avoid',
        }}>
          {/* GIR */}
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '5px', padding: '8px 10px', fontSize: '9px', background: '#fafafa' }}>
            <div style={{ fontWeight: 700, marginBottom: '5px', color: '#1e1b4b', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Légende GIR
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', lineHeight: 1.4 }}>
              {[
                { v: '1', bg: '#ef4444', fg: 'white', txt: 'Très dépendant' },
                { v: '2', bg: '#fb923c', fg: 'white', txt: 'Dépendant' },
                { v: '3', bg: '#facc15', fg: '#0f172a', txt: 'Moyennement dép.' },
                { v: '4', bg: '#4ade80', fg: 'white', txt: 'Peu dépendant' },
                { v: 'N/A', bg: '#64748b', fg: 'white', txt: 'Non renseigné' },
              ].map(g => (
                <div key={g.v} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{
                    background: g.bg, color: g.fg, fontWeight: 700,
                    padding: '1px 6px', borderRadius: '8px', fontSize: '9px',
                  }}>{g.v}</span>
                  <span>{g.txt}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Niveau de soin */}
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '5px', padding: '8px 10px', fontSize: '9px', background: '#fafafa' }}>
            <div style={{ fontWeight: 700, marginBottom: '5px', color: '#1e1b4b', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Légende Niveau de soin
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: 1.4 }}>
              {[
                { v: 'A', bg: '#2563eb', fg: 'white', txt: 'Prolonger la vie par tous les soins nécessaires' },
                { v: 'B', bg: '#60a5fa', fg: 'white', txt: 'Prolonger la vie par des soins limités' },
                { v: 'C', bg: '#818cf8', fg: 'white', txt: 'Assurer le confort prioritairement à prolonger la vie' },
                { v: 'D', bg: '#c7d2fe', fg: '#0f172a', txt: 'Assurer le confort sans viser à prolonger la vie' },
              ].map(n => (
                <div key={n.v} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{
                    background: n.bg, color: n.fg, fontWeight: 700,
                    padding: '1px 7px', borderRadius: '8px', fontSize: '9px', minWidth: '16px', textAlign: 'center',
                  }}>{n.v}</span>
                  <span>{n.txt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{
          marginTop: '6px', fontSize: '8.5px', fontStyle: 'italic',
          color: '#475569', textAlign: 'center', pageBreakInside: 'avoid',
        }}>
          En dehors du niveau de soins indiqué, le médecin contacté définira la conduite à tenir.
        </div>

        <style>{`@page { size: A4 landscape; margin: 6mm; } @media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
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
              <ToggleGroup options={GIR_OPTIONS} value={getRec(r.id).gir} onChange={v => { updateField(r, 'gir', v); }} colorFn={girColor} readOnly={!canEdit('gir')} />
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
              <ToggleGroup options={NIVEAU_OPTIONS} value={getRec(r.id).niveau_soin} onChange={v => updateField(r, 'niveau_soin', v)} colorFn={niveauColor} readOnly={!canEdit('niveau_soin')} />
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
                <button onClick={() => updateField(r, 'appel_nuit', true)} disabled={!canEdit('appel_nuit')} className="px-2 py-0.5 rounded text-xs font-bold border border-red-500 bg-white text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed">Oui</button>
                <button onClick={() => updateField(r, 'appel_nuit', false)} disabled={!canEdit('appel_nuit')} className="px-2 py-0.5 rounded text-xs font-bold border border-green-500 bg-white text-green-500 hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed">Non</button>
              </div>
            </div>
          ))}
        </SummaryModal>
      )}

      {/* ══ LECTURE SEULE ═══════════════════════════════════════ */}
      {readOnly && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mx-4 mb-2 mt-4 text-sm text-blue-700 font-medium print:hidden">
          <Eye className="h-4 w-4 flex-shrink-0" />
          Vous consultez cette page en lecture seule.
        </div>
      )}

      {/* ══ RESTRICTIONS PAR CHAMP ══════════════════════════════ */}
      {!readOnly && allowedFields !== null && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mx-4 mb-2 mt-4 text-sm text-amber-700 font-medium print:hidden">
          <Eye className="h-4 w-4 flex-shrink-0" />
          {(effectiveRole === 'secretaire' || effectiveRole === 'cadre') && 'Vous pouvez modifier le GIR, l\'appel de nuit et les pompes funèbres. Le niveau de soin est réservé au médecin.'}
          {effectiveRole === 'medecin' && 'Vous pouvez modifier uniquement le niveau de soin. Les autres champs sont gérés par l\'équipe soignante.'}
        </div>
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
                      readOnly={!canEdit('gir')}
                    />
                  </td>

                  {/* Niveau de soin */}
                  <td className="border border-slate-300 px-2 py-1.5 text-sm">
                    <ToggleGroup
                      options={NIVEAU_OPTIONS}
                      value={rec.niveau_soin}
                      onChange={v => updateField(r, 'niveau_soin', v)}
                      colorFn={niveauColor}
                      readOnly={!canEdit('niveau_soin')}
                    />
                  </td>

                  {/* Appel de nuit */}
                  <td className="border border-slate-300 px-2 py-1.5 text-sm">
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-1">
                        <button
                          onClick={() => updateField(r, 'appel_nuit', true)}
                          disabled={!canEdit('appel_nuit')}
                          className={cn(
                            'px-2 py-0.5 rounded text-xs font-bold border transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
                            rec.appel_nuit === true
                              ? 'bg-red-500 text-white border-red-500'
                              : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
                          )}
                        >Oui</button>
                        <button
                          onClick={() => updateField(r, 'appel_nuit', false)}
                          disabled={!canEdit('appel_nuit')}
                          className={cn(
                            'px-2 py-0.5 rounded text-xs font-bold border transition-colors disabled:opacity-60 disabled:cursor-not-allowed',
                            rec.appel_nuit === false
                              ? 'bg-green-500 text-white border-green-500'
                              : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50'
                          )}
                        >Non</button>
                      </div>
                      {rec.appel_nuit === true && (
                        <textarea
                          value={rec.appel_nuit_info ?? ''}
                          onChange={e => canEdit('appel_nuit_info') && updateField(r, 'appel_nuit_info', e.target.value)}
                          onBlur={e => canEdit('appel_nuit_info') && doUpdate(r, 'appel_nuit_info', e.target.value)}
                          placeholder="Informations..."
                          rows={2}
                          readOnly={!canEdit('appel_nuit_info')}
                          className="w-full border border-slate-200 rounded px-2 py-1 text-xs resize-none focus:outline-none focus:border-purple-400 read-only:bg-slate-50 read-only:cursor-default"
                        />
                      )}
                    </div>
                  </td>

                  {/* Pompes funèbres */}
                  <td className="border border-slate-300 px-2 py-1.5 text-sm">
                    <textarea
                      value={rec.pompes_funebres ?? ''}
                      onChange={e => canEdit('pompes_funebres') && setLocalUpdates(prev => ({
                        ...prev,
                        [r.id]: { ...(prev[r.id] ?? {}), pompes_funebres: e.target.value },
                      }))}
                      onBlur={e => canEdit('pompes_funebres') && doUpdate(r, 'pompes_funebres', e.target.value)}
                      placeholder="Nom, coordonnées..."
                      rows={2}
                      readOnly={!canEdit('pompes_funebres')}
                      className="w-full border border-slate-200 rounded px-2 py-1 text-xs resize-none focus:outline-none focus:border-purple-400 read-only:bg-slate-50 read-only:cursor-default"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
