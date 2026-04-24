'use client';

/*
  SQL à exécuter dans Supabase (SQL Editor) si la table n'existe pas encore :

  DROP TABLE IF EXISTS suivi_antalgique;
  CREATE TABLE suivi_antalgique (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id uuid,
    nom         text NOT NULL,
    chambre     text NOT NULL DEFAULT '',
    floor       text NOT NULL DEFAULT '',
    medecin     text NOT NULL DEFAULT '',
    traitement  text NOT NULL,
    type_suivi  text NOT NULL DEFAULT 'calendrier',
    date_debut  date,
    date_fin    date,
    no_end      boolean NOT NULL DEFAULT false,
    poso_matin  boolean NOT NULL DEFAULT false,
    poso_midi   boolean NOT NULL DEFAULT false,
    poso_soir   boolean NOT NULL DEFAULT false,
    dotation_nominative boolean NOT NULL DEFAULT false,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
  );
*/

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Trash2, Printer, Pill, ChevronRight, ArrowLeft, Eye } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fetchColorOverrides, darkenHex, type ColorOverrides } from '@/lib/module-colors';
import { MODULES } from '@/components/dashboard/module-config';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useModuleAccess } from '@/lib/use-module-access';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Resident {
  id: string;
  first_name: string;
  last_name: string;
  title?: string;
  room: string;
  floor: 'RDC' | '1ER';
  medecin?: string;
  archived?: boolean;
}

