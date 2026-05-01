'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bandage, ChevronRight, Plus, Trash2, Pencil, X,
  ClipboardList, List, Printer, Check,
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useModuleAccess } from '@/lib/use-module-access';
import { useEffectiveRole } from '@/lib/use-effective-role';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PatientRecord {
  id: string;
  chambre: string;
  nom: string;
  prenom: string;
  sexe: 'Femme' | 'Homme';
  product_type: string;
  mesure_a: number | null;
  mesure_b: number | null;
  mesure_c: number | null;
  mesure_d: number | null;
  mesure_e: number | null;
  mesure_f: number | null;
  taille_recommandee: string;
  origine: string;
  date_cmd_1: string | null;
  date_cmd_2: string | null;
  created_at: string;
}

interface SizeEntry {
  size: number;
  cheville: [number, number] | null;
  mollet: [number, number] | null;
  cuisse: [number, number] | null;
}

interface Candidate {
  sizeData: SizeEntry;
  matches: { cheville: boolean; mollet?: boolean; cuisse?: boolean };
}

// ── Grilles de tailles ───────────────────────────────────────────────────────

const SIZE_CHARTS: Record<string, SizeEntry[]> = {
  femme: [
    { size: 0, cheville: [16, 18], mollet: null,    cuisse: null },
    { size: 1, cheville: [18, 20], mollet: [26, 30], cuisse: [38, 44] },
    { size: 2, cheville: [20, 23], mollet: [29, 33], cuisse: [42, 48] },
    { size: 3, cheville: [23, 26], mollet: [32, 37], cuisse: [46, 52] },
    { size: 4, cheville: [26, 29], mollet: [36, 41], cuisse: [50, 56] },
    { size: 5, cheville: [29, 33], mollet: [40, 45], cuisse: [47, 52] },
  ],
  homme: [
    { size: 1, cheville: [19, 21], mollet: [32, 36], cuisse: [50, 60] },
    { size: 2, cheville: [21, 24], mollet: [36, 40], cuisse: [53, 63] },
    { size: 3, cheville: [24, 27], mollet: [40, 44], cuisse: [56, 66] },
    { size: 4, cheville: [27, 30], mollet: [44, 48], cuisse: [59, 69] },
    { size: 5, cheville: [30, 33], mollet: [48, 52], cuisse: [65, 75] },
  ],
};

const PRODUCT_OPTIONS: Record<string, string[]> = {
  Femme:  ['Chaussette (mi-bas)', 'Bas (Bas/collant)'],
  Homme:  ['Chaussette', 'Bas'],
};

// ── Logique de calcul de taille ───────────────────────────────────────────────

function inRange(val: number | null, range: [number, number] | null): boolean {
  if (!range || val === null) return true;
  return val >= range[0] && val <= range[1];
}

type CalcResult =
  | { type: 'perfect'; text: string }
  | { type: 'conflict'; candidates: Candidate[]; patientData: FormData }
  | { type: 'error'; message: string };

interface FormData {
  chambre: string; nom: string; prenom: string;
  sexe: 'Femme' | 'Homme'; productType: string;
  a: number | null; b: number | null; c: number | null;
  d: number | null; e: number | null; f: number | null;
}

function calcHeight(d: number | null, e: number | null): string {
  if (d !== null) return d < 40 ? 'NORMAL' : 'LONG';
  if (e !== null) return e < 72 ? 'NORMAL' : 'LONG';
  return '';
}

