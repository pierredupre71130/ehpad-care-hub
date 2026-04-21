'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Scale, TrendingDown, TrendingUp, Plus, X, Loader2,
  Check, Pencil, Save, Activity, User, Pill, ChevronRight,
  AlertTriangle, Trash2, Calendar, Settings, ArrowDown, ArrowUp, ArrowRight, Printer,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Customized,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';
import { HomeButton } from '@/components/ui/home-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Resident {
  id: string;
  room: string;
  title: string;
  first_name: string;
  last_name: string;
  date_naissance: string | null;
  date_entree: string | null;
  floor: 'RDC' | '1ER';
  medecin: string | null;
}

interface PoidsMesure {
  id: string;
  resident_id: string;
  date: string;
  poids_kg: number;
  commentaire: string | null;
}

interface ComplementAlimentaire {
  id: string;
  resident_id: string;
  date_prescription: string;
  type_complement: string;
  actif: boolean;
  commentaire: string | null;
}

interface SuiviClinique {
  id: string;
  resident_id: string;
  date: string;
  contenu: string;
}

interface DossierNutritionnel {
  resident_id: string;
  taille_cm: number | null;
  poids_habituel_kg: number | null;
  commentaire: string | null;
  imc_saisi: number | null;
  albumine_g_l: number | null;
  albumine_date: string | null;
  etat_general: string | null;
  cause_suspectee: string | null;
  notes_cliniques: string | null;
  statut_nutritionnel: string | null;
  date_evaluation: string | null;
}

interface AlertInfo {
  denutrition: boolean;
  surcharge: boolean;
  detail: string;
  imc?: number;
}

interface AlertSettings {
  id: string;
  denutrition_pct_court: number;
  denutrition_jours_court: number;
  denutrition_pct_long: number;
  denutrition_jours_long: number;
  surcharge_pct_court: number;
  surcharge_jours_court: number;
  surcharge_pct_long: number;
  surcharge_jours_long: number;
}

const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  id: 'default',
  denutrition_pct_court: 5,
  denutrition_jours_court: 30,
  denutrition_pct_long: 10,
  denutrition_jours_long: 180,
  surcharge_pct_court: 5,
  surcharge_jours_court: 30,
  surcharge_pct_long: 10,
  surcharge_jours_long: 180,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(d: string) {
  return d.slice(0, 7);
}

function monthLabel(key: string) {
  const [y, m] = key.split('-');
  const labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  return `${labels[parseInt(m) - 1]} ${y.slice(2)}`;
}

function computeAlerts(mesures: PoidsMesure[], dossier?: DossierNutritionnel, settings?: AlertSettings): AlertInfo {
  const cfg = settings ?? DEFAULT_ALERT_SETTINGS;
  const sorted = [...mesures].sort((a, b) => b.date.localeCompare(a.date));
  if (sorted.length === 0) return { denutrition: false, surcharge: false, detail: '' };

  const latest = sorted[0].poids_kg;
  const today = todayISO();
  let denutrition = false, surcharge = false;
  const details: string[] = [];
  let imc: number | undefined;

  if (dossier?.taille_cm && dossier.taille_cm > 0) {
    const h = dossier.taille_cm / 100;
    imc = parseFloat((latest / (h * h)).toFixed(1));
    if (imc >= 30) { surcharge = true; details.push(`IMC ${imc} ≥ 30`); }
  }

  // Dénutrition période courte
  const dDenC = new Date(today); dDenC.setDate(dDenC.getDate() - cfg.denutrition_jours_court);
  const refDenC = sorted.find(m => new Date(m.date) <= dDenC);
  if (refDenC) {
    const pct = ((refDenC.poids_kg - latest) / refDenC.poids_kg) * 100;
    if (pct >= cfg.denutrition_pct_court) { denutrition = true; details.push(`−${pct.toFixed(1)}% en ${cfg.denutrition_jours_court}j (${refDenC.poids_kg}→${latest} kg)`); }
  }

  // Dénutrition période longue
  const dDenL = new Date(today); dDenL.setDate(dDenL.getDate() - cfg.denutrition_jours_long);
  const refDenL = sorted.find(m => new Date(m.date) <= dDenL);
  if (refDenL) {
    const pct = ((refDenL.poids_kg - latest) / refDenL.poids_kg) * 100;
    if (pct >= cfg.denutrition_pct_long) { denutrition = true; details.push(`−${pct.toFixed(1)}% en ${cfg.denutrition_jours_long}j (${refDenL.poids_kg}→${latest} kg)`); }
  }

  // Surcharge période courte
  const dSurC = new Date(today); dSurC.setDate(dSurC.getDate() - cfg.surcharge_jours_court);
  const refSurC = sorted.find(m => new Date(m.date) <= dSurC);
  if (refSurC) {
    const pct = ((refSurC.poids_kg - latest) / refSurC.poids_kg) * 100;
    if (pct <= -cfg.surcharge_pct_court) { surcharge = true; details.push(`+${Math.abs(pct).toFixed(1)}% en ${cfg.surcharge_jours_court}j (${refSurC.poids_kg}→${latest} kg)`); }
  }

  // Surcharge période longue
  const dSurL = new Date(today); dSurL.setDate(dSurL.getDate() - cfg.surcharge_jours_long);
  const refSurL = sorted.find(m => new Date(m.date) <= dSurL);
  if (refSurL) {
    const pct = ((refSurL.poids_kg - latest) / refSurL.poids_kg) * 100;
    if (pct <= -cfg.surcharge_pct_long) { surcharge = true; details.push(`+${Math.abs(pct).toFixed(1)}% en ${cfg.surcharge_jours_long}j (${refSurL.poids_kg}→${latest} kg)`); }
  }

  return { denutrition, surcharge, detail: details.join(' • '), imc };
}

// ─── Alert Settings Panels ────────────────────────────────────────────────────