interface SuiviAntalgique {
  id: string;
  resident_id: string | null;
  nom: string;
  chambre: string;
  floor: string;
  medecin: string;
  traitement: string;
  type_suivi: 'calendrier' | 'posologie';
  date_debut: string | null;
  date_fin: string | null;
  no_end: boolean;
  poso_matin: boolean;
  poso_midi: boolean;
  poso_soir: boolean;
  dotation_nominative: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TRAITEMENTS = [
  'Durogesic 12 µg/h',
  'Durogesic 25 µg/h',
  'Durogesic 50 µg/h',
  'Durogesic 75 µg/h',
  'Oxycodone LP 10 mg',
];

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function fetchFiches(): Promise<SuiviAntalgique[]> {
  const sb = createClient();
  const { data, error } = await sb.from('suivi_antalgique').select('*').order('nom');
  if (error) throw error;
  return data ?? [];
}

async function fetchResidents(): Promise<Resident[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('residents')
    .select('id,first_name,last_name,title,room,floor,medecin,archived')
    .eq('archived', false)
    .order('last_name');
  if (error) throw error;
  return data ?? [];
}

// ── Calendar / sheet helpers ──────────────────────────────────────────────────

interface CalRow { date: Date; isEnd: boolean }

function generateCalendarRows(dateDebut: string, dateFin: string | null, noEnd: boolean): CalRow[] {
  const rows: CalRow[] = [];
  const current = new Date(dateDebut + 'T00:00:00');
  const finDate = dateFin && !noEnd ? new Date(dateFin + 'T23:59:59') : null;
  for (let i = 0; i < 15; i++) {
    if (finDate && current > finDate) { rows.push({ date: new Date(current), isEnd: true }); break; }
    rows.push({ date: new Date(current), isEnd: false });
    current.setDate(current.getDate() + 3);
  }
  return rows;
}

function formatDateFR(d: Date): string {
  const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Print sheet ───────────────────────────────────────────────────────────────

function ResidentSheet({ fiche }: { fiche: SuiviAntalgique | null }) {
  if (!fiche || !fiche.nom.trim()) return null;
  const isCalendrier = fiche.type_suivi === 'calendrier';
  const isPosologie  = fiche.type_suivi === 'posologie';
  if (isCalendrier && !fiche.date_debut) return null;
  if (isPosologie && !fiche.poso_matin && !fiche.poso_midi && !fiche.poso_soir) return null;

  const sheetTitle = isCalendrier ? 'SUIVI DE POSE' : "SUIVI D'ADMINISTRATION";
  const calRows = isCalendrier ? generateCalendarRows(fiche.date_debut!, fiche.date_fin, fiche.no_end) : [];

  let finText = '';
  if (isCalendrier) {
    if (fiche.no_end) finText = 'Pas de date de fin';
    else if (fiche.date_fin) finText = `Jusqu'au ${new Date(fiche.date_fin + 'T23:59:59').toLocaleDateString('fr-FR')}`;
    else finText = 'Non spécifiée';
  }

  return (
    <div id="resident-sheet" className="bg-white" style={{ padding: '20mm 18mm 18mm 18mm', minHeight: '270mm', fontFamily: 'Arial, Helvetica, sans-serif' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '18px' }}>
        <h3 style={{ fontSize: '2em', margin: 0, fontWeight: 800, letterSpacing: '0.05em' }}>{sheetTitle}</h3>
        <h4 style={{ fontSize: '1.6em', margin: '8px 0 0 0', fontWeight: 'bold', color: '#005a9c', backgroundColor: '#ffe0b2', padding: '4px 12px', borderRadius: '6px', display: 'inline-block' }}>
          {fiche.nom.toUpperCase()} — Chambre {fiche.chambre || 'N/A'}
        </h4>
      </div>

      {/* Info */}
      <div className="sheet-info" style={{ fontSize: '1.1em', lineHeight: 1.75, marginBottom: '22px', borderTop: '2px solid #000', borderBottom: '2px solid #000', padding: '12px 0' }}>
        {fiche.dotation_nominative && (
          <div className="dotation-box" style={{ color: '#d9534f', fontWeight: 'bold', fontSize: '1.25em', textAlign: 'center', marginBottom: '10px', padding: '5px 10px', border: '2px solid #d9534f', borderRadius: '5px' }}>
            DOTATION NOMINATIVE
          </div>
        )}
        <div><strong>Traitement :</strong> <span style={{ fontWeight: 'bold', color: '#d9534f' }}>{fiche.traitement}</span></div>
        {isCalendrier && <div><strong>Fin de prescription :</strong> <strong>{finText}</strong></div>}
        {isPosologie && (
          <div><strong>Posologie :</strong> {[fiche.poso_matin && 'Matin', fiche.poso_midi && 'Midi', fiche.poso_soir && 'Soir'].filter(Boolean).join(', ')}</div>
        )}
        <div><strong>Prescripteur :</strong> {fiche.medecin || 'Non spécifié'}</div>
      </div>

      {/* Calendar */}
      {isCalendrier && (
        <table className="cal-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {calRows.map((row, i) => (
              <tr key={i}>
                <td className="cal-cell" style={{ border: '1px solid #666', padding: '12px 15px', textAlign: 'center', fontSize: '1.35em', fontWeight: 'bold', ...(row.isEnd ? { backgroundColor: '#fff0f0', color: '#d9534f', fontStyle: 'italic' } : {}) }}>
                  {row.isEnd ? '— FIN DE LA PRESCRIPTION —' : formatDateFR(row.date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Posologie */}
      {isPosologie && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Matin (8h)', 'Midi (12h)', 'Soir (18h)'].map(h => (
                <th key={h} className="poso-th" style={{ border: '1px solid #666', padding: '12px', textAlign: 'center', backgroundColor: '#f2f2f2', fontWeight: 'bold', fontSize: '1.35em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {[fiche.poso_matin, fiche.poso_midi, fiche.poso_soir].map((active, i) => (
                <td key={i} className="poso-td" style={{ border: '1px solid #666', padding: '12px', textAlign: 'center', height: '80px', fontSize: '2.4em', fontWeight: 'bold', color: '#333', verticalAlign: 'middle', ...(active ? {} : { backgroundColor: '#e9ecef', backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.1) 5px, rgba(0,0,0,0.1) 10px)' }) }}>
                  {active ? 'X' : ''}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}

      {/* Signature */}
      <div className="sig-box" style={{ marginTop: '36px', paddingTop: '18px', borderTop: '2px solid #000' }}>
        {['Date :', 'Validation et Signature du Prescripteur :'].map(label => (
          <div key={label} className="sig-field" style={{ marginTop: '22px' }}>
            <div style={{ fontSize: '1.05em', fontWeight: 'bold', color: '#333' }}>{label}</div>
            <div className="sig-line" style={{ height: '36px', borderBottom: '1px solid #888', marginTop: '4px' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Wizard form ───────────────────────────────────────────────────────────────

type WizardStep = 'floor' | 'resident' | 'details';

interface WizardState {
  floor: 'RDC' | '1ER' | null;
  residentId: string | null;
  nom: string;
  chambre: string;
  medecin: string;
  traitement: string;
  type_suivi: 'calendrier' | 'posologie';
  date_debut: string;
  date_fin: string;
  no_end: boolean;
  poso_matin: boolean;
  poso_midi: boolean;
  poso_soir: boolean;
  dotation_nominative: boolean;
}

const EMPTY_WIZARD: WizardState = {
  floor: null, residentId: null,
  nom: '', chambre: '', medecin: '',
  traitement: TRAITEMENTS[0],
  type_suivi: 'calendrier',
  date_debut: '', date_fin: '', no_end: false,
  poso_matin: false, poso_midi: false, poso_soir: false,
  dotation_nominative: false,
};

function WizardForm({
  residents,
  wizard,
  setWizard,
  onSave,
  isSaving,
  onCancel,
}: {
  residents: Resident[];
  wizard: WizardState;
  setWizard: React.Dispatch<React.SetStateAction<WizardState>>;
  onSave: () => void;
  isSaving: boolean;
  onCancel: () => void;
}) {
  const step: WizardStep =
    wizard.floor === null ? 'floor' :
    wizard.residentId === null ? 'resident' :
    'details';

  const floorResidents = useMemo(
    () => residents.filter(r => r.floor === wizard.floor).sort((a, b) => a.last_name.localeCompare(b.last_name, 'fr')),
    [residents, wizard.floor]
  );

  const canSave = useMemo(() => {
    if (!wizard.residentId) return false;
    if (wizard.type_suivi === 'calendrier') return !!wizard.date_debut;
    return wizard.poso_matin || wizard.poso_midi || wizard.poso_soir;
  }, [wizard]);

  return (
    <div className="flex flex-col gap-4">

      {/* Cancel */}
      <div className="flex items-center gap-2">
        <button onClick={onCancel} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Annuler
        </button>
        <span className="text-xs text-slate-300">|</span>
        <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
          {step === 'floor' ? 'Étape 1 — Étage' : step === 'resident' ? 'Étape 2 — Résident' : 'Étape 3 — Prescription'}
        </span>
      </div>

      {/* ── STEP 1 : Floor ── */}
      {step === 'floor' && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-700">Choisir l'étage :</p>
          <div className="grid grid-cols-2 gap-3">
            {(['RDC', '1ER'] as const).map(f => (
              <button
                key={f}
                onClick={() => setWizard(w => ({ ...w, floor: f }))}
                className="py-6 rounded-2xl border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 hover:border-purple-400 text-purple-800 font-bold text-xl transition-all"
              >
                {f === 'RDC' ? 'RDC' : '1er Étage'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 2 : Resident ── */}
      {step === 'resident' && (
        <div className="space-y-3">
          {/* Floor badge + change */}
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 bg-purple-100 text-purple-800 text-xs font-bold px-3 py-1.5 rounded-full">
              {wizard.floor === 'RDC' ? 'RDC' : '1er Étage'}
            </span>
            <button onClick={() => setWizard(w => ({ ...w, floor: null }))} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              Changer d'étage
            </button>
          </div>
          <p className="text-sm font-semibold text-slate-700">Choisir le résident :</p>
          {floorResidents.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Aucun résident actif à cet étage</p>
          ) : (
            <select
              defaultValue=""
              onChange={e => {
                const r = floorResidents.find(r => r.id === e.target.value);
                if (!r) return;
                const fullName = [r.title, r.first_name, r.last_name].filter(Boolean).join(' ');
                setWizard(w => ({
                  ...w,
                  residentId: r.id,
                  nom: fullName,
                  chambre: r.room ?? '',
                  medecin: r.medecin ?? '',
                }));
              }}
              className="w-full px-3 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 bg-white text-sm"
            >
              <option value="" disabled>— Sélectionner un résident —</option>
              {floorResidents.map(r => (
                <option key={r.id} value={r.id}>
                  {r.last_name.toUpperCase()} {r.first_name} — Ch. {r.room}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ── STEP 3 : Details ── */}
      {step === 'details' && (
        <div className="space-y-4">

          {/* Resident info card */}
          <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex items-start justify-between gap-2">
            <div>
              <p className="font-bold text-purple-900 text-sm">{wizard.nom}</p>
              <p className="text-xs text-purple-600 mt-0.5">Chambre {wizard.chambre} · {wizard.floor}</p>
              {wizard.medecin && <p className="text-xs text-slate-500 mt-0.5">{wizard.medecin}</p>}
            </div>
            <button
              onClick={() => setWizard(w => ({ ...w, residentId: null, nom: '', chambre: '', medecin: '' }))}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors shrink-0 mt-0.5"
            >
              Changer
            </button>
          </div>

          {/* Type de suivi */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Type de suivi</label>
            <div className="grid grid-cols-2 gap-2">
              {([['calendrier', '📅 Calendrier (Patchs)'], ['posologie', '💊 Posologie Simple']] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setWizard(w => ({ ...w, type_suivi: val }))}
                  className={cn(
                    'py-2.5 px-2 rounded-xl text-xs font-semibold border-2 transition-all',
                    wizard.type_suivi === val
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Calendrier fields */}
          {wizard.type_suivi === 'calendrier' && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Date de première pose <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={wizard.date_debut}
                  onChange={e => setWizard(w => ({ ...w, date_debut: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Date de fin de prescription</label>
                <input
                  type="date"
                  value={wizard.date_fin}
                  disabled={wizard.no_end}
                  onChange={e => setWizard(w => ({ ...w, date_fin: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wizard.no_end}
                  onChange={e => setWizard(w => ({ ...w, no_end: e.target.checked, date_fin: e.target.checked ? '' : w.date_fin }))}
                  className="w-4 h-4 accent-purple-600"
                />
                <span className="text-sm text-slate-600">Pas de date de fin</span>
              </label>
            </div>
          )}

          {/* Posologie fields */}
          {wizard.type_suivi === 'posologie' && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-xs font-bold text-slate-600 mb-3 uppercase tracking-wide">Moments de prise <span className="text-red-500">*</span></p>
              <div className="grid grid-cols-3 gap-2">
                {([['poso_matin', 'Matin'], ['poso_midi', 'Midi'], ['poso_soir', 'Soir']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setWizard(w => ({ ...w, [key]: !w[key] }))}
                    className={cn(
                      'py-3 rounded-xl text-sm font-bold border-2 transition-all',
                      wizard[key]
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-purple-300'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Traitement */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">Traitement</label>
            <select
              value={wizard.traitement}
              onChange={e => setWizard(w => ({ ...w, traitement: e.target.value }))}
              className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-purple-400 bg-white text-sm"
            >
              {TRAITEMENTS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Dotation Nominative */}
          <label className={cn(
            'flex items-center gap-3 cursor-pointer rounded-xl px-4 py-3 border-2 transition-all',
            wizard.dotation_nominative
              ? 'bg-red-50 border-red-400'
              : 'bg-white border-slate-200 hover:border-red-300'
          )}>
            <input
              type="checkbox"
              checked={wizard.dotation_nominative}
              onChange={e => setWizard(w => ({ ...w, dotation_nominative: e.target.checked }))}
              className="w-4 h-4 accent-red-600"
            />
            <span className={cn('text-sm font-semibold', wizard.dotation_nominative ? 'text-red-700' : 'text-slate-600')}>
              Dotation Nominative
            </span>
          </label>

          {/* Save */}
          <button
            onClick={onSave}
            disabled={!canSave || isSaving}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors text-sm"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Enregistrement…' : 'Enregistrer et afficher'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Network background (header) ───────────────────────────────────────────────

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

// ── Dense page background network ────────────────────────────────────────────
const PG_NODES: [number, number][] = (() => {
  const pts: [number, number][] = [];
  const cols = 16, rows = 11;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.round((c / (cols - 1)) * 1500);
      const y = Math.round((r / (rows - 1)) * 1000);
      const ox = ((c * 7 + r * 13) % 50) - 25;
      const oy = ((r * 11 + c * 17) % 50) - 25;
      pts.push([Math.max(0, Math.min(1500, x + ox)), Math.max(0, Math.min(1000, y + oy))]);
    }
  }
  return pts;
})();
const PG_EDGES: [number, number][] = (() => {
  const e: [number, number][] = [];
  for (let i = 0; i < PG_NODES.length; i++)
    for (let j = i + 1; j < PG_NODES.length; j++) {
      const dx = PG_NODES[i][0] - PG_NODES[j][0], dy = PG_NODES[i][1] - PG_NODES[j][1];
      if (dx * dx + dy * dy < 160 * 160) e.push([i, j]);
    }
  return e;
})();

// ── Page principale ───────────────────────────────────────────────────────────

type PanelMode = 'list' | 'new' | 'view';

export default function MorphiniquesPage() {
  const qc = useQueryClient();
  const access = useModuleAccess('morphiniques');
  const readOnly = access === 'read';

  const { data: colorOverrides = {} } = useQuery<ColorOverrides>({
    queryKey: ['settings', 'module_colors'],
    queryFn: fetchColorOverrides,
    staleTime: 30000,
  });
  const morphModule = MODULES.find(m => m.id === 'morphiniques');
  const colorFrom = colorOverrides['morphiniques']?.from ?? morphModule?.cardFrom ?? '#7725cc';
  const colorTo   = colorOverrides['morphiniques']?.to   ?? morphModule?.cardTo   ?? '#5210a0';

  const { data: fiches = [], isLoading: loadingFiches } = useQuery({ queryKey: ['suivi_antalgique'], queryFn: fetchFiches });
  const { data: residents = [] } = useQuery({ queryKey: ['residents'], queryFn: fetchResidents });

  const [panelMode, setPanelMode] = useState<PanelMode>('list');
  const [selectedFiche, setSelectedFiche] = useState<SuiviAntalgique | null>(null);
  const [wizard, setWizard] = useState<WizardState>(EMPTY_WIZARD);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nom: string } | null>(null);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (w: WizardState) => {
      const sb = createClient();
      const payload = {
        resident_id: w.residentId,
        nom: w.nom, chambre: w.chambre, floor: w.floor ?? '',
        medecin: w.medecin, traitement: w.traitement,
        type_suivi: w.type_suivi,
        date_debut: w.date_debut || null, date_fin: w.date_fin || null, no_end: w.no_end,
        poso_matin: w.poso_matin, poso_midi: w.poso_midi, poso_soir: w.poso_soir,
        dotation_nominative: w.dotation_nominative,
        updated_at: new Date().toISOString(),
      };
      // check if editing existing
      const editing = fiches.find(f => f.resident_id === w.residentId);
      if (editing) {
        const { error } = await sb.from('suivi_antalgique').update(payload).eq('id', editing.id);
        if (error) throw new Error(error.message);
        return editing.id;
      }
      const { data, error } = await sb.from('suivi_antalgique').insert(payload).select('id').single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    onSuccess: async (id: string) => {
      await qc.invalidateQueries({ queryKey: ['suivi_antalgique'] });
      // load the saved fiche into view
      const sb = createClient();
      const { data } = await sb.from('suivi_antalgique').select('*').eq('id', id).single();
      if (data) setSelectedFiche(data);
      setPanelMode('view');
      toast.success('Fiche enregistrée');
    },
    onError: (e: Error) => toast.error(`Erreur : ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const sb = createClient();
      const { error } = await sb.from('suivi_antalgique').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suivi_antalgique'] });
      if (selectedFiche?.id === deleteTarget?.id) { setSelectedFiche(null); setPanelMode('list'); }
      setDeleteTarget(null);
      toast.success('Fiche supprimée');
    },
    onError: (e: Error) => toast.error(`Erreur : ${e.message}`),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const startNew = () => { setWizard(EMPTY_WIZARD); setPanelMode('new'); };

  const loadFiche = (f: SuiviAntalgique) => { setSelectedFiche(f); setPanelMode('view'); };

  const handleSave = () => saveMutation.mutate(wizard);

  const handlePrint = () => window.print();

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          * { visibility: hidden; }
          #morphiniques-print-area, #morphiniques-print-area * { visibility: visible; }
          #morphiniques-print-area { position: absolute; top: 0; left: 0; width: 100%; }

          #resident-sheet {
            box-shadow: none !important;
            border: none !important;
            padding: 8mm 10mm !important;
            min-height: unset !important;
            height: 277mm !important;
            display: flex !important;
            flex-direction: column !important;
          }

          /* Titre */
          #resident-sheet h3 { font-size: 1.6em !important; margin: 0 0 2px 0 !important; }
          #resident-sheet h4 { font-size: 1.2em !important; margin: 2px 0 0 0 !important; padding: 3px 10px !important; }

          /* Bloc infos */
          #resident-sheet .sheet-info {
            font-size: 0.85em !important;
            line-height: 1.5 !important;
            margin-bottom: 4px !important;
            padding: 6px 0 !important;
            flex-shrink: 0 !important;
          }

          /* Calendrier : le tableau prend tout l'espace restant */
          #resident-sheet .cal-table {
            flex: 1 !important;
            border-collapse: collapse !important;
          }
          #resident-sheet .cal-table tbody { height: 100% !important; }
          #resident-sheet .cal-cell {
            font-size: 1em !important;
            padding: 0 !important;
            text-align: center !important;
          }

          /* Posologie */
          #resident-sheet .poso-th { padding: 8px !important; font-size: 1.1em !important; }
          #resident-sheet .poso-td { height: 60px !important; font-size: 2em !important; }

          /* Signature */
          #resident-sheet .sig-box { margin-top: 6mm !important; padding-top: 4mm !important; flex-shrink: 0 !important; }
          #resident-sheet .sig-field { margin-top: 6mm !important; }
          #resident-sheet .sig-line { height: 16px !important; }

          @page { size: A4 portrait; margin: 6mm; }
        }
      ` }} />

      <div className="min-h-screen flex flex-col relative" style={{ background: '#dde4ee' }}>
        {/* Dense page background network */}
        <div className="print:hidden" style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5 }}
            viewBox="0 0 1500 1000" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            {PG_EDGES.map(([i, j], idx) => (
              <line key={idx} x1={PG_NODES[i][0]} y1={PG_NODES[i][1]} x2={PG_NODES[j][0]} y2={PG_NODES[j][1]}
                stroke={darkenHex(colorFrom, 30)} strokeWidth="0.8" />
            ))}
            {PG_NODES.map(([x, y], idx) => (
              <circle key={idx} cx={x} cy={y} r="3" fill={darkenHex(colorFrom, 20)} />
            ))}
          </svg>
        </div>

        <div className="relative flex flex-col flex-1" style={{ zIndex: 1 }}>
          {/* ── Gradient Header ── */}
          <header className="print:hidden relative overflow-hidden flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${colorFrom} 0%, ${colorTo} 100%)` }}>
            <div className="absolute inset-0 pointer-events-none"><NetworkBackground /></div>
            <div className="relative z-10 max-w-7xl mx-auto px-6 py-5">
              <div className="flex items-center gap-1.5 text-white/50 text-xs mb-3">
                <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
                <span>›</span>
                <span className="text-white/90">Dispensation Morphiniques</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                  <Pill className="h-6 w-6 text-white" strokeWidth={1.5} />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">Dispensation Morphiniques</h1>
                  <p className="text-white/70 text-sm hidden sm:block">Suivi de pose et d'administration — Durogesic · Oxycodone</p>
                </div>
              </div>
            </div>
          </header>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden" style={{ height: 'calc(100vh - 120px)' }}>

          {/* ── Left panel ── */}
          <div className="flex flex-col bg-white border-r border-slate-200 overflow-y-auto" style={{ width: '420px', minWidth: '360px', flexShrink: 0 }}>

            {panelMode === 'new' ? (
              /* Wizard */
              <div className="p-5">
                <WizardForm
                  residents={residents}
                  wizard={wizard}
                  setWizard={setWizard}
                  onSave={handleSave}
                  isSaving={saveMutation.isPending}
                  onCancel={() => setPanelMode('list')}
                />
              </div>
            ) : (
              /* Fiches list */
              <div className="flex flex-col flex-1 p-4 gap-4">
                {readOnly && (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700 font-medium">
                    <Eye className="h-4 w-4 flex-shrink-0" />
                    Vous consultez cette page en lecture seule.
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Fiches enregistrées</h2>
                  <button
                    onClick={startNew}
                    disabled={readOnly}
                    className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter une fiche
                  </button>
                </div>

                {loadingFiches ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">Chargement…</p>
                ) : fiches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-300">
                    <Pill className="h-12 w-12 opacity-30" />
                    <p className="text-sm font-medium">Aucune fiche enregistrée</p>
                    <button onClick={startNew} disabled={readOnly} className="mt-2 flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      <Plus className="h-4 w-4" /> Ajouter la première fiche
                    </button>
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {fiches.map(f => (
                      <li
                        key={f.id}
                        onClick={() => loadFiche(f)}
                        className={cn(
                          'flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer text-sm transition-colors group border',
                          selectedFiche?.id === f.id && panelMode === 'view'
                            ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                            : 'text-slate-700 border-transparent hover:bg-purple-50 hover:border-purple-200'
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ChevronRight className={cn('h-3.5 w-3.5 shrink-0', selectedFiche?.id === f.id && panelMode === 'view' ? 'text-white' : 'text-slate-300 group-hover:text-purple-400')} />
                          <div className="min-w-0">
                            <div className="font-semibold truncate flex items-center gap-1.5">
                              {f.nom}
                              {f.dotation_nominative && (
                                <span className={cn('text-[10px] font-bold shrink-0', selectedFiche?.id === f.id && panelMode === 'view' ? 'text-red-200' : 'text-red-500')}>DN</span>
                              )}
                            </div>
                            <div className={cn('text-[11px] mt-0.5', selectedFiche?.id === f.id && panelMode === 'view' ? 'text-purple-200' : 'text-slate-400')}>
                              Ch. {f.chambre} · {f.traitement.replace('Durogesic', 'Dur.').replace('Oxycodone LP', 'Oxy.')}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteTarget({ id: f.id, nom: f.nom }); }}
                          disabled={readOnly}
                          className={cn('opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg disabled:hidden', selectedFiche?.id === f.id && panelMode === 'view' ? 'text-red-200 hover:bg-white/20' : 'text-red-400 hover:bg-red-50')}
                          title="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* ── Right panel (preview) ── */}
          <div className="flex-1 overflow-y-auto p-6 flex justify-center" style={{ background: '#e8ecf2' }}>
            {panelMode !== 'view' || !selectedFiche ? (
              <div className="flex flex-col items-center justify-center text-slate-400 gap-4 h-full">
                <Pill className="h-16 w-16 opacity-20" />
                <p className="text-base font-medium">
                  {panelMode === 'new' ? 'Complétez le formulaire pour voir l\'aperçu' : 'Sélectionnez ou créez une fiche'}
                </p>
              </div>
            ) : (
              <div id="morphiniques-print-area" className="w-full" style={{ maxWidth: '210mm' }}>
                <div className="flex items-center justify-between mb-4 print:hidden">
                  <span className="text-sm text-slate-500 font-medium">Aperçu avant impression</span>
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow"
                  >
                    <Printer className="h-4 w-4" />
                    Imprimer
                  </button>
                </div>
                <div className="shadow-xl rounded-lg overflow-hidden border border-slate-200">
                  <ResidentSheet fiche={selectedFiche} />
                </div>
              </div>
            )}
          </div>
        </div>
        </div>{/* fin z-index: 1 */}
      </div>

      {/* ── Delete dialog ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Supprimer la fiche ?</h3>
                <p className="text-sm text-slate-500">Cette action est irréversible.</p>
              </div>
            </div>
            <p className="text-sm text-slate-700 mb-5">
              Fiche de <strong>{deleteTarget.nom}</strong>
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">Annuler</button>
              <button onClick={() => deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending || readOnly} className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors disabled:opacity-60">
                {deleteMutation.isPending ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