function calculateSize(data: FormData): CalcResult {
  const chart = SIZE_CHARTS[data.sexe.toLowerCase()];
  const isBas = data.productType.startsWith('Bas');
  const candidates: Candidate[] = [];

  for (const size of chart) {
    const matches: Candidate['matches'] = { cheville: false };
    let hasMatch = false;
    matches.cheville = inRange(data.a, size.cheville);
    if (size.cheville && matches.cheville) hasMatch = true;
    if (isBas) {
      matches.cuisse = inRange(data.c, size.cuisse);
      if (size.cuisse && matches.cuisse) hasMatch = true;
    } else {
      matches.mollet = inRange(data.b, size.mollet);
      if (size.mollet && matches.mollet) hasMatch = true;
    }
    if (hasMatch) candidates.push({ sizeData: size, matches });
  }

  if (candidates.length === 0) return { type: 'error', message: 'Mesures hors grille' };

  const keys = isBas ? ['cheville', 'cuisse'] : ['cheville', 'mollet'];
  const perfects = candidates.filter(c => keys.every(k => c.matches[k as keyof typeof c.matches] !== false));

  if (perfects.length === 1) {
    const h = calcHeight(data.d, data.e);
    const text = h ? `Taille ${perfects[0].sizeData.size} — ${h}` : `Taille ${perfects[0].sizeData.size}`;
    return { type: 'perfect', text };
  }
  if (candidates.length > 0) return { type: 'conflict', candidates, patientData: data };
  return { type: 'error', message: 'Mesures incohérentes' };
}