function DenutritionSettingsPanel({ settings, onSave, onClose }: {
  settings: AlertSettings;
  onSave: (v: Partial<AlertSettings>) => void;
  onClose: () => void;
}) {
  const [pctC, setPctC] = useState(settings.denutrition_pct_court.toString());
  const [joursC, setJoursC] = useState(settings.denutrition_jours_court.toString());
  const [pctL, setPctL] = useState(settings.denutrition_pct_long.toString());
  const [joursL, setJoursL] = useState(settings.denutrition_jours_long.toString());

  const resetHAS = () => { setPctC('5'); setJoursC('30'); setPctL('10'); setJoursL('180'); };

  return (
    <div className="mt-2 bg-white border border-red-200 rounded-lg p-3">
      <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded p-2 mb-3">
        <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-red-700 leading-relaxed">
          <strong>Critères HAS :</strong> perte ≥ 5 % du poids corporel en 30 jours,
          ou ≥ 10 % en 180 jours. Cliquer sur <em>"Réinitialiser HAS"</em> pour retrouver ces valeurs.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-3">
        {[
          { label: 'Période courte', pct: pctC, setPct: setPctC, jours: joursC, setJours: setJoursC },
          { label: 'Période longue', pct: pctL, setPct: setPctL, jours: joursL, setJours: setJoursL },
        ].map(({ label, pct, setPct, jours, setJours }) => (
          <div key={label}>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">{label}</label>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-500">perte ≥</span>
              <input type="number" min="0" max="100" step="0.5" value={pct} onChange={e => setPct(e.target.value)}
                className="w-14 border border-slate-300 rounded px-2 py-1 text-xs text-center outline-none focus:border-red-400" />
              <span className="text-xs text-slate-500">% en</span>
              <input type="number" min="1" step="1" value={jours} onChange={e => setJours(e.target.value)}
                className="w-16 border border-slate-300 rounded px-2 py-1 text-xs text-center outline-none focus:border-red-400" />
              <span className="text-xs text-slate-500">jours</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button onClick={resetHAS}
          className="text-xs text-red-600 hover:text-red-800 border border-red-300 rounded px-2.5 py-1 hover:bg-red-50 transition-colors">
          Réinitialiser HAS
        </button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onClose}>Annuler</Button>
        <Button size="sm" className="h-7 text-xs" onClick={() => onSave({
          denutrition_pct_court: parseFloat(pctC) || 5,
          denutrition_jours_court: parseInt(joursC) || 30,
          denutrition_pct_long: parseFloat(pctL) || 10,
          denutrition_jours_long: parseInt(joursL) || 180,
        })}>Enregistrer</Button>
      </div>
    </div>
  );
}

function SurchargeSettingsPanel({ settings, onSave, onClose }: {
  settings: AlertSettings;
  onSave: (v: Partial<AlertSettings>) => void;
  onClose: () => void;
}) {
  const [pctC, setPctC] = useState(settings.surcharge_pct_court.toString());
  const [joursC, setJoursC] = useState(settings.surcharge_jours_court.toString());
  const [pctL, setPctL] = useState(settings.surcharge_pct_long.toString());
  const [joursL, setJoursL] = useState(settings.surcharge_jours_long.toString());

  const reset = () => { setPctC('5'); setJoursC('30'); setPctL('10'); setJoursL('180'); };

  return (
    <div className="mt-2 bg-white border border-orange-200 rounded-lg p-3">
      <div className="flex items-start gap-2 bg-orange-50 border border-orange-100 rounded p-2 mb-3">
        <AlertTriangle className="h-3.5 w-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-orange-700 leading-relaxed">
          <strong>Pas de critères HAS officiels</strong> pour la prise de poids.
          Valeurs par défaut : gain ≥ 5 % en 30 jours ou ≥ 10 % en 180 jours.
          Cliquer sur <em>"Réinitialiser"</em> pour retrouver ces valeurs.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-3">
        {[
          { label: 'Période courte', pct: pctC, setPct: setPctC, jours: joursC, setJours: setJoursC },
          { label: 'Période longue', pct: pctL, setPct: setPctL, jours: joursL, setJours: setJoursL },
        ].map(({ label, pct, setPct, jours, setJours }) => (
          <div key={label}>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">{label}</label>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-500">gain ≥</span>
              <input type="number" min="0" max="100" step="0.5" value={pct} onChange={e => setPct(e.target.value)}
                className="w-14 border border-slate-300 rounded px-2 py-1 text-xs text-center outline-none focus:border-orange-400" />
              <span className="text-xs text-slate-500">% en</span>
              <input type="number" min="1" step="1" value={jours} onChange={e => setJours(e.target.value)}
                className="w-16 border border-slate-300 rounded px-2 py-1 text-xs text-center outline-none focus:border-orange-400" />
              <span className="text-xs text-slate-500">jours</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button onClick={reset}
          className="text-xs text-orange-600 hover:text-orange-800 border border-orange-300 rounded px-2.5 py-1 hover:bg-orange-50 transition-colors">
          Réinitialiser
        </button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onClose}>Annuler</Button>
        <Button size="sm" className="h-7 text-xs" onClick={() => onSave({
          surcharge_pct_court: parseFloat(pctC) || 5,
          surcharge_jours_court: parseInt(joursC) || 30,
          surcharge_pct_long: parseFloat(pctL) || 10,
          surcharge_jours_long: parseInt(joursL) || 180,
        })}>Enregistrer</Button>
      </div>
    </div>
  );
}

// ─── Statut nutritionnel ──────────────────────────────────────────────────────

const STATUT_CONFIG: Record<string, { label: string; color: string }> = {
  severe:        { label: 'Sévère',     color: 'bg-red-100 text-red-800 border border-red-300' },
  modere:        { label: 'Modéré',     color: 'bg-orange-100 text-orange-800 border border-orange-300' },
  leger:         { label: 'Léger',      color: 'bg-amber-100 text-amber-800 border border-amber-300' },
  normal:        { label: 'Normal',     color: 'bg-green-100 text-green-800 border border-green-300' },
  non_renseigne: { label: 'Non évalué', color: 'bg-slate-100 text-slate-500 border border-slate-300' },
};

const ETAT_OPTIONS = [
  { value: 'non_renseigne', label: 'Non renseigné' },
  { value: 'normal',        label: 'Normal' },
  { value: 'fatigue_legere',label: 'Fatigue légère' },
  { value: 'asthenie',      label: 'Asthénie' },
  { value: 'etat_altere',   label: 'État altéré' },
];

function computeStatutNutritionnel(imc?: number | null, albumine?: number | null, etat?: string | null): string {
  let sev = 0;
  if (imc != null) {
    if (imc < 16) sev = Math.max(sev, 4);
    else if (imc < 17) sev = Math.max(sev, 3);
    else if (imc < 18.5) sev = Math.max(sev, 2);
    else sev = Math.max(sev, 1);
  }
  if (albumine != null) {
    if (albumine < 28) sev = Math.max(sev, 4);
    else if (albumine < 32) sev = Math.max(sev, 3);
    else if (albumine <= 35) sev = Math.max(sev, 2);
    else sev = Math.max(sev, 1);
  }
  const etatMap: Record<string, number> = { normal: 1, fatigue_legere: 2, asthenie: 3, etat_altere: 4 };
  if (etat && etat !== 'non_renseigne') sev = Math.max(sev, etatMap[etat] ?? 0);
  return ['non_renseigne', 'normal', 'leger', 'modere', 'severe'][sev];
}

// ─── Complements Section (modal) ──────────────────────────────────────────────

function ComplementsSection({ residentId, complements }: {
  residentId: string;
  complements: ComplementAlimentaire[];
}) {
  const qc = useQueryClient();
  const supabase = createClient();
  const [adding, setAdding] = useState(false);
  const [typeC, setTypeC] = useState('');
  const [dateP, setDateP] = useState(todayISO());
  const [commentC, setCommentC] = useState('');

  const addC = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('complement_alimentaire').insert({
        resident_id: residentId, date_prescription: dateP,
        type_complement: typeC, actif: true, commentaire: commentC || null,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData<ComplementAlimentaire[]>(['complements'], old => [...(old ?? []), data as ComplementAlimentaire]);
      setAdding(false); setTypeC(''); setCommentC('');
      toast.success('Complément ajouté');
    },
  });

  const toggleActif = useMutation({
    mutationFn: async ({ id, actif }: { id: string; actif: boolean }) => {
      await supabase.from('complement_alimentaire').update({ actif }).eq('id', id);
      return { id, actif };
    },
    onSuccess: ({ id, actif }) => {
      qc.setQueryData<ComplementAlimentaire[]>(['complements'], old => (old ?? []).map(c => c.id === id ? { ...c, actif } : c));
    },
  });

  const deleteC = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('complement_alimentaire').delete().eq('id', id);
      return id;
    },
    onSuccess: (id) => {
      qc.setQueryData<ComplementAlimentaire[]>(['complements'], old => (old ?? []).filter(c => c.id !== id));
      toast.success('Supprimé');
    },
  });

  return (
    <section className="border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-700 flex items-center gap-2 text-sm">
          <Pill className="h-4 w-4 text-amber-600" /> Compléments alimentaires
        </h3>
        <Button size="sm" variant="outline" className="no-print h-7 px-2 text-xs" onClick={() => setAdding(a => !a)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter
        </Button>
      </div>
      {adding && (
        <div className="no-print mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Type de complément</label>
              <Input value={typeC} onChange={e => setTypeC(e.target.value)} placeholder="Fortimel, Renutryl…" className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Date de prescription</label>
              <Input type="date" value={dateP} onChange={e => setDateP(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <Input value={commentC} onChange={e => setCommentC(e.target.value)} placeholder="Commentaire (optionnel)" className="h-8 text-sm" />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Annuler</Button>
            <Button size="sm" onClick={() => addC.mutate()} disabled={!typeC || addC.isPending}>
              <Check className="h-3.5 w-3.5 mr-1" /> Enregistrer
            </Button>
          </div>
        </div>
      )}
      {complements.length === 0
        ? <p className="text-sm text-slate-400 italic">Aucun complément alimentaire</p>
        : (
          <div className="space-y-1.5">
            {[...complements].sort((a, b) => b.date_prescription.localeCompare(a.date_prescription)).map(c => (
              <div key={c.id} className={`flex items-center justify-between p-2 rounded-lg border ${c.actif ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                <div>
                  <span className={`text-sm font-medium ${c.actif ? 'text-amber-900' : 'text-slate-500'}`}>{c.type_complement}</span>
                  <span className="text-xs text-slate-400 ml-2">depuis le {fmtDate(c.date_prescription)}</span>
                  {c.commentaire && <p className="text-xs text-slate-500">{c.commentaire}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded border ${c.actif ? 'border-amber-400 text-amber-700 bg-amber-100' : 'border-slate-300 text-slate-500 bg-white'}`}>
                    {c.actif ? 'Actif' : 'Inactif'}
                  </span>
                  <button onClick={() => toggleActif.mutate({ id: c.id, actif: !c.actif })}
                    className={`no-print text-xs px-2 py-0.5 rounded border ${c.actif ? 'border-amber-400 text-amber-700 bg-amber-100' : 'border-slate-300 text-slate-500 bg-white'}`}>
                    Changer
                  </button>
                  <button onClick={() => deleteC.mutate(c.id)} className="no-print text-red-400 hover:text-red-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
    </section>
  );
}

// ─── Resident Modal ───────────────────────────────────────────────────────────

function ResidentModal({ resident, allMesures, allComplements, allDossiers, alertSettings, onClose }: {
  resident: Resident;
  allMesures: PoidsMesure[];
  allComplements: ComplementAlimentaire[];
  allDossiers: DossierNutritionnel[];
  alertSettings: AlertSettings;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const supabase = createClient();

  const mesures = useMemo(() => allMesures.filter(m => m.resident_id === resident.id), [allMesures, resident.id]);
  const complements = useMemo(() => allComplements.filter(c => c.resident_id === resident.id), [allComplements, resident.id]);
  const dossier = useMemo(() => allDossiers.find(d => d.resident_id === resident.id), [allDossiers, resident.id]);

  const alerts = useMemo(() => computeAlerts(mesures, dossier, alertSettings), [mesures, dossier, alertSettings]);
  const sorted = useMemo(() => [...mesures].sort((a, b) => a.date.localeCompare(b.date)), [mesures]);
  const latest = sorted[sorted.length - 1];
  const first = sorted[0];
  const hasAlert = alerts.denutrition || alerts.surcharge;

  const evolutionTotal = first && latest && first.id !== latest.id
    ? { diff: parseFloat((latest.poids_kg - first.poids_kg).toFixed(1)), pct: parseFloat(((latest.poids_kg - first.poids_kg) / first.poids_kg * 100).toFixed(1)) }
    : null;

  const evolutionEntree = useMemo(() => {
    if (!resident.date_entree || !latest || sorted.length < 2) return null;
    const entreeTs = new Date(resident.date_entree).getTime();

    // Poids dans les 30 jours avant l'entrée (le plus proche de l'entrée)
    const d30avant = new Date(resident.date_entree);
    d30avant.setDate(d30avant.getDate() - 30);
    const iso30 = d30avant.toISOString().slice(0, 10);
    const preEntree = [...sorted]
      .filter(m => m.date >= iso30 && m.date < resident.date_entree!)
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    // Premier poids après (ou le jour de) l'entrée
    const postEntree = sorted.find(m => m.date >= resident.date_entree!);

    // Choisir le plus proche de la date d'entrée
    let ref: PoidsMesure | undefined;
    let isPreEntree = false;
    if (preEntree && postEntree) {
      const distPre  = Math.abs(entreeTs - new Date(preEntree.date).getTime());
      const distPost = Math.abs(new Date(postEntree.date).getTime() - entreeTs);
      if (distPost <= distPre) {
        ref = postEntree;
        isPreEntree = false;
      } else {
        ref = preEntree;
        isPreEntree = true;
      }
    } else {
      ref = preEntree ?? postEntree ?? sorted[0];
      isPreEntree = !!preEntree;
    }

    if (!ref || ref.id === latest.id) return null;
    const diff = parseFloat((latest.poids_kg - ref.poids_kg).toFixed(1));
    return { diff, pct: parseFloat((diff / ref.poids_kg * 100).toFixed(1)), refDate: ref.date, preEntree: isPreEntree };
  }, [sorted, resident.date_entree, latest]);

  const chartData = sorted.map(m => ({ date: new Date(m.date).getTime(), poids: m.poids_kg }));
  const activeComplement = [...complements].filter(c => c.actif).sort((a, b) => b.date_prescription.localeCompare(a.date_prescription))[0];

  // Bilan nutritionnel
  const [editBilan, setEditBilan] = useState(false);
  const [bilanImc, setBilanImc] = useState(dossier?.imc_saisi?.toString() ?? '');
  const [bilanAlbumine, setBilanAlbumine] = useState(dossier?.albumine_g_l?.toString() ?? '');
  const [bilanAlbumineDt, setBilanAlbumineDt] = useState(dossier?.albumine_date ?? '');
  const [bilanEtat, setBilanEtat] = useState(dossier?.etat_general ?? 'non_renseigne');
  const [bilanCause, setBilanCause] = useState(dossier?.cause_suspectee ?? '');
  const [bilanNotes, setBilanNotes] = useState(dossier?.notes_cliniques ?? '');

  const bilanStatut = computeStatutNutritionnel(
    bilanImc ? parseFloat(bilanImc) : null,
    bilanAlbumine ? parseFloat(bilanAlbumine) : null,
    bilanEtat,
  );
  const savedStatut = computeStatutNutritionnel(dossier?.imc_saisi, dossier?.albumine_g_l, dossier?.etat_general);

  const saveBilan = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('dossier_nutritionnel').upsert({
        resident_id: resident.id,
        taille_cm: dossier?.taille_cm ?? null,
        poids_habituel_kg: dossier?.poids_habituel_kg ?? null,
        commentaire: dossier?.commentaire ?? null,
        imc_saisi: bilanImc ? parseFloat(bilanImc) : null,
        albumine_g_l: bilanAlbumine ? parseFloat(bilanAlbumine) : null,
        albumine_date: bilanAlbumineDt || null,
        etat_general: bilanEtat !== 'non_renseigne' ? bilanEtat : null,
        cause_suspectee: bilanCause || null,
        notes_cliniques: bilanNotes || null,
        statut_nutritionnel: bilanStatut !== 'non_renseigne' ? bilanStatut : null,
        date_evaluation: todayISO(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'resident_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.setQueryData<DossierNutritionnel[]>(['dossiers'], old =>
        (old ?? []).map(d => d.resident_id === resident.id ? {
          ...d,
          imc_saisi: bilanImc ? parseFloat(bilanImc) : null,
          albumine_g_l: bilanAlbumine ? parseFloat(bilanAlbumine) : null,
          albumine_date: bilanAlbumineDt || null,
          etat_general: bilanEtat !== 'non_renseigne' ? bilanEtat : null,
          cause_suspectee: bilanCause || null,
          notes_cliniques: bilanNotes || null,
          statut_nutritionnel: bilanStatut !== 'non_renseigne' ? bilanStatut : null,
        } : d)
      );
      setEditBilan(false);
      toast.success('Bilan enregistré');
    },
    onError: (e: Error) => toast.error('Erreur : ' + e.message),
  });

  const handlePrint = () => {
    const savedStatut = computeStatutNutritionnel(dossier?.imc_saisi, dossier?.albumine_g_l, dossier?.etat_general);
    const activeComps = complements.filter(c => c.actif).sort((a,b) => b.date_prescription.localeCompare(a.date_prescription));
    const inactiveComps = complements.filter(c => !c.actif).sort((a,b) => b.date_prescription.localeCompare(a.date_prescription));

    // Capture the Recharts SVG and scale it to a shorter height via viewBox
    const chartWrapper = document.querySelector('#resident-modal-print .recharts-wrapper');
    let chartSvgHtml = '';
    if (chartWrapper) {
      const svg = chartWrapper.querySelector('svg');
      if (svg) {
        const svgClone = svg.cloneNode(true) as SVGSVGElement;
        const origW = svgClone.getAttribute('width') || '700';
        const origH = svgClone.getAttribute('height') || '220';
        svgClone.setAttribute('viewBox', `0 0 ${origW} ${origH}`);
        svgClone.setAttribute('width', '100%');
        svgClone.setAttribute('height', '160');
        svgClone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        chartSvgHtml = `<div style="width:100%;">${new XMLSerializer().serializeToString(svgClone)}</div>`;
      }
    }

    // Reduce chart height for single-page fit
    if (chartSvgHtml) {
      chartSvgHtml = chartSvgHtml.replace(/height="[^"]*"/, 'height="115"');
    }

    const css = `*{box-sizing:border-box;margin:0;padding:0;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
body{font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#1e293b;padding:12px 16px;background:#fff;}
h3{font-size:11px;font-weight:600;color:#475569;margin-bottom:5px;}
.section{border:1px solid #e2e8f0;border-radius:7px;padding:7px 11px;margin-bottom:6px;}
.section.purple{border-color:#d8b4fe;background:#faf5ff;}
.section.amber{border-color:#fde68a;background:#fffbeb;}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:6px;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
.stat{border:1px solid #e2e8f0;border-radius:6px;padding:6px;text-align:center;}
.stat.blue{background:#eff6ff;border-color:#bfdbfe;}
.stat.red{background:#fef2f2;border-color:#fecaca;}
.stat.green{background:#f0fdf4;border-color:#bbf7d0;}
.lbl{font-size:9px;color:#94a3b8;margin-bottom:1px;}
.big{font-size:16px;font-weight:700;}
.big.blue{color:#1d4ed8;} .big.red{color:#dc2626;} .big.green{color:#16a34a;}
.sm{font-size:10px;color:#64748b;}
.badge{display:inline-block;font-size:10px;font-weight:700;border-radius:20px;padding:1px 7px;border:1px solid;}
.badge-red{color:#b91c1c;background:#fee2e2;border-color:#fca5a5;}
.badge-orange{color:#c2410c;background:#ffedd5;border-color:#fdba74;}
.alert{border-radius:6px;padding:6px 11px;margin-bottom:6px;border:1px solid;font-size:11px;font-weight:500;}
.alert.red{background:#fef2f2;border-color:#fca5a5;color:#991b1b;}
.alert.orange{background:#fff7ed;border-color:#fdba74;color:#9a3412;}
.has{background:#eff6ff;border:1px solid #bfdbfe;border-radius:5px;padding:4px 8px;margin-bottom:7px;line-height:1.6;}
.has-title{font-size:10px;font-weight:700;color:#1e40af;}
.kv{display:flex;gap:4px;margin-bottom:2px;}
.kv .k{color:#94a3b8;min-width:72px;}
.bilan3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:6px;}
.bilan-box{background:white;border:1px solid #e2e8f0;border-radius:5px;padding:5px;text-align:center;}
.comp-row{display:flex;align-items:center;justify-content:space-between;padding:4px 8px;border-radius:5px;margin-bottom:3px;}
.comp-on{background:#fffbeb;border:1px solid #fde68a;}
.comp-off{background:#f8fafc;border:1px solid #e2e8f0;opacity:.7;}
.pill{font-size:9px;font-weight:600;border-radius:20px;padding:1px 7px;border:1px solid;}
.pill-on{color:#92400e;background:#fef3c7;border-color:#fde68a;}
.pill-off{color:#64748b;background:#f1f5f9;border-color:#cbd5e1;}
.statut{font-size:10px;font-weight:700;border-radius:20px;padding:1px 8px;border:1px solid;display:inline-block;}
.statut-severe{color:#991b1b;background:#fee2e2;border-color:#fca5a5;}
.statut-modere{color:#9a3412;background:#ffedd5;border-color:#fdba74;}
.statut-leger{color:#92400e;background:#fefce8;border-color:#fde68a;}
.statut-normal{color:#166534;background:#f0fdf4;border-color:#bbf7d0;}`;

    const statutClass: Record<string,string> = { severe:'statut-severe', modere:'statut-modere', leger:'statut-leger', normal:'statut-normal' };

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>${(resident.last_name||'').toUpperCase()} ${resident.first_name} — Dossier nutritionnel</title>
<style>${css}</style></head><body>

<div class="section">
  <h3>👤 Dossier</h3>
  <div class="grid2">
    <div class="kv"><span class="k">Nom :</span> <strong>${(resident.last_name||'').toUpperCase()} ${resident.first_name}</strong></div>
    <div class="kv"><span class="k">Naissance :</span> ${resident.date_naissance ? fmtDate(resident.date_naissance) : '—'}</div>
    <div class="kv"><span class="k">Entrée :</span> ${resident.date_entree ? fmtDate(resident.date_entree) : '—'}</div>
    <div class="kv"><span class="k">Médecin :</span> ${resident.medecin ? 'Dr. '+resident.medecin : '—'}</div>
  </div>
  <div style="margin-top:6px;font-size:10px;color:#94a3b8;text-align:right;">Imprimé le ${new Date().toLocaleDateString('fr-FR')}</div>
</div>

${hasAlert && alerts.detail ? `<div class="alert ${alerts.denutrition?'red':'orange'}">⚠ ${alerts.detail}</div>` : ''}

${sorted.length > 0 ? `<div class="grid3" style="margin-bottom:14px;">
  <div class="stat blue"><div class="lbl">Dernier poids</div><div class="big blue">${latest!.poids_kg} kg</div><div class="sm">${fmtDate(latest!.date)}</div></div>
  <div class="stat ${evolutionTotal ? (evolutionTotal.diff<0?'red':'green') : ''}">
    <div class="lbl">Évol. depuis 1ère pesée</div>
    ${evolutionTotal ? `<div class="big ${evolutionTotal.diff<0?'red':'green'}">${evolutionTotal.diff>0?'+':''}${evolutionTotal.diff} kg</div><div class="sm">${evolutionTotal.pct>0?'+':''}${evolutionTotal.pct}% — depuis ${fmtDate(first!.date)}</div>` : '<div class="big" style="color:#cbd5e1">—</div>'}
  </div>
  <div class="stat ${evolutionEntree ? (evolutionEntree.diff<0?'red':'green') : ''}">
    <div class="lbl">Évol. depuis entrée</div>
    ${evolutionEntree ? `<div class="big ${evolutionEntree.diff<0?'red':'green'}">${evolutionEntree.diff>0?'+':''}${evolutionEntree.diff} kg</div><div class="sm">${evolutionEntree.pct>0?'+':''}${evolutionEntree.pct}% — ${evolutionEntree.preEntree ? 'pré-entrée '+fmtDate(evolutionEntree.refDate) : (resident.date_entree?'entrée '+fmtDate(resident.date_entree):'')}</div>` : '<div class="big" style="color:#cbd5e1">—</div>'}
  </div>
</div>` : ''}

${hasAlert ? `<div class="section purple">
  <h3>📋 Bilan nutritionnel</h3>
  <div class="has">
    <span class="has-title">Critères HAS — Dénutrition &nbsp;</span>
    <span style="font-size:10px;color:#1d4ed8;">
      <strong>Normal</strong> IMC ≥ 18.5 / Alb. &gt; 35 g/L &nbsp;·&nbsp;
      <strong>Léger</strong> IMC 17–18.5 / Alb. 32–35 g/L &nbsp;·&nbsp;
      <strong>Modéré</strong> IMC 16–17 / Alb. 28–32 g/L &nbsp;·&nbsp;
      <strong>Sévère</strong> IMC &lt; 16 / Alb. &lt; 28 g/L
    </span>
  </div>
  ${(dossier?.imc_saisi != null || dossier?.albumine_g_l != null || dossier?.etat_general) ? `
  <div class="bilan3">
    <div class="bilan-box"><div class="lbl">IMC</div><strong>${dossier?.imc_saisi ?? '—'}</strong></div>
    <div class="bilan-box"><div class="lbl">Albumine</div><strong>${dossier?.albumine_g_l ? dossier.albumine_g_l+' g/L' : '—'}</strong>${dossier?.albumine_date ? '<div class="sm">'+fmtDate(dossier.albumine_date)+'</div>' : ''}</div>
    <div class="bilan-box"><div class="lbl">État général</div><strong style="font-size:11px">${ETAT_OPTIONS.find(o=>o.value===dossier?.etat_general)?.label??'—'}</strong></div>
  </div>
  ${savedStatut !== 'non_renseigne' ? `<div style="margin-bottom:8px;">Statut nutritionnel : <span class="statut ${statutClass[savedStatut]||''}">${STATUT_CONFIG[savedStatut]?.label??''}</span></div>` : ''}
  ${dossier?.cause_suspectee ? `<div class="kv"><span class="k">Cause :</span> ${dossier.cause_suspectee}</div>` : ''}
  ${dossier?.notes_cliniques ? `<div style="margin-top:8px;background:white;border:1px solid #e2e8f0;border-radius:6px;padding:10px;"><div class="lbl" style="margin-bottom:4px;">Notes cliniques</div><p style="font-size:12px;white-space:pre-wrap;">${dossier.notes_cliniques}</p></div>` : ''}
  ` : '<p style="color:#94a3b8;font-style:italic;font-size:12px;">Aucun bilan enregistré.</p>'}
</div>` : ''}

<div class="section amber">
  <h3>💊 Compléments alimentaires</h3>
  ${complements.length === 0 ? '<p style="color:#94a3b8;font-style:italic;font-size:12px;">Aucun complément alimentaire</p>' : `
  ${[...activeComps, ...inactiveComps].map(c => `
    <div class="comp-row ${c.actif?'comp-on':'comp-off'}">
      <div>
        <span style="font-weight:600;font-size:13px;color:${c.actif?'#92400e':'#64748b'}">${c.type_complement}</span>
        <span style="font-size:11px;color:#94a3b8;margin-left:8px;">depuis le ${fmtDate(c.date_prescription)}</span>
        ${c.commentaire ? '<div style="font-size:11px;color:#64748b;">'+c.commentaire+'</div>' : ''}
      </div>
      <span class="pill ${c.actif?'pill-on':'pill-off'}">${c.actif?'Actif':'Inactif'}</span>
    </div>`).join('')}`}
</div>

${chartSvgHtml ? `<div class="section">
  <h3>📈 Courbe des poids</h3>
  ${chartSvgHtml}
</div>` : ''}

</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;';
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(url); }, 2000);
    };
    iframe.src = url;
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="flex items-center gap-2 flex-wrap flex-1">
              <span className="font-bold">{resident.title} {(resident.last_name || '').toUpperCase()} {resident.first_name}</span>
              <span className="text-sm font-normal text-slate-500 bg-slate-100 rounded px-2 py-0.5">Ch. {resident.room} — {resident.floor}</span>
              {alerts.denutrition && (
                <span className="flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 border border-red-300 rounded-full px-2 py-0.5">
                  <TrendingDown className="h-3 w-3" /> Dénutrition
                </span>
              )}
              {alerts.surcharge && (
                <span className="flex items-center gap-1 text-xs font-bold text-orange-700 bg-orange-100 border border-orange-300 rounded-full px-2 py-0.5">
                  <TrendingUp className="h-3 w-3" /> Surcharge pondérale
                </span>
              )}
            </DialogTitle>
            <button onClick={handlePrint}
              className="no-print flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 text-xs font-medium transition-colors">
              <Printer className="h-3.5 w-3.5" /> Imprimer
            </button>
          </div>
        </DialogHeader>

        <div id="resident-modal-print" className="space-y-4 mt-1">

          {/* Alert detail */}
          {hasAlert && alerts.detail && (
            <div className={`rounded-xl px-4 py-3 border text-sm font-medium flex items-start gap-2 ${alerts.denutrition ? 'bg-red-50 border-red-300 text-red-800' : 'bg-orange-50 border-orange-300 text-orange-800'}`}>
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{alerts.detail}</span>
            </div>
          )}

          {/* Stats */}
          {sorted.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                <div className="text-xs text-blue-500 mb-1">Dernier poids</div>
                <div className="text-2xl font-bold text-blue-800">{latest.poids_kg} <span className="text-sm font-normal">kg</span></div>
                <div className="text-xs text-blue-400">{fmtDate(latest.date)}</div>
              </div>
              <div className={`border rounded-xl p-3 text-center ${!evolutionTotal ? 'bg-slate-50 border-slate-200' : evolutionTotal.diff < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                <div className="text-xs text-slate-500 mb-1">Évol. depuis 1ère pesée</div>
                {evolutionTotal ? (
                  <>
                    <div className={`text-xl font-bold ${evolutionTotal.diff < 0 ? 'text-red-700' : 'text-green-700'}`}>{evolutionTotal.diff > 0 ? '+' : ''}{evolutionTotal.diff} kg</div>
                    <div className={`text-xs ${evolutionTotal.diff < 0 ? 'text-red-500' : 'text-green-500'}`}>({evolutionTotal.pct > 0 ? '+' : ''}{evolutionTotal.pct}%)</div>
                    <div className="text-xs text-slate-400">{fmtDate(first.date)}</div>
                  </>
                ) : <div className="text-xl font-bold text-slate-300">—</div>}
              </div>
              <div className={`border rounded-xl p-3 text-center ${!evolutionEntree ? 'bg-slate-50 border-slate-200' : evolutionEntree.diff < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                <div className="text-xs text-slate-500 mb-1">Évol. depuis entrée</div>
                {evolutionEntree ? (
                  <>
                    <div className={`text-xl font-bold ${evolutionEntree.diff < 0 ? 'text-red-700' : 'text-green-700'}`}>{evolutionEntree.diff > 0 ? '+' : ''}{evolutionEntree.diff} kg</div>
                    <div className={`text-xs ${evolutionEntree.diff < 0 ? 'text-red-500' : 'text-green-500'}`}>({evolutionEntree.pct > 0 ? '+' : ''}{evolutionEntree.pct}%)</div>
                    <div className="text-xs text-slate-400">
                      {evolutionEntree.preEntree ? `pré-entrée ${fmtDate(evolutionEntree.refDate)}` : `entrée ${fmtDate(resident.date_entree!)}`}
                    </div>
                  </>
                ) : <div className="text-xl font-bold text-slate-300">—</div>}
              </div>
            </div>
          )}

          {/* Weight chart */}
          {chartData.length > 1 && (
            <section className="border border-slate-200 rounded-xl p-4">
              <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4 text-blue-600" /> Courbe des poids
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 22, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" type="number" scale="time" domain={['dataMin', 'dataMax']}
                    tickFormatter={d => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                    tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis
                    domain={[(d: number) => Math.floor(d / 5) * 5 - 2, (d: number) => Math.ceil(d / 5) * 5 + 2]}
                    tickCount={6}
                    tickFormatter={(v: number) => Math.round(v).toString()}
                    tick={{ fontSize: 10 }} unit=" kg" width={52} />
                  <Tooltip formatter={(v) => [`${v} kg`, 'Poids']} labelFormatter={d => new Date(Number(d)).toLocaleDateString('fr-FR')} />
                  <Line type="monotone" dataKey="poids" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 5 }} name="Poids" connectNulls />
                  {/* Weight labels with real pixel-based collision detection */}
                  <Customized component={(props: Record<string, unknown>) => {
                    const pts: {x:number;y:number;value:number}[] =
                      (props.formattedGraphicalItems as {props:{points:{x:number;y:number;value:number}[]}}[])?.[0]?.props?.points ?? [];
                    const MIN_GAP = 30;
                    return (
                      <g>
                        {pts.map((pt, i) => {
                          const prev = pts[i-1]; const next = pts[i+1];
                          const crowded = (prev && Math.abs(pt.x - prev.x) < MIN_GAP) || (next && Math.abs(next.x - pt.x) < MIN_GAP);
                          const goingDown = next ? next.value <= pt.value : (prev ? prev.value >= pt.value : true);
                          const yOff = crowded ? (i % 2 === 0 ? -9 : 15) : (goingDown ? -8 : 13);
                          return (
                            <text key={i} x={pt.x} y={pt.y + yOff} textAnchor="middle" fill="#475569" fontSize={9} fontFamily="system-ui">
                              {pt.value}
                            </text>
                          );
                        })}
                      </g>
                    );
                  }} />
                  {resident.date_entree && (
                    <ReferenceLine x={new Date(resident.date_entree).getTime()} stroke="#10b981" strokeDasharray="5 3"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      label={{ content: (p: any) => {
                        const x = p.viewBox?.x ?? 0; const y = p.viewBox?.y ?? 0; const w = p.viewBox?.width ?? 500;
                        const right = x > w * 0.55;
                        return <text x={right ? x-4 : x+4} y={y+12} fill="#10b981" fontSize={9} fontFamily="system-ui" textAnchor={right?'end':'start'}>Entrée</text>;
                      }}} />
                  )}
                  {activeComplement && (
                    <ReferenceLine x={new Date(activeComplement.date_prescription).getTime()} stroke="#f59e0b" strokeDasharray="5 3"
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      label={{ content: (p: any) => {
                        const x = p.viewBox?.x ?? 0; const y = p.viewBox?.y ?? 0; const w = p.viewBox?.width ?? 500;
                        const right = x > w * 0.55;
                        return <text x={right ? x-4 : x+4} y={y+26} fill="#f59e0b" fontSize={9} fontFamily="system-ui" textAnchor={right?'end':'start'}>Complément</text>;
                      }}} />
                  )}
                </LineChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed border-green-500" /> Date d'entrée</span>
                <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed border-amber-500" /> Début complément</span>
              </div>
            </section>
          )}

          {/* Dossier nutritionnel — identité uniquement */}
          <section className="border border-slate-200 rounded-xl p-4">
            <h3 className="font-semibold text-slate-700 flex items-center gap-2 text-sm mb-3">
              <User className="h-4 w-4 text-blue-600" /> Dossier nutritionnel
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <div><span className="text-slate-400">Nom :</span> <span className="font-medium">{(resident.last_name || '').toUpperCase()} {resident.first_name}</span></div>
              <div><span className="text-slate-400">Naissance :</span> <span className="font-medium">{resident.date_naissance ? fmtDate(resident.date_naissance) : '—'}</span></div>
              <div><span className="text-slate-400">Entrée :</span> <span className="font-medium">{resident.date_entree ? fmtDate(resident.date_entree) : '—'}</span></div>
              <div><span className="text-slate-400">Médecin :</span> <span className="font-medium">{resident.medecin || '—'}</span></div>
            </div>
          </section>

          {/* Bilan nutritionnel — uniquement si alerte */}
          {hasAlert && (
            <section className="border border-purple-200 rounded-xl p-4 bg-purple-50/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-700 flex items-center gap-2 text-sm">
                  <Activity className="h-4 w-4 text-purple-600" /> Bilan nutritionnel
                </h3>
                <div className="flex items-center gap-2">
                  {savedStatut !== 'non_renseigne' && !editBilan && (
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${STATUT_CONFIG[savedStatut]?.color}`}>
                      {STATUT_CONFIG[savedStatut]?.label}
                    </span>
                  )}
                  <Button size="sm" variant="outline" className="no-print h-7 px-2 text-xs"
                    onClick={() => setEditBilan(e => !e)}>
                    {editBilan ? <><X className="h-3.5 w-3.5 mr-1" />Fermer</> : <><Pencil className="h-3.5 w-3.5 mr-1" />Modifier</>}
                  </Button>
                </div>
              </div>

              {/* Référence HAS toujours visible */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                <p className="text-xs font-bold text-blue-800 mb-1.5">Critères HAS — Dénutrition</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-blue-700">
                  <div><strong>Normal :</strong> IMC ≥ 18.5</div><div>Albumine &gt; 35 g/L • État bon</div>
                  <div><strong>Léger :</strong> IMC 17–18.5</div><div>Albumine 32–35 g/L • Fatigue légère</div>
                  <div><strong>Modéré :</strong> IMC 16–17</div><div>Albumine 28–32 g/L • Asthénie</div>
                  <div><strong>Sévère :</strong> IMC &lt; 16</div><div>Albumine &lt; 28 g/L • État altéré</div>
                </div>
              </div>

              {editBilan ? (
                <div className="no-print space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">IMC</label>
                      <Input type="number" step="0.1" value={bilanImc} onChange={e => setBilanImc(e.target.value)}
                        placeholder="ex : 18.5" className="h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Albumine (g/L)</label>
                      <Input type="number" step="0.1" value={bilanAlbumine} onChange={e => setBilanAlbumine(e.target.value)}
                        placeholder="ex : 34" className="h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Date du dosage</label>
                      <Input type="date" value={bilanAlbumineDt} onChange={e => setBilanAlbumineDt(e.target.value)}
                        className="h-8 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">État général</label>
                      <select value={bilanEtat} onChange={e => setBilanEtat(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-purple-400 bg-white">
                        {ETAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Cause suspectée</label>
                      <Input value={bilanCause} onChange={e => setBilanCause(e.target.value)}
                        placeholder="AEG, anorexie, dysphagie…" className="h-8 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Notes cliniques</label>
                    <textarea value={bilanNotes} onChange={e => setBilanNotes(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm resize-none h-20 outline-none focus:border-purple-400"
                      placeholder="Observations, évolution, plan nutritionnel…" />
                  </div>
                  {bilanStatut !== 'non_renseigne' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Statut calculé :</span>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${STATUT_CONFIG[bilanStatut]?.color}`}>
                        {STATUT_CONFIG[bilanStatut]?.label}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setEditBilan(false)}>Annuler</Button>
                    <Button size="sm" onClick={() => saveBilan.mutate()} disabled={saveBilan.isPending}>
                      <Save className="h-3.5 w-3.5 mr-1" /> Enregistrer
                    </Button>
                  </div>
                </div>
              ) : (dossier?.imc_saisi != null || dossier?.albumine_g_l != null || dossier?.etat_general) ? (
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center">
                      <div className="text-xs text-slate-400 mb-0.5">IMC</div>
                      <div className="font-semibold">{dossier.imc_saisi ?? '—'}</div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center">
                      <div className="text-xs text-slate-400 mb-0.5">Albumine</div>
                      <div className="font-semibold">{dossier.albumine_g_l ? `${dossier.albumine_g_l} g/L` : '—'}</div>
                      {dossier.albumine_date && <div className="text-xs text-slate-400">{fmtDate(dossier.albumine_date)}</div>}
                    </div>
                    <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center">
                      <div className="text-xs text-slate-400 mb-0.5">État général</div>
                      <div className="font-semibold text-xs">{ETAT_OPTIONS.find(o => o.value === dossier.etat_general)?.label ?? '—'}</div>
                    </div>
                  </div>
                  {dossier.cause_suspectee && (
                    <div><span className="text-slate-400 text-xs">Cause :</span> <span>{dossier.cause_suspectee}</span></div>
                  )}
                  {dossier.notes_cliniques && (
                    <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                      <div className="text-xs text-slate-400 mb-1">Notes cliniques</div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{dossier.notes_cliniques}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">Aucun bilan enregistré — cliquer sur "Modifier" pour saisir.</p>
              )}
            </section>
          )}

          <ComplementsSection residentId={resident.id} complements={complements} />

        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pesée du jour ────────────────────────────────────────────────────────────

function PeseeView({ residents, allMesures, floor, onFloorChange }: {
  residents: Resident[];
  allMesures: PoidsMesure[];
  floor: 'RDC' | '1ER';
  onFloorChange: (f: 'RDC' | '1ER') => void;
}) {
  const qc = useQueryClient();
  const supabase = createClient();
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [viewingPoids, setViewingPoids] = useState<Resident | null>(null);
  const [editingDlgId, setEditingDlgId] = useState<string | null>(null);
  const [editDlgVal, setEditDlgVal] = useState('');
  const [editDlgDate, setEditDlgDate] = useState('');
  const [showMissingOnly, setShowMissingOnly] = useState(false);

  const filtered = residents.filter(r => r.floor === floor).sort((a, b) => parseInt(a.room || '0') - parseInt(b.room || '0'));

  const currentMonthKey = todayISO().slice(0, 7);
  const missingCurrentMonth = useMemo(() =>
    filtered.filter(r => !allMesures.some(m => m.resident_id === r.id && m.date.startsWith(currentMonthKey))),
    [filtered, allMesures, currentMonthKey]
  );
  const displayedResidents = showMissingOnly ? missingCurrentMonth : filtered;

  // Dernier poids connu par résident (toutes dates confondues)
  const lastWeightByResident = useMemo(() => {
    const map: Record<string, PoidsMesure> = {};
    [...allMesures].sort((a, b) => a.date.localeCompare(b.date)).forEach(m => { map[m.resident_id] = m; });
    return map;
  }, [allMesures]);

  // Pesées par résident groupées par date
  const mesuresByResidentDate = useMemo(() => {
    const map: Record<string, PoidsMesure[]> = {};
    allMesures.forEach(m => {
      const key = `${m.resident_id}__${m.date}`;
      if (!map[key]) map[key] = [];
      map[key].push(m);
    });
    return map;
  }, [allMesures]);

  const getResidentDate = (residentId: string) => dates[residentId] ?? todayISO();

  const savePoids = async (r: Resident) => {
    const val = weights[r.id];
    const date = getResidentDate(r.id);
    if (!val || isNaN(parseFloat(val))) return;
    setSaving(s => ({ ...s, [r.id]: true }));

    // INSERT + RETURNING dans la même transaction (pas de problème de délai)
    const { data: inserted, error: insertError } = await supabase
      .from('poids_mesure')
      .insert({ resident_id: r.id, date, poids_kg: parseFloat(parseFloat(val).toFixed(2)) })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        toast.error(`${r.last_name || ''} a déjà un poids enregistré le ${fmtDate(date)} — modifie-le via l'historique`);
      } else {
        toast.error(`Erreur : ${insertError.message}`);
      }
      setSaving(s => ({ ...s, [r.id]: false }));
      return;
    }

    // Mise à jour immédiate du cache avec la ligne retournée
    if (inserted) {
      qc.setQueryData<PoidsMesure[]>(['poids'], old => [...(old ?? []), inserted as PoidsMesure]);
    }

    setWeights(w => ({ ...w, [r.id]: '' }));
    setSaving(s => ({ ...s, [r.id]: false }));
    toast.success(`${r.last_name || ''} — poids enregistré`);
  };

  const deleteMesure = useMutation({
    mutationFn: async (id: string) => { await supabase.from('poids_mesure').delete().eq('id', id); return id; },
    onSuccess: (id) => {
      qc.setQueryData<PoidsMesure[]>(['poids'], old => (old ?? []).filter(m => m.id !== id));
      toast.success('Pesée supprimée');
    },
  });

  const updateMesure = useMutation({
    mutationFn: async ({ id, poids_kg, date }: { id: string; poids_kg: number; date: string }) => {
      await supabase.from('poids_mesure').update({ poids_kg, date }).eq('id', id);
      return { id, poids_kg, date };
    },
    onSuccess: ({ id, poids_kg, date }) => {
      qc.setQueryData<PoidsMesure[]>(['poids'], old => (old ?? []).map(m => m.id === id ? { ...m, poids_kg, date } : m));
      setEditingDlgId(null);
      toast.success('Pesée modifiée');
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="font-semibold text-slate-700 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-600" /> Saisie des poids
        </span>
        <div className="flex gap-2">
          {(['RDC', '1ER'] as const).map(f => (
            <button key={f} onClick={() => { onFloorChange(f); setShowMissingOnly(false); }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${floor === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>
      {/* Bannière résidents sans pesée ce mois */}
      {(() => {
        const count = missingCurrentMonth.length;
        const label = monthLabel(currentMonthKey);
        if (count === 0) return (
          <button onClick={() => setShowMissingOnly(false)}
            className="w-full mb-3 flex items-center gap-2.5 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium cursor-default">
            <Check className="h-4 w-4 flex-shrink-0" />
            Tous les résidents ont été pesés en {label}
          </button>
        );
        return (
          <button onClick={() => setShowMissingOnly(v => !v)}
            className={`w-full mb-3 flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${showMissingOnly ? 'border-amber-400 bg-amber-100 text-amber-800' : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-300'}`}>
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 text-left">
              <span className="font-bold">{count} résident{count > 1 ? 's' : ''}</span> sans pesée en {label}
            </span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white border border-amber-300">
              {showMissingOnly ? 'Voir tous' : 'Voir uniquement'}
            </span>
          </button>
        );
      })()}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase w-16">Chbre</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Résident</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase w-36">Dernier poids</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Date · Poids</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase w-28">Historique</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayedResidents.map(r => {
              const last = lastWeightByResident[r.id];
              const residentDate = getResidentDate(r.id);
              const totalMesures = allMesures.filter(m => m.resident_id === r.id).length;
              return (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-slate-600">{r.room}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{(r.last_name || '').toUpperCase()} {r.first_name}</td>
                  <td className="px-4 py-2.5 text-center">
                    {last ? (
                      <div>
                        <span className="font-semibold text-slate-700">{last.poids_kg} kg</span>
                        <div className="text-xs text-slate-400">{fmtDate(last.date)}</div>
                      </div>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <input type="date" value={residentDate}
                        onChange={e => setDates(d => ({ ...d, [r.id]: e.target.value }))}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-blue-400 bg-white w-32" />
                      <Input type="number" step="0.1" min="20" max="200" placeholder="kg"
                        value={weights[r.id] ?? ''}
                        onChange={e => setWeights(w => ({ ...w, [r.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && savePoids(r)}
                        className="h-8 w-20 text-sm text-center" />
                      <button onClick={() => savePoids(r)} disabled={!weights[r.id] || saving[r.id]}
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-blue-600 text-white disabled:opacity-30 hover:bg-blue-700 transition-colors flex-shrink-0">
                        {saving[r.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {totalMesures > 0 ? (
                      <button onClick={() => { setViewingPoids(r); setEditingDlgId(null); }}
                        className="text-xs bg-slate-100 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-700 rounded-lg px-2.5 py-1 transition-colors">
                        <Scale className="h-3 w-3 inline mr-1" />{totalMesures} pesée{totalMesures > 1 ? 's' : ''}
                      </button>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Dialog : toutes les pesées d'un résident */}
      {viewingPoids && (() => {
        const resMesures = [...allMesures.filter(m => m.resident_id === viewingPoids.id)]
          .sort((a, b) => b.date.localeCompare(a.date));
        return (
          <Dialog open onOpenChange={() => { setViewingPoids(null); setEditingDlgId(null); }}>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-base">
                  {(viewingPoids.last_name || '').toUpperCase()} {viewingPoids.first_name}
                  <span className="ml-2 text-sm font-normal text-slate-400">— {resMesures.length} pesée{resMesures.length > 1 ? 's' : ''}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-1 mt-2">
                {resMesures.map(m => (
                  <div key={m.id} className="flex items-center gap-2 group px-2 py-1.5 rounded-lg hover:bg-slate-50">
                    {editingDlgId === m.id ? (
                      <>
                        <input type="date" value={editDlgDate} onChange={e => setEditDlgDate(e.target.value)}
                          className="border border-blue-300 rounded px-2 py-1 text-xs w-32 outline-none focus:border-blue-500" />
                        <Input type="number" step="0.1" value={editDlgVal} onChange={e => setEditDlgVal(e.target.value)}
                          className="h-7 w-20 text-xs text-center" autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') updateMesure.mutate({ id: m.id, poids_kg: parseFloat(editDlgVal), date: editDlgDate });
                            if (e.key === 'Escape') setEditingDlgId(null);
                          }} />
                        <span className="text-xs text-slate-400">kg</span>
                        <button onClick={() => updateMesure.mutate({ id: m.id, poids_kg: parseFloat(editDlgVal), date: editDlgDate })}
                          disabled={updateMesure.isPending} className="text-green-600 hover:text-green-800">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setEditingDlgId(null)} className="text-slate-400 hover:text-slate-600">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-slate-400 w-24 flex-shrink-0">{fmtDate(m.date)}</span>
                        <span className="text-sm font-semibold text-slate-800 w-16">{m.poids_kg} kg</span>
                        {m.commentaire && <span className="text-xs text-slate-400 truncate flex-1">{m.commentaire}</span>}
                        <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingDlgId(m.id); setEditDlgVal(m.poids_kg.toString()); setEditDlgDate(m.date); }}
                            className="text-slate-400 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => deleteMesure.mutate(m.id)}
                            className="text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}

// ─── Residents View ───────────────────────────────────────────────────────────

function ResidentsView({ residents, allMesures, allDossiers, allComplements, floor, onFloorChange, onSelect, alertSettings }: {
  residents: Resident[];
  allMesures: PoidsMesure[];
  allDossiers: DossierNutritionnel[];
  allComplements: ComplementAlimentaire[];
  floor: 'RDC' | '1ER';
  onFloorChange: (f: 'RDC' | '1ER') => void;
  onSelect: (r: Resident) => void;
  alertSettings?: AlertSettings;
}) {
  const [sort, setSort] = useState<'alerte' | 'chambre' | 'nom'>('alerte');

  const filtered = useMemo(() => {
    const base = residents.filter(r => r.floor === floor);
    const alertScore = (r: Resident) => {
      const mesures = allMesures.filter(m => m.resident_id === r.id);
      const dossier = allDossiers.find(d => d.resident_id === r.id);
      const a = computeAlerts(mesures, dossier, alertSettings);
      return (a.denutrition ? 2 : 0) + (a.surcharge ? 1 : 0);
    };
    if (sort === 'chambre') return [...base].sort((a, b) => parseInt(a.room || '0') - parseInt(b.room || '0'));
    if (sort === 'nom') return [...base].sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));
    return [...base].sort((a, b) => {
      const diff = alertScore(b) - alertScore(a);
      if (diff !== 0) return diff;
      return parseInt(a.room || '0') - parseInt(b.room || '0');
    });
  }, [residents, allMesures, allDossiers, floor, sort, alertSettings]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">{filtered.length} résidents</span>
          <div className="flex gap-1 ml-2">
            {([['alerte', 'Alertes'], ['chambre', 'Chambre'], ['nom', 'Nom']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setSort(v)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${sort === v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {(['RDC', '1ER'] as const).map(f => (
            <button key={f} onClick={() => onFloorChange(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${floor === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {filtered.map(r => {
          const mesures = allMesures.filter(m => m.resident_id === r.id);
          const dossier = allDossiers.find(d => d.resident_id === r.id);
          const alerts = computeAlerts(mesures, dossier, alertSettings);
          const sorted2 = [...mesures].sort((a, b) => b.date.localeCompare(a.date));
          const latest = sorted2[0];
          const prev = sorted2[1];
          const hasComplement = allComplements.some(c => c.resident_id === r.id && c.actif);

          let trendPct: number | null = null;
          if (latest && prev && prev.poids_kg > 0) {
            trendPct = ((latest.poids_kg - prev.poids_kg) / prev.poids_kg) * 100;
          }

          return (
            <button key={r.id} onClick={() => onSelect(r)}
              className="w-full text-left bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-blue-300 hover:shadow-md transition-all group flex items-center gap-3">
              <div className="w-12 text-center flex-shrink-0">
                <div className="text-xs text-slate-400">Ch.</div>
                <div className="text-base font-bold text-slate-700">{r.room}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 truncate">{(r.last_name || '').toUpperCase()} {r.first_name}</div>
                {r.medecin && <div className="text-xs text-slate-400">Dr. {r.medecin}</div>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                {alerts.denutrition && (
                  <span className="flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 border border-red-300 rounded-full px-2 py-0.5">
                    <TrendingDown className="h-3 w-3" /> Dénutrition
                  </span>
                )}
                {alerts.surcharge && (
                  <span className="flex items-center gap-1 text-xs font-bold text-orange-700 bg-orange-100 border border-orange-300 rounded-full px-2 py-0.5">
                    <TrendingUp className="h-3 w-3" /> Surcharge
                  </span>
                )}
                {hasComplement && (
                  <span className="flex items-center gap-1 text-xs font-bold text-purple-700 bg-purple-100 border border-purple-300 rounded-full px-2 py-0.5">
                    <Pill className="h-3 w-3" /> Complément
                  </span>
                )}
                {trendPct !== null && (
                  <span className={`flex items-center gap-0.5 text-xs font-semibold rounded-full px-2 py-0.5 border ${
                    trendPct <= -2 ? 'text-red-700 bg-red-50 border-red-200' :
                    trendPct >= 2  ? 'text-green-700 bg-green-50 border-green-200' :
                                     'text-slate-500 bg-slate-50 border-slate-200'
                  }`}>
                    {trendPct <= -2 ? <ArrowDown className="h-3 w-3" /> :
                     trendPct >= 2  ? <ArrowUp className="h-3 w-3" /> :
                                      <ArrowRight className="h-3 w-3" />}
                    {trendPct > 0 ? '+' : ''}{trendPct.toFixed(1)}%
                  </span>
                )}
                {latest ? (
                  <div className="text-right w-24">
                    <div className="text-base font-bold text-blue-700">{latest.poids_kg} kg</div>
                    <div className="text-xs text-slate-400">{fmtDate(latest.date)}</div>
                  </div>
                ) : <div className="text-sm text-slate-300 w-24 text-right">Pas de pesée</div>}
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-400 transition-colors" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Annual View ──────────────────────────────────────────────────────────────

function AnnuelleView({ residents, allMesures }: {
  residents: Resident[];
  allMesures: PoidsMesure[];
}) {
  const [floor, setFloor] = useState<'RDC' | '1ER'>('RDC');
  const currentMonthKey = todayISO().slice(0, 7);

  const months = useMemo(() => {
    const ms: string[] = [];
    const d = new Date();
    for (let i = 11; i >= 0; i--) {
      const dd = new Date(d); dd.setDate(1); dd.setMonth(dd.getMonth() - i);
      ms.push(dd.toISOString().slice(0, 7));
    }
    return ms;
  }, []);

  const lastWeightByMonth = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    [...allMesures].sort((a, b) => b.date.localeCompare(a.date)).forEach(m => {
      const mk = monthKey(m.date);
      if (!map[m.resident_id]) map[m.resident_id] = {};
      if (!(mk in map[m.resident_id])) map[m.resident_id][mk] = m.poids_kg;
    });
    return map;
  }, [allMesures]);

  const filtered = useMemo(() =>
    residents.filter(r => r.floor === floor).sort((a, b) => parseInt(a.room || '0') - parseInt(b.room || '0')),
    [residents, floor]
  );

  const yearGroups = useMemo(() => {
    const groups: { year: string; count: number }[] = [];
    months.forEach(m => {
      const y = m.slice(0, 4);
      const last = groups[groups.length - 1];
      if (last && last.year === y) last.count++;
      else groups.push({ year: y, count: 1 });
    });
    return groups;
  }, [months]);

  // Pour chaque résident : poids + % vs poids précédent non-null dans la fenêtre
  const tableData = useMemo(() => filtered.map(r => {
    const resW = lastWeightByMonth[r.id] ?? {};
    let prev: number | null = null;
    const cells = months.map(m => {
      const w = resW[m];
      if (w === undefined) return { w: null as number | null, pct: null as number | null };
      const pct = prev !== null ? parseFloat(((w - prev) / prev * 100).toFixed(1)) : null;
      prev = w;
      return { w, pct };
    });
    return { r, cells };
  }), [filtered, lastWeightByMonth, months]);

  function cellCls(pct: number | null): { bg: string; wCls: string; pCls: string } {
    if (pct === null) return { bg: '', wCls: 'text-slate-700 font-semibold', pCls: '' };
    if (pct <= -5) return { bg: 'bg-red-100', wCls: 'text-red-800 font-bold', pCls: 'text-red-600' };
    if (pct <= -2) return { bg: 'bg-orange-50', wCls: 'text-orange-800', pCls: 'text-orange-600' };
    if (pct >= 5)  return { bg: 'bg-purple-100', wCls: 'text-purple-800', pCls: 'text-purple-600' };
    return { bg: 'bg-green-50', wCls: 'text-green-800', pCls: 'text-green-600' };
  }

  const handlePrint = () => {
    const mNames = ['Jan.','Fév.','Mar.','Avr.','Mai','Juin','Juil.','Août','Sep.','Oct.','Nov.','Déc.'];
    const pc = (pct: number | null) => {
      if (pct === null) return { bg: 'transparent', col: '#1e293b', pcol: '#64748b' };
      if (pct <= -5) return { bg: '#fee2e2', col: '#991b1b', pcol: '#dc2626' };
      if (pct <= -2) return { bg: '#fff7ed', col: '#9a3412', pcol: '#ea580c' };
      if (pct >= 5)  return { bg: '#f3e8ff', col: '#6b21a8', pcol: '#9333ea' };
      return { bg: '#f0fdf4', col: '#166534', pcol: '#16a34a' };
    };
    const yHtml = `<th style="background:#334155;color:white;padding:3px 6px;text-align:left;font-size:9px;border-right:1px solid #475569;min-width:100px;">Résident</th>`
      + yearGroups.map(yg => `<th colspan="${yg.count}" style="background:#475569;color:white;padding:3px 6px;text-align:center;font-size:9px;border-right:1px solid #64748b;">${yg.year}</th>`).join('');
    const mHtml = `<th style="background:#475569;color:white;padding:3px 6px;border-right:1px solid #64748b;"></th>`
      + months.map(m => {
          const isCur = m === currentMonthKey;
          const lbl = mNames[parseInt(m.slice(5)) - 1];
          return `<th style="padding:3px 4px;text-align:center;font-size:9px;white-space:nowrap;${isCur?'background:#3b82f6;color:white;':'background:#64748b;color:#e2e8f0;'}border-right:1px solid #94a3b8;">${lbl}</th>`;
        }).join('');
    const rows = tableData.map(({ r, cells }, idx) => {
      const cHtml = cells.map((cell, ci) => {
        const isCur = months[ci] === currentMonthKey;
        const curBorder = isCur ? 'border-left:2px solid #3b82f6;border-right:2px solid #3b82f6;' : '';
        if (cell.w === null) return `<td style="padding:3px 4px;text-align:center;color:#cbd5e1;font-size:9px;${isCur?'background:#eff6ff;':''}${curBorder}">—</td>`;
        const { bg, col, pcol } = pc(cell.pct);
        return `<td style="padding:3px 4px;text-align:center;background:${bg};${curBorder}"><div style="font-size:10px;font-weight:600;color:${col};">${cell.w}</div>${cell.pct !== null ? `<div style="font-size:8px;color:${pcol};">${cell.pct > 0 ? '+' : ''}${cell.pct}%</div>` : ''}</td>`;
      }).join('');
      return `<tr style="background:${idx%2===0?'#fff':'#f8fafc'};"><td style="padding:3px 6px;font-size:9px;font-weight:600;color:#374151;white-space:nowrap;border-right:1px solid #e2e8f0;"><span style="color:#94a3b8;margin-right:4px;">${r.room}</span>${(r.last_name||'').toUpperCase()} ${r.first_name||''}</td>${cHtml}</tr>`;
    }).join('');
    const legend = `<div style="display:flex;gap:10px;margin-bottom:8px;font-size:9px;flex-wrap:wrap;align-items:center;">
      <span style="font-weight:600;color:#475569;">Légende :</span>
      <span style="display:flex;align-items:center;gap:3px;"><span style="display:inline-block;width:10px;height:10px;background:#fee2e2;border-radius:2px;border:1px solid #fca5a5;"></span> Perte &gt;5%</span>
      <span style="display:flex;align-items:center;gap:3px;"><span style="display:inline-block;width:10px;height:10px;background:#fff7ed;border-radius:2px;border:1px solid #fed7aa;"></span> Perte 2–5%</span>
      <span style="display:flex;align-items:center;gap:3px;"><span style="display:inline-block;width:10px;height:10px;background:#f3e8ff;border-radius:2px;border:1px solid #d8b4fe;"></span> Prise &gt;5%</span>
      <span style="display:flex;align-items:center;gap:3px;"><span style="display:inline-block;width:10px;height:10px;background:#f0fdf4;border-radius:2px;border:1px solid #86efac;"></span> Stable (&lt;2%)</span>
      <span style="display:flex;align-items:center;gap:3px;"><span style="display:inline-block;width:10px;height:10px;background:#eff6ff;border-radius:2px;border:2px solid #3b82f6;"></span> Mois en cours</span>
    </div>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Vue annuelle — ${floor}</title>
<style>@page{size:A4 landscape;margin:8mm;}*{box-sizing:border-box;margin:0;padding:0;}body{font-family:system-ui,sans-serif;}table{width:100%;border-collapse:collapse;}th,td{border-bottom:1px solid #e2e8f0;}h1{font-size:12px;font-weight:700;margin-bottom:6px;color:#1e293b;}</style>
</head><body>
<h1>Vue annuelle des poids — ${floor} — ${new Date().toLocaleDateString('fr-FR')}</h1>
${legend}
<table><thead><tr>${yHtml}</tr><tr>${mHtml}</tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;';
    document.body.appendChild(iframe);
    iframe.onload = () => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(url); }, 2000); };
    iframe.src = url;
  };

  const legend = [
    { label: 'Perte >5%',  bg: 'bg-red-100',    border: 'border-red-300',    text: 'text-red-700' },
    { label: 'Perte 2–5%', bg: 'bg-orange-50',  border: 'border-orange-300',  text: 'text-orange-700' },
    { label: 'Prise >5%',  bg: 'bg-purple-100', border: 'border-purple-300',  text: 'text-purple-700' },
    { label: 'Stable',     bg: 'bg-green-50',   border: 'border-green-300',   text: 'text-green-700' },
  ];

  return (
    <div>
      {/* Barre titre */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-slate-700 text-sm flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-blue-600" /> Vue annuelle — 12 derniers mois
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {legend.map(({ label, bg, border, text }) => (
              <span key={label} className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border ${bg} ${border} ${text}`}>
                <span className={`w-2.5 h-2.5 rounded-sm border ${bg} ${border} inline-block`} />
                {label}
              </span>
            ))}
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border bg-blue-50 border-blue-400 text-blue-700">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-50 border-2 border-blue-400 inline-block" />
              Mois en cours
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm transition-colors shadow-sm">
            <Printer className="h-3.5 w-3.5" /> Imprimer
          </button>
          {(['RDC', '1ER'] as const).map(f => (
            <button key={f} onClick={() => setFloor(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${floor === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead>
            {/* Ligne années */}
            <tr className="bg-slate-800 text-white">
              <th className="sticky left-0 bg-slate-800 text-left px-3 py-2 font-semibold border-r border-slate-600 min-w-40 text-xs" />
              {yearGroups.map(yg => (
                <th key={yg.year} colSpan={yg.count} className="px-2 py-2 text-center text-xs font-semibold tracking-wide border-r border-slate-600 last:border-r-0">
                  {yg.year}
                </th>
              ))}
            </tr>
            {/* Ligne mois */}
            <tr className="bg-slate-600 text-white">
              <th className="sticky left-0 bg-slate-700 border-r border-slate-500 px-3 py-2 text-left text-xs font-semibold">Résident</th>
              {months.map(m => {
                const isCur = m === currentMonthKey;
                return (
                  <th key={m} className={`px-2 py-2 text-center text-xs font-medium min-w-[62px] ${isCur ? 'bg-blue-600 text-white' : ''}`}>
                    {monthLabel(m)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tableData.map(({ r, cells }, idx) => (
              <tr key={r.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                <td className="sticky left-0 px-3 py-2 font-medium text-slate-700 border-r border-slate-200 bg-inherit whitespace-nowrap text-xs">
                  <span className="text-slate-400 mr-1.5 text-[11px]">{r.room}</span>
                  {(r.last_name || '').toUpperCase()} {r.first_name}
                </td>
                {cells.map((cell, ci) => {
                  const isCur = months[ci] === currentMonthKey;
                  if (cell.w === null) return (
                    <td key={ci} className={`px-2 py-1.5 text-center ${isCur ? 'bg-blue-50 border-x-2 border-blue-300' : ''}`}>
                      <span className="text-slate-200 text-[11px]">·</span>
                    </td>
                  );
                  const { bg, wCls, pCls } = cellCls(cell.pct);
                  return (
                    <td key={ci} className={`px-2 py-1.5 text-center ${bg} ${isCur ? 'border-x-2 border-blue-400' : ''}`}>
                      <div className={`text-[12px] leading-tight ${wCls}`}>{cell.w}</div>
                      {cell.pct !== null && (
                        <div className={`text-[10px] leading-tight ${pCls}`}>{cell.pct > 0 ? '+' : ''}{cell.pct}%</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Complements Tab ──────────────────────────────────────────────────────────

function ComplementsTab({ residents, allComplements, onSelect }: {
  residents: Resident[];
  allComplements: ComplementAlimentaire[];
  onSelect: (r: Resident) => void;
}) {
  const qc = useQueryClient();
  const supabase = createClient();
  const [floor, setFloor] = useState<'RDC' | '1ER'>('RDC');
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formType, setFormType] = useState('');
  const [formDate, setFormDate] = useState(todayISO());
  const [formComment, setFormComment] = useState('');

  const filtered = residents
    .filter(r => r.floor === floor)
    .sort((a, b) => parseInt(a.room || '0') - parseInt(b.room || '0'));

  const byResident = useMemo(() => {
    const map: Record<string, ComplementAlimentaire[]> = {};
    allComplements.forEach(c => {
      if (!map[c.resident_id]) map[c.resident_id] = [];
      map[c.resident_id].push(c);
    });
    return map;
  }, [allComplements]);

  const activeCount = allComplements.filter(c => c.actif).length;

  const addC = useMutation({
    mutationFn: async (residentId: string) => {
      const { data, error } = await supabase.from('complement_alimentaire').insert({
        resident_id: residentId, date_prescription: formDate,
        type_complement: formType, actif: true, commentaire: formComment || null,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData<ComplementAlimentaire[]>(['complements'], old => [...(old ?? []), data as ComplementAlimentaire]);
      setAddingFor(null); setFormType(''); setFormComment(''); setFormDate(todayISO());
      toast.success('Complément ajouté');
    },
    onError: (e: Error) => toast.error('Erreur : ' + e.message),
  });

  const updateC = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('complement_alimentaire')
        .update({ type_complement: formType, date_prescription: formDate, commentaire: formComment || null })
        .eq('id', id);
      if (error) throw error;
      return { id, type_complement: formType, date_prescription: formDate, commentaire: formComment || null };
    },
    onSuccess: ({ id, type_complement, date_prescription, commentaire }) => {
      qc.setQueryData<ComplementAlimentaire[]>(['complements'], old =>
        (old ?? []).map(c => c.id === id ? { ...c, type_complement, date_prescription, commentaire } : c));
      setEditingId(null);
      toast.success('Complément modifié');
    },
    onError: (e: Error) => toast.error('Erreur : ' + e.message),
  });

  const toggleActif = useMutation({
    mutationFn: async ({ id, actif }: { id: string; actif: boolean }) => {
      await supabase.from('complement_alimentaire').update({ actif }).eq('id', id);
      return { id, actif };
    },
    onSuccess: ({ id, actif }) => {
      qc.setQueryData<ComplementAlimentaire[]>(['complements'], old =>
        (old ?? []).map(c => c.id === id ? { ...c, actif } : c));
    },
  });

  const deleteC = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('complement_alimentaire').delete().eq('id', id);
      return id;
    },
    onSuccess: (id) => {
      qc.setQueryData<ComplementAlimentaire[]>(['complements'], old => (old ?? []).filter(c => c.id !== id));
      toast.success('Complément supprimé');
    },
  });

  const openAdd = (residentId: string) => {
    setAddingFor(residentId); setEditingId(null);
    setFormType(''); setFormDate(todayISO()); setFormComment('');
  };

  const openEdit = (c: ComplementAlimentaire) => {
    setEditingId(c.id); setAddingFor(null);
    setFormType(c.type_complement); setFormDate(c.date_prescription); setFormComment(c.commentaire ?? '');
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Pill className="h-4 w-4 text-amber-600" />
          <span className="font-semibold text-slate-700">{activeCount} complément(s) actif(s)</span>
        </div>
        <div className="flex gap-2">
          {(['RDC', '1ER'] as const).map(f => (
            <Button key={f} size="sm" variant={floor === f ? 'default' : 'outline'}
              className="h-8" onClick={() => setFloor(f)}>{f}</Button>
          ))}
        </div>
      </div>

      {/* Resident list */}
      <div className="space-y-2">
        {filtered.map(r => {
          const comps = [...(byResident[r.id] ?? [])].sort((a, b) => b.date_prescription.localeCompare(a.date_prescription));
          const hasActive = comps.some(c => c.actif);
          const isAdding = addingFor === r.id;

          return (
            <div key={r.id} className={`bg-white border rounded-xl p-4 transition-all ${hasActive ? 'border-amber-200' : 'border-slate-200'}`}>
              {/* Resident header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-12 flex-shrink-0">Ch. {r.room}</span>
                  <button onClick={() => onSelect(r)}
                    className="font-semibold text-slate-800 hover:text-blue-600 transition-colors text-left">
                    {(r.last_name || '').toUpperCase()} {r.first_name}
                  </button>
                  {hasActive && (
                    <span className="text-xs bg-amber-100 text-amber-700 border border-amber-300 rounded-full px-2 py-0.5">
                      {comps.filter(c => c.actif).length} actif
                    </span>
                  )}
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => isAdding ? setAddingFor(null) : openAdd(r.id)}>
                  {isAdding
                    ? <><X className="h-3 w-3 mr-1" />Annuler</>
                    : <><Plus className="h-3 w-3 mr-1" />Ajouter</>}
                </Button>
              </div>

              {/* Existing complements */}
              {comps.length > 0 && (
                <div className="space-y-1 mb-2">
                  {comps.map(c => (
                    <div key={c.id}>
                      {editingId === c.id ? (
                        <div className="flex flex-wrap gap-2 items-center bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                          <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                            className="border border-blue-300 rounded px-2 py-1 text-xs outline-none focus:border-blue-500 flex-shrink-0" />
                          <Input value={formType} onChange={e => setFormType(e.target.value)}
                            placeholder="Type de complément" className="h-7 text-xs flex-1 min-w-36" />
                          <Input value={formComment} onChange={e => setFormComment(e.target.value)}
                            placeholder="Commentaire" className="h-7 text-xs flex-1 min-w-28"
                            onKeyDown={e => { if (e.key === 'Enter' && formType.trim()) updateC.mutate(c.id); if (e.key === 'Escape') setEditingId(null); }} />
                          <button onClick={() => updateC.mutate(c.id)} disabled={!formType.trim() || updateC.isPending}
                            className="text-green-600 hover:text-green-800 disabled:opacity-40"><Check className="h-4 w-4" /></button>
                          <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600">
                            <X className="h-4 w-4" /></button>
                        </div>
                      ) : (
                        <div className={`flex items-center gap-2 group px-3 py-1.5 rounded-lg ${c.actif ? 'bg-amber-50' : 'bg-slate-50 opacity-60'}`}>
                          <Pill className={`h-3.5 w-3.5 flex-shrink-0 ${c.actif ? 'text-amber-500' : 'text-slate-400'}`} />
                          <span className={`text-sm font-medium flex-shrink-0 ${c.actif ? 'text-amber-900' : 'text-slate-500'}`}>{c.type_complement}</span>
                          <span className="text-xs text-slate-400">depuis {fmtDate(c.date_prescription)}</span>
                          {c.commentaire && <span className="text-xs text-slate-400 italic truncate">— {c.commentaire}</span>}
                          <div className="ml-auto flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button onClick={() => toggleActif.mutate({ id: c.id, actif: !c.actif })}
                              className={`text-xs px-2 py-0.5 rounded border transition-colors ${c.actif ? 'border-amber-300 text-amber-700 bg-amber-100 hover:bg-amber-200' : 'border-slate-300 text-slate-500 bg-white hover:bg-slate-100'}`}>
                              {c.actif ? 'Actif' : 'Inactif'}
                            </button>
                            <button onClick={() => openEdit(c)} className="text-slate-400 hover:text-blue-600">
                              <Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => { if (window.confirm('Supprimer ce complément ?')) deleteC.mutate(c.id); }}
                              className="text-slate-400 hover:text-red-600">
                              <Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add form inline */}
              {isAdding && (
                <div className="flex flex-wrap gap-2 items-center bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-1">
                  <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)}
                    className="border border-green-300 rounded px-2 py-1 text-xs outline-none focus:border-green-500 flex-shrink-0" />
                  <Input value={formType} onChange={e => setFormType(e.target.value)} autoFocus
                    placeholder="Type (ex : Forticreme, Renutryl…)" className="h-7 text-xs flex-1 min-w-40"
                    onKeyDown={e => { if (e.key === 'Enter' && formType.trim()) addC.mutate(r.id); if (e.key === 'Escape') setAddingFor(null); }} />
                  <Input value={formComment} onChange={e => setFormComment(e.target.value)}
                    placeholder="Commentaire (optionnel)" className="h-7 text-xs flex-1 min-w-28" />
                  <Button size="sm" onClick={() => addC.mutate(r.id)} disabled={!formType.trim() || addC.isPending}
                    className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white">
                    <Check className="h-3 w-3 mr-1" /> Enregistrer
                  </Button>
                </div>
              )}

              {!comps.length && !isAdding && (
                <p className="text-xs text-slate-400 italic">Aucun complément alimentaire</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SurveillancePoidsPage() {
  const supabase = createClient();
  const qc = useQueryClient();
  const [floor, setFloor] = useState<'RDC' | '1ER'>('RDC');
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);
  const [showDenSettings, setShowDenSettings] = useState(false);
  const [showSurSettings, setShowSurSettings] = useState(false);

  const { data: residents = [] } = useQuery<Resident[]>({
    queryKey: ['residents'],
    queryFn: async () => {
      const { data, error } = await supabase.from('residents').select('*').order('room');
      if (error) throw new Error(error.message);
      return data as Resident[];
    },
  });

  const { data: allMesures = [] } = useQuery<PoidsMesure[]>({
    queryKey: ['poids'],
    queryFn: async () => {
      const pageSize = 1000;
      let all: PoidsMesure[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from('poids_mesure')
          .select('*')
          .order('date')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw new Error(error.message);
        all = all.concat((data ?? []) as PoidsMesure[]);
        if (!data || data.length < pageSize) break;
        page++;
      }
      return all;
    },
    staleTime: 0,
  });

  const { data: allComplements = [] } = useQuery<ComplementAlimentaire[]>({
    queryKey: ['complements'],
    queryFn: async () => {
      const { data, error } = await supabase.from('complement_alimentaire').select('*');
      if (error) throw new Error(error.message);
      return data as ComplementAlimentaire[];
    },
  });

  const { data: allSuivis = [] } = useQuery<SuiviClinique[]>({
    queryKey: ['suivis'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suivi_clinique_nutritionnel').select('*');
      if (error) throw new Error(error.message);
      return data as SuiviClinique[];
    },
  });

  const { data: allDossiers = [] } = useQuery<DossierNutritionnel[]>({
    queryKey: ['dossiers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('dossier_nutritionnel').select('*');
      if (error) throw new Error(error.message);
      return data as DossierNutritionnel[];
    },
  });

  const { data: alertSettings = DEFAULT_ALERT_SETTINGS } = useQuery<AlertSettings>({
    queryKey: ['alertSettings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('alert_settings').select('*').eq('id', 'default').single();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      return (data as AlertSettings) ?? DEFAULT_ALERT_SETTINGS;
    },
  });

  const saveAlertSettings = useMutation({
    mutationFn: async (values: Partial<AlertSettings>) => {
      const { error } = await supabase.from('alert_settings').upsert({ id: 'default', ...values });
      if (error) throw error;
      return values;
    },
    onSuccess: (values) => {
      qc.setQueryData<AlertSettings>(['alertSettings'], old => ({ ...(old ?? DEFAULT_ALERT_SETTINGS), ...values }));
      setShowDenSettings(false);
      setShowSurSettings(false);
      toast.success('Paramètres enregistrés');
    },
    onError: (e: Error) => toast.error('Erreur : ' + e.message),
  });

  const alertsByResident = useMemo(() => {
    const map: Record<string, AlertInfo> = {};
    residents.forEach(r => {
      map[r.id] = computeAlerts(
        allMesures.filter(m => m.resident_id === r.id),
        allDossiers.find(d => d.resident_id === r.id),
        alertSettings,
      );
    });
    return map;
  }, [residents, allMesures, allDossiers, alertSettings]);

  const denutritionList = residents.filter(r => alertsByResident[r.id]?.denutrition);
  const surchargeList = residents.filter(r => alertsByResident[r.id]?.surcharge);

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-800 to-blue-900 text-white py-5 px-8 shadow-lg">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <Scale className="h-7 w-7 text-blue-200" />
            <div>
              <h1 className="text-2xl font-bold">Surveillance du Poids</h1>
              <p className="text-blue-200 text-sm">Bilan nutritionnel — {residents.length} résidents</p>
            </div>
          </div>
        </div>

        {/* Alert banners */}
        <div className="max-w-6xl mx-auto px-8 pt-5 grid grid-cols-2 gap-4">
          {/* Dénutrition */}
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
              <h3 className="font-bold text-red-800">Alertes dénutrition</h3>
              <span className="bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">{denutritionList.length}</span>
              <button onClick={() => { setShowDenSettings(s => !s); setShowSurSettings(false); }}
                title="Paramètres détection dénutrition"
                className={`ml-auto p-1 rounded-lg transition-colors ${showDenSettings ? 'bg-red-200 text-red-700' : 'text-red-400 hover:text-red-700 hover:bg-red-100'}`}>
                <Settings className="h-4 w-4" />
              </button>
            </div>
            {showDenSettings && (
              <DenutritionSettingsPanel
                settings={alertSettings}
                onSave={v => saveAlertSettings.mutate(v)}
                onClose={() => setShowDenSettings(false)}
              />
            )}
            {denutritionList.length === 0
              ? <p className="text-sm text-red-400 italic">Aucune alerte</p>
              : (
                <>
                  {(['RDC', '1ER'] as const).map(f => {
                    const list = denutritionList.filter(r => r.floor === f);
                    if (!list.length) return null;
                    return (
                      <div key={f} className="mb-1.5">
                        <span className="text-xs font-semibold text-red-500 uppercase">{f}</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {list.map(r => (
                            <button key={r.id} onClick={() => setSelectedResident(r)}
                              className="text-xs bg-red-100 border border-red-300 text-red-800 rounded-full px-2 py-0.5 hover:bg-red-200 transition-colors">
                              {r.last_name} Ch.{r.room}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
          </div>
          {/* Surcharge */}
          <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-5 w-5 text-orange-600" />
              <h3 className="font-bold text-orange-800">Alertes surcharge pondérale</h3>
              <span className="bg-orange-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">{surchargeList.length}</span>
              <button onClick={() => { setShowSurSettings(s => !s); setShowDenSettings(false); }}
                title="Paramètres détection surcharge"
                className={`ml-auto p-1 rounded-lg transition-colors ${showSurSettings ? 'bg-orange-200 text-orange-700' : 'text-orange-400 hover:text-orange-700 hover:bg-orange-100'}`}>
                <Settings className="h-4 w-4" />
              </button>
            </div>
            {showSurSettings && (
              <SurchargeSettingsPanel
                settings={alertSettings}
                onSave={v => saveAlertSettings.mutate(v)}
                onClose={() => setShowSurSettings(false)}
              />
            )}
            {surchargeList.length === 0
              ? <p className="text-sm text-orange-400 italic">Aucune alerte</p>
              : (
                <>
                  {(['RDC', '1ER'] as const).map(f => {
                    const list = surchargeList.filter(r => r.floor === f);
                    if (!list.length) return null;
                    return (
                      <div key={f} className="mb-1.5">
                        <span className="text-xs font-semibold text-orange-500 uppercase">{f}</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {list.map(r => (
                            <button key={r.id} onClick={() => setSelectedResident(r)}
                              className="text-xs bg-orange-100 border border-orange-300 text-orange-800 rounded-full px-2 py-0.5 hover:bg-orange-200 transition-colors">
                              {r.last_name} Ch.{r.room}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
          </div>
        </div>

        {/* Main content */}
        <div className="max-w-6xl mx-auto px-8 py-6">
          <Tabs defaultValue="pesee">
            <TabsList className="mb-6">
              <TabsTrigger value="pesee">Pesée du jour</TabsTrigger>
              <TabsTrigger value="residents">Résidents</TabsTrigger>
              <TabsTrigger value="annuelle">Annuelle</TabsTrigger>
              <TabsTrigger value="complements">
                Compléments
                {allComplements.filter(c => c.actif).length > 0 && (
                  <span className="ml-1.5 bg-amber-500 text-white rounded-full text-xs w-4 h-4 flex items-center justify-center font-bold">
                    {allComplements.filter(c => c.actif).length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pesee">
              <PeseeView residents={residents} allMesures={allMesures} floor={floor} onFloorChange={setFloor} />
            </TabsContent>
            <TabsContent value="residents">
              <ResidentsView residents={residents} allMesures={allMesures} allDossiers={allDossiers} allComplements={allComplements} floor={floor} onFloorChange={setFloor} onSelect={setSelectedResident} alertSettings={alertSettings} />
            </TabsContent>
            <TabsContent value="annuelle">
              <AnnuelleView residents={residents} allMesures={allMesures} />
            </TabsContent>
            <TabsContent value="complements">
              <ComplementsTab residents={residents} allComplements={allComplements} onSelect={setSelectedResident} />
            </TabsContent>
          </Tabs>
        </div>

      </div>

      {selectedResident && (
        <ResidentModal
          resident={selectedResident}
          allMesures={allMesures}
          allComplements={allComplements}
          allDossiers={allDossiers}
          alertSettings={alertSettings}
          onClose={() => setSelectedResident(null)}
        />
      )}

      <HomeButton />
    </>
  );
}