function buildMesuresText(d: FormData): string {
  const parts: string[] = [];
  if (d.a !== null) parts.push(`A:${d.a}`);
  if (d.b !== null) parts.push(`B:${d.b}`);
  if (d.c !== null) parts.push(`C:${d.c}`);
  if (d.d !== null) parts.push(`D:${d.d}`);
  if (d.e !== null) parts.push(`E:${d.e}`);
  if (d.f !== null) parts.push(`F:${d.f}`);
  return parts.join(' ');
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

const TABLE = 'bas_contention';

async function fetchPatients(): Promise<PatientRecord[]> {
  const sb = createClient();
  const { data, error } = await sb.from(TABLE).select('*').order('chambre');
  if (error) throw error;
  return (data ?? []) as PatientRecord[];
}

// ── Composant modal conflit ───────────────────────────────────────────────────

function ConflictModal({ candidates, patientData, onChoose, onCancel }: {
  candidates: Candidate[];
  patientData: FormData;
  onChoose: (size: number, origin: string) => void;
  onCancel: () => void;
}) {
  const isBas = patientData.productType.startsWith('Bas');
  const hasNullCriteria = candidates.some(c => isBas ? c.sizeData.cuisse === null : c.sizeData.mollet === null);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800">Conflit de mesures</h3>
          <button onClick={onCancel} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <p className="text-sm font-semibold text-slate-700 mb-3">
          {patientData.nom} {patientData.prenom} — Ch.{patientData.chambre}
        </p>
        {hasNullCriteria && (
          <div className="mb-3 px-3 py-2 bg-amber-50 border-l-4 border-amber-400 rounded text-xs text-amber-800">
            La cheville ({patientData.a}cm) est une valeur charnière. Évaluez la morphologie globale.
          </div>
        )}
        <div className="space-y-2 mb-4">
          {candidates.map(({ sizeData, matches }) => (
            <button
              key={sizeData.size}
              onClick={() => {
                const h = calcHeight(patientData.d, patientData.e);
                const text = h ? `Taille ${sizeData.size} — ${h}` : `Taille ${sizeData.size}`;
                onChoose(sizeData.size, text);
              }}
              className="w-full text-left px-4 py-3 border-2 border-slate-200 hover:border-teal-400 hover:bg-teal-50 rounded-xl transition-colors"
            >
              <p className="font-bold text-slate-800 text-sm">Choisir Taille {sizeData.size}</p>
              <p className={cn('text-xs mt-0.5', matches.cheville ? 'text-green-600' : 'text-red-500')}>
                Cheville : {patientData.a}cm
                {sizeData.cheville && ` (requis ${sizeData.cheville[0]}–${sizeData.cheville[1]}cm)`}
              </p>
              {isBas ? (
                <p className={cn('text-xs', matches.cuisse ? 'text-green-600' : 'text-red-500')}>
                  Cuisse : {patientData.c}cm
                  {sizeData.cuisse && ` (requis ${sizeData.cuisse[0]}–${sizeData.cuisse[1]}cm)`}
                </p>
              ) : (
                <p className={cn('text-xs', matches.mollet ? 'text-green-600' : 'text-red-500')}>
                  Mollet : {patientData.b}cm
                  {sizeData.mollet && ` (requis ${sizeData.mollet[0]}–${sizeData.mollet[1]}cm)`}
                </p>
              )}
            </button>
          ))}
        </div>
        <button onClick={onCancel}
          className="w-full py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition-colors">
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

type Tab = 'ajouter' | 'liste';

export default function BasContentionPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  useModuleAccess('basDeContention');
  const isAdmin = useEffectiveRole() === 'admin';

  const [tab, setTab] = useState<Tab>('ajouter');

  // Form state
  const [chambre,     setChambre]     = useState('');
  const [nom,         setNom]         = useState('');
  const [prenom,      setPrenom]      = useState('');
  const [sexe,        setSexe]        = useState<'Femme' | 'Homme'>('Femme');
  const [productType, setProductType] = useState(PRODUCT_OPTIONS['Femme'][0]);
  const [mesureA, setMesureA] = useState('');
  const [mesureB, setMesureB] = useState('');
  const [mesureC, setMesureC] = useState('');
  const [mesureD, setMesureD] = useState('');
  const [mesureE, setMesureE] = useState('');
  const [mesureF, setMesureF] = useState('');

  // Conflict modal
  const [conflict, setConflict] = useState<{ candidates: Candidate[]; patientData: FormData } | null>(null);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Date editing
  const [editingDate, setEditingDate] = useState<{ id: string; field: 'date_cmd_1' | 'date_cmd_2' } | null>(null);
  const [dateValue, setDateValue] = useState('');

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['bas_contention'],
    queryFn: fetchPatients,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['bas_contention'] });

  const insertMut = useMutation({
    mutationFn: async (row: Omit<PatientRecord, 'id' | 'created_at'>) => {
      const sb = createClient();
      const { error } = await sb.from(TABLE).insert(row);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Patient ajouté'); },
    onError: () => toast.error('Erreur lors de l\'ajout'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const sb = createClient();
      const { error } = await sb.from(TABLE).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setDeleteId(null); toast.success('Supprimé'); },
    onError: () => toast.error('Erreur de suppression'),
  });

  const dateMut = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: string | null }) => {
      const sb = createClient();
      const { error } = await sb.from(TABLE).update({ [field]: value || null, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setEditingDate(null); },
    onError: () => toast.error('Erreur de mise à jour'),
  });

  // ── Champs dynamiques ─────────────────────────────────────────────────────

  const isBas = productType.startsWith('Bas');
  const showFields = useMemo(() => ({
    a: true,
    b: true,
    c: isBas,
    d: !isBas,
    e: isBas,
    f: isBas && sexe === 'Femme',
  }), [isBas, sexe]);

  const handleSexeChange = (s: 'Femme' | 'Homme') => {
    setSexe(s);
    setProductType(PRODUCT_OPTIONS[s][0]);
    resetMesures();
  };

  const handleProductChange = (p: string) => {
    setProductType(p);
    resetMesures();
  };

  const resetMesures = () => {
    setMesureA(''); setMesureB(''); setMesureC('');
    setMesureD(''); setMesureE(''); setMesureF('');
  };

  const resetForm = () => {
    setChambre(''); setNom(''); setPrenom('');
    setSexe('Femme'); setProductType(PRODUCT_OPTIONS['Femme'][0]);
    resetMesures();
  };

  // ── Soumission ────────────────────────────────────────────────────────────

  const doInsert = (data: FormData, taille: string, origine: string) => {
    insertMut.mutate({
      chambre: data.chambre,
      nom: data.nom,
      prenom: data.prenom,
      sexe: data.sexe,
      product_type: data.productType,
      mesure_a: data.a, mesure_b: data.b, mesure_c: data.c,
      mesure_d: data.d, mesure_e: data.e, mesure_f: data.f,
      taille_recommandee: taille,
      origine,
      date_cmd_1: null, date_cmd_2: null,
    });
    resetForm();
    setTab('liste');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: FormData = {
      chambre: chambre.trim(),
      nom: nom.trim().toUpperCase(),
      prenom: prenom.trim().replace(/(^|[-\s])(.)/g, (_, s, l) => s + l.toUpperCase()),
      sexe,
      productType,
      a: mesureA ? parseFloat(mesureA) : null,
      b: mesureB ? parseFloat(mesureB) : null,
      c: mesureC ? parseFloat(mesureC) : null,
      d: mesureD ? parseFloat(mesureD) : null,
      e: mesureE ? parseFloat(mesureE) : null,
      f: mesureF ? parseFloat(mesureF) : null,
    };
    const result = calculateSize(data);
    if (result.type === 'perfect') {
      doInsert(data, result.text, 'Appli');
    } else if (result.type === 'conflict') {
      setConflict({ candidates: result.candidates, patientData: result.patientData });
    } else {
      toast.error(result.message);
    }
  };

  // ── Affichage mesures ─────────────────────────────────────────────────────

  const mesuresText = (p: PatientRecord) => {
    const parts = [];
    if (p.mesure_a) parts.push(`A:${p.mesure_a}`);
    if (p.mesure_b) parts.push(`B:${p.mesure_b}`);
    if (p.mesure_c) parts.push(`C:${p.mesure_c}`);
    if (p.mesure_d) parts.push(`D:${p.mesure_d}`);
    if (p.mesure_e) parts.push(`E:${p.mesure_e}`);
    if (p.mesure_f) parts.push(`F:${p.mesure_f}`);
    return parts.join(' ');
  };

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR');
  };

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>

      {/* Header */}
      <div className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f766e 0%, #0891b2 100%)' }}>
        <div className="relative z-10 max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/90">Bas de Contention</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <Bandage className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">Bas de Contention</h1>
              <p className="text-white/70 text-sm">Calcul de taille · Suivi des commandes</p>
            </div>
            {tab === 'liste' && (
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <Printer className="h-4 w-4" /> Imprimer
              </button>
            )}
          </div>

          {/* Onglets */}
          <div className="flex gap-1 mt-5">
            {([
              { id: 'ajouter', label: 'Calculer / Ajouter', icon: <Plus className="h-3.5 w-3.5" /> },
              { id: 'liste',   label: `Liste (${patients.length})`, icon: <List className="h-3.5 w-3.5" /> },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors',
                  tab === t.id ? 'border-white text-white' : 'border-transparent text-white/50 hover:text-white/80'
                )}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 pb-20">

        {/* ══ TAB : Calculer / Ajouter ══ */}
        {tab === 'ajouter' && (
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Infos patient */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <ClipboardList className="h-3.5 w-3.5" /> Informations patient
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">N° Chambre *</label>
                  <input value={chambre} onChange={e => setChambre(e.target.value)} required
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Nom *</label>
                  <input value={nom} onChange={e => setNom(e.target.value)} required
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 uppercase" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Prénom *</label>
                  <input value={prenom} onChange={e => setPrenom(e.target.value)} required
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Sexe *</label>
                  <div className="flex gap-2">
                    {(['Femme', 'Homme'] as const).map(s => (
                      <button key={s} type="button" onClick={() => handleSexeChange(s)}
                        className={cn(
                          'flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all',
                          sexe === s ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-200 text-slate-500 hover:border-teal-300'
                        )}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Type de produit */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Type de produit</p>
              <div className="flex gap-3 flex-wrap">
                {PRODUCT_OPTIONS[sexe].map(p => (
                  <button key={p} type="button" onClick={() => handleProductChange(p)}
                    className={cn(
                      'px-5 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all',
                      productType === p ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-200 text-slate-600 hover:border-teal-300'
                    )}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Mesures */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Mesures (cm)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {showFields.a && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">A — Tour de cheville *</label>
                    <input type="number" step="0.5" value={mesureA} onChange={e => setMesureA(e.target.value)} required
                      placeholder="ex : 22"
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />
                  </div>
                )}
                {showFields.b && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">B — Tour de mollet *</label>
                    <input type="number" step="0.5" value={mesureB} onChange={e => setMesureB(e.target.value)} required
                      placeholder="ex : 34"
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />
                  </div>
                )}
                {showFields.c && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">C — Tour de cuisse *</label>
                    <input type="number" step="0.5" value={mesureC} onChange={e => setMesureC(e.target.value)} required
                      placeholder="ex : 50"
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />
                  </div>
                )}
                {showFields.d && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">D — Hauteur sol–sous genou *</label>
                    <input type="number" step="0.5" value={mesureD} onChange={e => setMesureD(e.target.value)} required
                      placeholder="ex : 38"
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />
                  </div>
                )}
                {showFields.e && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">E — Hauteur sol–haut cuisse *</label>
                    <input type="number" step="0.5" value={mesureE} onChange={e => setMesureE(e.target.value)} required
                      placeholder="ex : 70"
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />
                  </div>
                )}
                {showFields.f && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">F — Tour de hanches (optionnel)</label>
                    <input type="number" step="0.5" value={mesureF} onChange={e => setMesureF(e.target.value)}
                      placeholder="ex : 120"
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500" />
                  </div>
                )}
              </div>

              {/* Légende */}
              <div className="mt-4 p-3 bg-teal-50 rounded-xl border border-teal-100">
                <p className="text-xs text-teal-700 font-semibold mb-1">Rappel selon le type :</p>
                <p className="text-xs text-teal-600">
                  {isBas
                    ? 'Bas/collant → mesures A (cheville), B (mollet), C (cuisse), E (hauteur sol–cuisse)' + (sexe === 'Femme' ? ', F (hanches optionnel)' : '')
                    : 'Chaussette → mesures A (cheville), B (mollet), D (hauteur sol–sous genou)'}
                </p>
              </div>
            </div>

            <button type="submit" disabled={insertMut.isPending}
              className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-2xl text-sm font-bold shadow-sm transition-colors">
              {insertMut.isPending ? 'Calcul en cours…' : 'Calculer la taille et ajouter'}
            </button>

            {/* Grilles de référence */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Grilles de référence — {sexe}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left font-bold text-slate-500">Taille</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-500">Cheville (cm)</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-500">Mollet (cm)</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-500">Cuisse (cm)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {SIZE_CHARTS[sexe.toLowerCase()].map(s => (
                      <tr key={s.size} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-bold text-teal-700">{s.size}</td>
                        <td className="px-3 py-2 text-slate-600">{s.cheville ? `${s.cheville[0]}–${s.cheville[1]}` : '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{s.mollet  ? `${s.mollet[0]}–${s.mollet[1]}`   : '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{s.cuisse  ? `${s.cuisse[0]}–${s.cuisse[1]}`   : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </form>
        )}

        {/* ══ TAB : Liste ══ */}
        {tab === 'liste' && (
          <>
            {patients.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center text-slate-400">
                <Bandage className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Aucun patient enregistré</p>
                <button onClick={() => setTab('ajouter')}
                  className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors">
                  Ajouter le premier patient
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Ch.</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Patient</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Mesures</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Taille</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">1ère Cmd</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">2ème Cmd</th>
                        {isAdmin && <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {patients.map(p => (
                        <tr key={p.id}
                          className={cn('hover:bg-slate-50 transition-colors', p.sexe === 'Femme' ? 'bg-pink-50/30' : 'bg-blue-50/30')}>
                          <td className="px-4 py-3 font-mono font-bold text-slate-700">{p.chambre}</td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-slate-800">{p.nom} {p.prenom}</span>
                            <span className={cn(
                              'ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded',
                              p.sexe === 'Femme' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
                            )}>{p.sexe}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{p.product_type.replace(/\s\(.*\)/, '')}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{mesuresText(p)}</td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              'font-bold text-sm px-2 py-0.5 rounded-lg',
                              p.taille_recommandee.includes('hors') || p.taille_recommandee.includes('cohér')
                                ? 'bg-red-100 text-red-700'
                                : 'bg-teal-100 text-teal-700'
                            )}>{p.taille_recommandee}</span>
                            {p.origine === 'Manuel' && (
                              <span className="ml-1 text-[10px] text-amber-600 font-semibold">Manuel</span>
                            )}
                          </td>

                          {/* Date 1 */}
                          <td className="px-4 py-3">
                            {editingDate?.id === p.id && editingDate.field === 'date_cmd_1' ? (
                              <div className="flex items-center gap-1">
                                <input type="date" value={dateValue} onChange={e => setDateValue(e.target.value)}
                                  className="text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-teal-500"
                                  autoFocus />
                                <button onClick={() => dateMut.mutate({ id: p.id, field: 'date_cmd_1', value: dateValue })}
                                  className="p-1 text-teal-600 hover:bg-teal-50 rounded"><Check className="h-3 w-3" /></button>
                                <button onClick={() => setEditingDate(null)}
                                  className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X className="h-3 w-3" /></button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setEditingDate({ id: p.id, field: 'date_cmd_1' }); setDateValue(p.date_cmd_1 ?? ''); }}
                                className={cn(
                                  'text-xs px-2 py-1 rounded-lg hover:bg-teal-50 transition-colors',
                                  p.date_cmd_1 ? 'text-teal-700 font-semibold' : 'text-slate-400 border border-dashed border-slate-300'
                                )}>
                                {p.date_cmd_1 ? fmtDate(p.date_cmd_1) : '+ Date'}
                              </button>
                            )}
                          </td>

                          {/* Date 2 */}
                          <td className="px-4 py-3">
                            {editingDate?.id === p.id && editingDate.field === 'date_cmd_2' ? (
                              <div className="flex items-center gap-1">
                                <input type="date" value={dateValue} onChange={e => setDateValue(e.target.value)}
                                  className="text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-teal-500"
                                  autoFocus />
                                <button onClick={() => dateMut.mutate({ id: p.id, field: 'date_cmd_2', value: dateValue })}
                                  className="p-1 text-teal-600 hover:bg-teal-50 rounded"><Check className="h-3 w-3" /></button>
                                <button onClick={() => setEditingDate(null)}
                                  className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X className="h-3 w-3" /></button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setEditingDate({ id: p.id, field: 'date_cmd_2' }); setDateValue(p.date_cmd_2 ?? ''); }}
                                className={cn(
                                  'text-xs px-2 py-1 rounded-lg hover:bg-teal-50 transition-colors',
                                  p.date_cmd_2 ? 'text-teal-700 font-semibold' : 'text-slate-400 border border-dashed border-slate-300'
                                )}>
                                {p.date_cmd_2 ? fmtDate(p.date_cmd_2) : '+ Date'}
                              </button>
                            )}
                          </td>

                          {isAdmin && (
                            <td className="px-4 py-3">
                              <button onClick={() => setDeleteId(p.id)}
                                className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal conflit ── */}
      {conflict && (
        <ConflictModal
          candidates={conflict.candidates}
          patientData={conflict.patientData}
          onChoose={(_, text) => {
            doInsert(conflict.patientData, text, 'Manuel');
            setConflict(null);
          }}
          onCancel={() => setConflict(null)}
        />
      )}

      {/* ── Modal suppression ── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <p className="font-bold text-slate-800 mb-2">Supprimer ce patient ?</p>
            <p className="text-sm text-red-600 mb-5">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50 transition-colors">
                Annuler
              </button>
              <button onClick={() => deleteMut.mutate(deleteId)} disabled={deleteMut.isPending}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
