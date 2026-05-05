'use client';

import { useState, useEffect, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import {
  Save, X, Check, AlertCircle, Trash2, Eye, UserPen,
  Users, CalendarClock, History, Loader2, Printer, Search, NotebookPen,
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fetchColorOverrides, darkenHex, type ColorOverrides } from '@/lib/module-colors';
import { MODULES } from '@/components/dashboard/module-config';
import { toast } from 'sonner';
import PAPView from '@/components/pap/PAPView';
import PrintReferentsTable from '@/components/pap/PrintReferentsTable';
import { useModuleAccess } from '@/lib/use-module-access';
import { useEffectiveRole } from '@/lib/use-effective-role';

// ── Network background ────────────────────────────────────────────────────────

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

// ─── Types ──────────────────────────────────────────────────────────────────

interface Resident {
  id: string; title: string; first_name: string; last_name: string;
  room: string; section: string; referent: string; sort_order: number;
  date_naissance?: string | null;
}

interface Pap {
  id: string; resident_id: string; resident_name: string;
  date_redaction: string;
  date_naissance: string; service_chambre: string;
  date_reunion: string; date_reevaluation: string;
  presents: string; capacite: string;
  souhait_projet: string; souhait_participation: string; souhait_entourage: string;
  donnees_identite: string; souhait_denomination: string; contexte_entree: string;
  souhaits_fin_vie: string; entourage: string; droit_image: string;
  situation_familiale: string; vie_professionnelle: string; episodes_importants: string;
  besoin_boire_manger: string; eliminer: string; mouvoir_posture: string;
  dormir_reposer: string; vetir_devtir: string; propre_teguments: string;
  eviter_dangers: string; communication: string; croyances_valeurs: string;
  occupation_recreation: string; apprendre: string; ressenti_adaptation: string;
  risque_fugue: boolean; risque_addictions: boolean; risque_chutes: boolean;
  risque_denutrition: boolean; risque_sexualite: boolean; risque_harcelement: boolean;
  risque_radicalisation: boolean; risque_suicidaire: boolean; risques_autres: string;
  accueil_premiers_jours: string; soins: string; repas: string;
  ambiance_generale: string; remarques_particulieres: string;
  objectifs: string; capacite_information: string; date_signature: string;
  created_at: string;
}

type PapForm = Omit<Pap, 'id' | 'resident_id' | 'resident_name' | 'created_at'>;

// ─── Constants ──────────────────────────────────────────────────────────────

const emptyForm: PapForm = {
  date_redaction: new Date().toISOString().split('T')[0],
  date_naissance: '', service_chambre: '', date_reunion: '', date_reevaluation: '',
  presents: '', capacite: '', souhait_projet: '', souhait_participation: '', souhait_entourage: '',
  donnees_identite: '', souhait_denomination: '', contexte_entree: '', souhaits_fin_vie: '',
  entourage: '', droit_image: '', situation_familiale: '', vie_professionnelle: '', episodes_importants: '',
  besoin_boire_manger: '', eliminer: '', mouvoir_posture: '', dormir_reposer: '', vetir_devtir: '',
  propre_teguments: '', eviter_dangers: '', communication: '', croyances_valeurs: '',
  occupation_recreation: '', apprendre: '', ressenti_adaptation: '',
  risque_fugue: false, risque_addictions: false, risque_chutes: false, risque_denutrition: false,
  risque_sexualite: false, risque_harcelement: false, risque_radicalisation: false, risque_suicidaire: false,
  risques_autres: '', accueil_premiers_jours: '', soins: '', repas: '', ambiance_generale: '',
  remarques_particulieres: '', objectifs: '', capacite_information: '', date_signature: '',
};

const TEXT_FIELDS: (keyof PapForm)[] = [
  'date_redaction', 'date_naissance', 'service_chambre', 'date_reunion', 'date_reevaluation', 'presents', 'capacite',
  'souhait_projet', 'souhait_participation', 'souhait_entourage', 'donnees_identite',
  'souhait_denomination', 'contexte_entree', 'souhaits_fin_vie', 'entourage', 'droit_image',
  'situation_familiale', 'vie_professionnelle', 'episodes_importants', 'besoin_boire_manger',
  'eliminer', 'mouvoir_posture', 'dormir_reposer', 'vetir_devtir', 'propre_teguments',
  'eviter_dangers', 'communication', 'croyances_valeurs', 'occupation_recreation', 'apprendre',
  'ressenti_adaptation', 'risques_autres', 'accueil_premiers_jours', 'soins', 'repas',
  'ambiance_generale', 'remarques_particulieres', 'objectifs', 'capacite_information', 'date_signature',
];

const RISQUES = [
  { key: 'risque_fugue', label: 'Risques de fugue ou de disparition' },
  { key: 'risque_addictions', label: 'Risques liés aux addictions et / ou aux conduites dangereuses' },
  { key: 'risque_chutes', label: 'Risques liés aux chutes' },
  { key: 'risque_denutrition', label: 'Risques liés à la dénutrition / malnutrition et / ou troubles de la déglutition' },
  { key: 'risque_sexualite', label: 'Risques liés à la sexualité' },
  { key: 'risque_harcelement', label: 'Risques de harcèlement et / ou d\'abus de faiblesse' },
  { key: 'risque_radicalisation', label: 'Risque de radicalisation et / ou de prosélytisme' },
  { key: 'risque_suicidaire', label: 'Risque suicidaire' },
] as const;

function computeProgress(form: Partial<PapForm>): number {
  const filled = TEXT_FIELDS.filter(f => {
    const v = form[f];
    return v && String(v).trim().length > 0;
  }).length;
  return Math.round((filled / TEXT_FIELDS.length) * 100);
}

// ─── PAPForm Component ───────────────────────────────────────────────────────

function PAPFormComp({
  resident, initialData, onSave, onCancel, isSaving, readOnly, canEditRestricted,
}: {
  resident: Resident;
  initialData?: Pap | null;
  onSave: (data: PapForm) => void;
  onCancel: () => void;
  isSaving: boolean;
  readOnly?: boolean;
  canEditRestricted: boolean;
}) {
  const [form, setForm] = useState<PapForm>(
    initialData
      ? { ...emptyForm, ...initialData }
      : { ...emptyForm, date_naissance: resident.date_naissance || '' }
  );

  useEffect(() => {
    if (initialData) setForm({ ...emptyForm, ...initialData });
    else setForm({ ...emptyForm, date_naissance: resident.date_naissance || '' });
  }, [initialData, resident.date_naissance]);

  const handleChange = (field: keyof PapForm, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const ta = (field: keyof PapForm, rows = 2, disabled = false) => (
    <textarea
      value={(form[field] as string) || ''}
      onChange={e => handleChange(field, e.target.value)}
      rows={rows}
      disabled={disabled}
      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400 resize-y disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
    />
  );
  const inp = (field: keyof PapForm, type = 'text', placeholder = '', disabled = false) => (
    <input
      type={type}
      value={(form[field] as string) || ''}
      onChange={e => handleChange(field, e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
    />
  );

  const restricted = !canEditRestricted;

  const progress = computeProgress(form);
  const progressColor = progress < 30 ? 'bg-red-400' : progress < 70 ? 'bg-amber-400' : 'bg-green-500';

  const section = (title: string, children: React.ReactNode) => (
    <section className="space-y-3">
      <h3 className="text-xs font-bold text-white bg-slate-700 uppercase px-3 py-1.5 rounded tracking-wider">{title}</h3>
      {children}
    </section>
  );

  const field = (label: string, input: React.ReactNode) => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {input}
    </div>
  );

  return (
    <div className="max-h-[80vh] overflow-y-auto">
      {/* Progress bar sticky */}
      <div className="sticky top-0 z-10 bg-white border-b px-6 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-slate-600">Progression du formulaire</span>
          <span className="text-xs font-bold text-slate-700">{progress}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2">
          <div className={`${progressColor} h-2 rounded-full transition-all duration-500`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="space-y-6 p-6">

        {/* ── Date de rédaction ── */}
        <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
            <CalendarClock className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-indigo-700 mb-1">Date de rédaction du PAP <span className="text-red-400">*</span></label>
            <input
              type="date"
              value={form.date_redaction || ''}
              onChange={e => handleChange('date_redaction', e.target.value)}
              className="px-3 py-1.5 border border-indigo-200 rounded-lg text-sm outline-none focus:border-indigo-400 bg-white"
            />
          </div>
          <p className="text-xs text-indigo-500 hidden sm:block">Cette date est utilisée pour suivre les PAP récents dans le tableau de bord</p>
        </div>

        {section('Informations générales',
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {field('Date de naissance', inp('date_naissance', 'date'))}
            {field('Service - Chambre', inp('service_chambre', 'text', 'Ex: Mapad - 101'))}
            {field('Date de la réunion', inp('date_reunion', 'date', '', restricted))}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Date de réévaluation
                {restricted && <span className="ml-1 text-[10px] text-slate-400 font-normal italic">(admin/psychologue)</span>}
              </label>
              <div className="flex gap-2 items-center">
                <select
                  disabled={restricted}
                  className="px-2 py-1.5 border border-slate-300 rounded-md text-sm disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                  defaultValue=""
                  onChange={e => {
                    if (!e.target.value) return;
                    const months = parseInt(e.target.value);
                    const base = form.date_reunion ? new Date(form.date_reunion) : new Date();
                    base.setMonth(base.getMonth() + months);
                    handleChange('date_reevaluation', base.toISOString().split('T')[0]);
                    e.target.value = '';
                  }}
                >
                  <option value="">Dans x mois…</option>
                  {[1, 2, 3, 4, 5, 6, 9, 12, 18, 24].map(m => (
                    <option key={m} value={m}>{m} mois</option>
                  ))}
                </select>
                <input type="date" value={form.date_reevaluation || ''}
                  onChange={e => handleChange('date_reevaluation', e.target.value)}
                  disabled={restricted}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed" />
                {form.date_reevaluation && !restricted && (
                  <button type="button" onClick={() => handleChange('date_reevaluation', '')} className="text-slate-400 hover:text-slate-700 text-xs">✕</button>
                )}
              </div>
            </div>
            {field('Personnes présentes', inp('presents', 'text', '', restricted))}
          </div>
        )}

        {section('Souhait de la personne concernant son PAP et capacité',
          <>
            {field('Capacité de la personne', ta('capacite'))}
            {field('Souhait de réaliser le projet personnalisé', ta('souhait_projet'))}
            {field('Souhait de participer à la réalisation du projet personnalisé', ta('souhait_participation'))}
            {field('Souhait de faire participer son entourage et de l\'informer', ta('souhait_entourage'))}
          </>
        )}

        {section('Renseignements généraux',
          <>
            {field('Données d\'identité / identification du résident', ta('donnees_identite'))}
            {field('Souhait de la personne en lien avec sa dénomination', ta('souhait_denomination'))}
            {field('Contexte d\'entrée', ta('contexte_entree'))}
            {field('Souhaits de fin de vie', ta('souhaits_fin_vie'))}
            {field('Entourage', ta('entourage'))}
            {field('Droit à l\'image', ta('droit_image'))}
          </>
        )}

        {section('Histoire de vie',
          <>
            {field('Situation familiale', ta('situation_familiale'))}
            {field('Vie professionnelle', ta('vie_professionnelle'))}
            {field('Épisodes importants de sa vie', ta('episodes_importants'))}
          </>
        )}

        {section('Habitudes de vie / souhaits exprimés ou collectés par les professionnels',
          <>
            {field('Besoin de boire et manger', ta('besoin_boire_manger', 1))}
            {field('Éliminer', ta('eliminer', 1))}
            {field('Se mouvoir et maintenir une bonne posture', ta('mouvoir_posture', 1))}
            {field('Dormir et se reposer', ta('dormir_reposer', 1))}
            {field('Se vêtir et se dévêtir', ta('vetir_devtir', 1))}
            {field('Être propre, protéger ses téguments', ta('propre_teguments', 1))}
            {field('Éviter les dangers', ta('eviter_dangers', 1))}
            {field('Communication', ta('communication', 1))}
            {field('Agir selon ses croyances et ses valeurs', ta('croyances_valeurs', 1))}
            {field('S\'occuper en vue de se réaliser et/ou de se récréer', ta('occupation_recreation', 1))}
            {field('Besoin d\'apprendre', ta('apprendre', 1))}
            {field('Ressenti suite à l\'entrée / Adaptation', ta('ressenti_adaptation', 1))}
          </>
        )}

        {section('Identifications de risques auxquels la personne accompagnée peut être confrontée',
          <div className="space-y-2">
            {RISQUES.map(({ key, label }) => (
              <label key={key} className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={!!(form[key as keyof PapForm])}
                  onChange={() => handleChange(key as keyof PapForm, !(form[key as keyof PapForm]))}
                  className="mt-0.5" />
                <span className="text-xs text-slate-700">{label}</span>
              </label>
            ))}
            <div className="mt-2">
              {field('Autres risques', ta('risques_autres'))}
            </div>
          </div>
        )}

        {section('Remarques particulières',
          <>
            {field('L\'accueil des premiers jours', ta('accueil_premiers_jours', 1))}
            {field('Les soins', ta('soins', 1))}
            {field('Les repas', ta('repas', 1))}
            {field('L\'ambiance générale', ta('ambiance_generale', 1))}
            {field('Autres remarques', ta('remarques_particulieres', 2))}
          </>
        )}

        {section('Objectifs et signature',
          <>
            {restricted && (
              <p className="text-xs text-slate-500 italic bg-slate-50 border border-slate-200 rounded px-3 py-2">
                Cette section est réservée aux rôles admin et psychologue.
              </p>
            )}
            {field('L\'équipe pluridisciplinaire retient la proposition des objectifs présentés ci-dessous',
              ta('objectifs', 3, restricted))}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Capacité concernant l'information</label>
              <select value={form.capacite_information || ''}
                onChange={e => handleChange('capacite_information', e.target.value)}
                disabled={restricted}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed">
                <option value="">-- Sélectionner --</option>
                <option value="informee">La personne a la capacité d'être informée sur son PAP</option>
                <option value="capable_signer">La personne a la capacité de signer son PAP</option>
                <option value="refuse_signer">La personne refuse de signer son PAP</option>
                <option value="information_pas_capable">La personne a eu l'information mais n'a pas la capacité de signer son PAP</option>
                <option value="pas_capable">La personne n'a pas la capacité de recevoir l'information et de signer son PAP</option>
              </select>
            </div>
            {field('Date de signature', inp('date_signature', 'date', '', restricted))}
          </>
        )}

        <div className="flex gap-3 justify-end pt-4 border-t flex-wrap">
          <button onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
            Annuler
          </button>
          <button onClick={() => onSave(form)} disabled={isSaving || readOnly}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-700 disabled:opacity-50 transition-colors">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

function PAPPageInner() {
  const supabase = createClient();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const access = useModuleAccess('pap');
  const readOnly = access === 'read';
  const effectiveRole = useEffectiveRole();
  const canEditRestricted = effectiveRole === 'admin' || effectiveRole === 'psychologue';

  // Module color system
  const { data: colorOverrides = {} } = useQuery<ColorOverrides>({
    queryKey: ['settings', 'module_colors'],
    queryFn: fetchColorOverrides,
    staleTime: 30000,
  });
  const papModule = MODULES.find(m => m.id === 'pap');
  const colorFrom = colorOverrides['pap']?.from ?? papModule?.cardFrom ?? '#d63052';
  const colorTo   = colorOverrides['pap']?.to   ?? papModule?.cardTo   ?? '#a81535';

  const [editingId, setEditingId] = useState<string | null>(null);
  // Ouvre directement la vue si ?view=RESIDENT_ID est dans l'URL (vient du widget dashboard)
  const [viewingId, setViewingId] = useState<string | null>(searchParams.get('view'));
  const [historyResidentId, setHistoryResidentId] = useState<string | null>(null);
  const [viewingVersion, setViewingVersion] = useState<{ pap: Pap; res: Resident; date: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ papId: string; residentName: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'tous' | 'faits' | 'a_faire'>(
    (searchParams.get('filter') as 'tous' | 'faits' | 'a_faire') ?? 'tous'
  );
  const [filterReferent, setFilterReferent] = useState('');
  const [showSansReferents, setShowSansReferents] = useState(false);
  const [showPrintReferents, setShowPrintReferents] = useState(false);
  const [showGestionReferents, setShowGestionReferents] = useState(false);
  const [editingReferentName, setEditingReferentName] = useState<{ old: string; new: string } | null>(null);
  const [assigningReferentFor, setAssigningReferentFor] = useState<string | null>(null);
  const [newReferentName, setNewReferentName] = useState('');
  const [editingReferent, setEditingReferent] = useState<{ residentId: string; value: string } | null>(null);
  const [extraReferentsList, setExtraReferentsList] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('extra_referents') || '[]'); } catch { return []; }
  });

  // ── Queries ──────────────────────────────────────────────────
  const { data: residents = [], isLoading: residentsLoading } = useQuery({
    queryKey: ['residents'],
    queryFn: async () => {
      const { data, error } = await supabase.from('residents').select('*').eq('archived', false).order('sort_order');
      if (error) throw error;
      return data as Resident[];
    },
  });

  const { data: paps = [], isLoading: papsLoading } = useQuery({
    queryKey: ['paps'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pap').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Pap[];
    },
  });

  const { data: versions = [] } = useQuery({
    queryKey: ['pap_versions', historyResidentId],
    queryFn: async () => {
      if (!historyResidentId) return [];
      const { data, error } = await supabase.from('pap_version')
        .select('*').eq('resident_id', historyResidentId).order('saved_at', { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!historyResidentId,
  });

  // ── Mutations ────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async ({ residentId, form }: { residentId: string; form: PapForm }) => {
      const res = residents.find(r => r.id === residentId)!;
      const existing = paps.find(p => p.resident_id === residentId);
      const payload = {
        resident_id: residentId,
        resident_name: `${res.title} ${res.last_name}`,
        ...form,
      };
      if (existing) {
        // Archive the current version
        await supabase.from('pap_version').insert({
          resident_id: existing.resident_id,
          resident_name: existing.resident_name,
          saved_at: new Date().toISOString(),
          data: existing,
        });
        const { error } = await supabase.from('pap').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('pap').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['paps'] });
      qc.invalidateQueries({ queryKey: ['pap_versions', editingId] });
      setEditingId(null);
      toast.success('PAP enregistré');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (papId: string) => {
      const { error } = await supabase.from('pap').delete().eq('id', papId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['paps'] }); toast.success('PAP supprimé'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateResidentMutation = useMutation({
    mutationFn: async ({ id, referent }: { id: string; referent: string }) => {
      const { error } = await supabase.from('residents').update({ referent }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['residents'] }); setEditingReferent(null); toast.success('Référent mis à jour'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const renameReferentMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
      const toUpdate = residents.filter(r => r.referent === oldName);
      await Promise.all(toUpdate.map(r =>
        supabase.from('residents').update({ referent: newName.trim() }).eq('id', r.id)
      ));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['residents'] }); setEditingReferentName(null); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteReferentMutation = useMutation({
    mutationFn: async (name: string) => {
      const toUpdate = residents.filter(r => r.referent === name);
      await Promise.all(toUpdate.map(r =>
        supabase.from('residents').update({ referent: '' }).eq('id', r.id)
      ));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['residents'] }),
    onError: (err: Error) => toast.error(err.message),
  });

  // ── Computed values ───────────────────────────────────────────
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const residentsAvecNom = residents.filter(r => r.last_name?.trim() && r.first_name?.trim());
  const nbFaits = residentsAvecNom.filter(r => paps.some(p => p.resident_id === r.id)).length;
  const nbTotal = residentsAvecNom.length;
  const nbAFaire = nbTotal - nbFaits;
  const nbChambresVides = residents.length - residentsAvecNom.length;

  const sansReferentResidents = residentsAvecNom.filter(r => !r.referent);
  const nbSansReferent = sansReferentResidents.length;

  const allReferents = [...new Set([
    ...residents.map(r => r.referent).filter(Boolean),
    ...extraReferentsList,
  ])].sort() as string[];

  const referentsStats = allReferents.map(ref => ({
    name: ref,
    count: residents.filter(r => r.referent === ref).length,
    residents: residents.filter(r => r.referent === ref).sort((a, b) => (a.first_name || '').localeCompare(b.first_name || '')),
  })).sort((a, b) => a.count !== b.count ? a.count - b.count : a.name.localeCompare(b.name));

  const papsDueThisMonth = paps.filter(p => p.date_reevaluation?.slice(0, 7) === currentYearMonth);

  const prochaines4 = paps
    .filter(p => p.date_reevaluation)
    .map(p => ({ ...p, _date: new Date(p.date_reevaluation) }))
    .filter(p => p._date >= today)
    .sort((a, b) => a._date.getTime() - b._date.getTime())
    .slice(0, 4);

  const sortedResidents = [...residentsAvecNom].sort((a, b) =>
    (a.last_name || '').toUpperCase().localeCompare((b.last_name || '').toUpperCase())
  );

  const filteredResidents = sortedResidents.filter(r => {
    const hasPap = paps.some(p => p.resident_id === r.id);
    if (!`${r.last_name} ${r.first_name} ${r.room}`.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filter === 'faits' && !hasPap) return false;
    if (filter === 'a_faire' && hasPap) return false;
    if (filterReferent && r.referent !== filterReferent) return false;
    return true;
  });

  const handleDeleteConfirm = () => {
    deleteMutation.mutate(deleteTarget!.papId);
    setDeleteTarget(null);
  };

  const editingPap = editingId ? paps.find(p => p.resident_id === editingId) : null;
  const editingResident = editingId ? residents.find(r => r.id === editingId) : null;

  if (residentsLoading || papsLoading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="min-h-screen relative" style={{ background: '#dde4ee' }}>
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
      <div className="relative" style={{ zIndex: 1 }}>

      {/* ── Gradient Header ── */}
      <div className="print:hidden relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${colorFrom} 0%, ${colorTo} 100%)` }}>
        <div className="absolute inset-0 pointer-events-none"><NetworkBackground /></div>
        <div className="relative z-10 max-w-6xl mx-auto px-6 py-5">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <span>›</span>
            <span className="text-white/75">PAP</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <NotebookPen className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">PAP</h1>
              <p className="text-sm text-white/60 mt-0.5">Projets d&apos;Accompagnement Personnalisé</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-white/60 p-6">

        {readOnly && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-blue-700 font-medium">
            <Eye className="h-4 w-4 flex-shrink-0" />
            Vous consultez cette page en lecture seule.
          </div>
        )}

        {/* Prochaines réévaluations */}
        {prochaines4.length > 0 && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 items-start">
            <CalendarClock className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-blue-800 text-sm mb-2">Prochaines réévaluations</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {prochaines4.map(p => {
                  const res = residents.find(r => r.id === p.resident_id);
                  const diffDays = Math.round((p._date.getTime() - today.getTime()) / 86400000);
                  const label = diffDays === 0 ? "Aujourd'hui" : diffDays === 1 ? 'Demain' : `Dans ${diffDays}j`;
                  return (
                    <button key={p.id} onClick={() => setEditingId(p.resident_id)}
                      className="text-left bg-white border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-100 transition-colors">
                      <div className="text-xs font-semibold text-blue-900">{res ? `${res.last_name} ${res.first_name}` : p.resident_name}</div>
                      <div className="text-xs text-blue-500 mt-0.5">{p._date.toLocaleDateString('fr-FR')} · <span className="font-medium">{label}</span></div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Alerte réévaluations ce mois */}
        {papsDueThisMonth.length > 0 && (
          <div className="mb-5 bg-orange-50 border border-orange-300 rounded-xl p-4 flex gap-3 items-start">
            <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-orange-800 text-sm mb-1">{papsDueThisMonth.length} PAP à réévaluer ce mois-ci</div>
              <div className="flex flex-wrap gap-2">
                {papsDueThisMonth.map(p => {
                  const res = residents.find(r => r.id === p.resident_id);
                  return (
                    <button key={p.id} onClick={() => setEditingId(p.resident_id)}
                      className="text-xs bg-orange-100 hover:bg-orange-200 text-orange-800 border border-orange-200 px-2 py-1 rounded-md font-medium transition-colors">
                      {res ? `${res.last_name} ${res.first_name}` : p.resident_name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-3 mb-5 flex-wrap">
          <button onClick={() => setFilter(filter === 'faits' ? 'tous' : 'faits')}
            className={`bg-green-50 border rounded-xl px-4 py-3 flex items-center gap-3 transition-colors ${filter === 'faits' ? 'border-green-500 ring-2 ring-green-300' : 'border-green-200 hover:bg-green-100'}`}>
            <Check className="h-5 w-5 text-green-600" />
            <div><div className="text-2xl font-bold text-green-700">{nbFaits}</div><div className="text-xs text-green-600 font-medium">PAP faits</div></div>
          </button>
          <button onClick={() => setFilter(filter === 'a_faire' ? 'tous' : 'a_faire')}
            className={`bg-amber-50 border rounded-xl px-4 py-3 flex items-center gap-3 transition-colors ${filter === 'a_faire' ? 'border-amber-500 ring-2 ring-amber-300' : 'border-amber-200 hover:bg-amber-100'}`}>
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <div><div className="text-2xl font-bold text-amber-700">{nbAFaire}</div><div className="text-xs text-amber-600 font-medium">À faire</div></div>
          </button>
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <div>
              <div className="text-2xl font-bold text-slate-700">{nbTotal}</div>
              <div className="text-xs text-slate-500 font-medium">Résidents</div>
              {nbChambresVides > 0 && <div className="text-xs text-slate-400">{nbChambresVides} chambre{nbChambresVides > 1 ? 's' : ''} vide{nbChambresVides > 1 ? 's' : ''}</div>}
            </div>
          </div>
          <button onClick={() => setShowPrintReferents(true)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-slate-100 transition-colors ml-auto">
            <Printer className="h-5 w-5 text-slate-500" />
            <div className="text-left"><div className="text-sm font-bold text-slate-700">Tableau référents</div><div className="text-xs text-slate-400">Imprimer la liste</div></div>
          </button>
          <button onClick={() => setShowGestionReferents(true)} disabled={readOnly}
            className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-indigo-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <UserPen className="h-5 w-5 text-indigo-500" />
            <div className="text-left"><div className="text-sm font-bold text-indigo-700">Gestion des référents</div><div className="text-xs text-indigo-500">{allReferents.length} référent{allReferents.length > 1 ? 's' : ''}</div></div>
          </button>
          <button onClick={() => { setShowSansReferents(true); setAssigningReferentFor(null); }} disabled={readOnly}
            className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-rose-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Users className="h-5 w-5 text-rose-500" />
            <div className="text-left"><div className="text-sm font-bold text-rose-700">Résidents à assigner</div><div className="text-xs text-rose-600">{nbSansReferent} sans référent</div></div>
          </button>
        </div>

        {/* Barre recherche / filtres */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input placeholder="Rechercher un résident..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setFilterReferent(''); }}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400" />
            </div>
            <select value={filterReferent}
              onChange={e => { setFilterReferent(e.target.value); if (e.target.value) setFilter('tous'); }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700">
              <option value="">Tous les référents</option>
              {allReferents.map(ref => <option key={ref} value={ref}>{ref}</option>)}
            </select>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {([['tous', 'Tous'], ['faits', '✓ Faits'], ['a_faire', 'À faire']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setFilter(key)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${filter === key ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Formulaire d'édition inline */}
        {editingId && editingResident ? (
          <div className="bg-white rounded-xl border border-slate-200 mb-6 shadow-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-slate-900">
                Éditer PAP — {editingResident.title} {editingResident.last_name} {editingResident.first_name}
              </h2>
              <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <PAPFormComp
              resident={editingResident}
              initialData={editingPap}
              onSave={form => saveMutation.mutate({ residentId: editingId, form })}
              onCancel={() => setEditingId(null)}
              isSaving={saveMutation.isPending}
              readOnly={readOnly}
              canEditRestricted={canEditRestricted}
            />
          </div>
        ) : (
          /* Liste des résidents */
          <div className="space-y-2">
            {filteredResidents.length === 0 && (
              <div className="text-center py-12 text-slate-400">Aucun résident trouvé</div>
            )}
            {filteredResidents.map(resident => {
              const pap = paps.find(p => p.resident_id === resident.id);
              const hasPap = !!pap;
              const progress = pap ? computeProgress(pap) : null;
              const progColor = progress !== null ? (progress < 30 ? 'bg-red-400' : progress < 70 ? 'bg-amber-400' : 'bg-green-500') : '';

              return (
                <div key={resident.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900">{resident.title} {resident.last_name} {resident.first_name}</div>
                      <div className="text-xs text-slate-500">Chambre {resident.room} • {resident.section}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {resident.referent
                          ? <span className="text-xs text-indigo-600 font-medium">Référent : {resident.referent}</span>
                          : <span className="text-xs text-slate-400 italic">Aucun référent</span>}
                        {!readOnly && (
                          <button onClick={() => setEditingReferent({ residentId: resident.id, value: resident.referent || '' })}
                            className="ml-1 text-slate-400 hover:text-indigo-600 transition-colors" title="Modifier le référent">
                            <UserPen className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {progress !== null && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5 max-w-[120px]">
                            <div className={`h-1.5 rounded-full ${progColor}`} style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-xs text-slate-500">{progress}%</span>
                          {pap?.date_reevaluation && (
                            <span className="text-xs text-slate-400">
                              Rééval. {new Date(pap.date_reevaluation + 'T12:00:00').toLocaleDateString('fr-FR')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 items-center flex-wrap justify-end shrink-0">
                      {hasPap && (
                        <button onClick={() => setViewingId(resident.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs hover:bg-slate-50 transition-colors">
                          <Eye className="h-3.5 w-3.5" /> Voir
                        </button>
                      )}
                      {hasPap && (
                        <button onClick={() => setHistoryResidentId(resident.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs hover:bg-slate-50 transition-colors">
                          <History className="h-3.5 w-3.5" /> Historique
                        </button>
                      )}
                      <button onClick={() => setEditingId(resident.id)} disabled={readOnly}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${hasPap ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                        {hasPap ? 'Modifier' : 'Créer'}
                      </button>
                      {hasPap && (
                        <button
                          onClick={() => setDeleteTarget({ papId: pap!.id, residentName: `${resident.last_name} ${resident.first_name}` })}
                          disabled={readOnly}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>{/* end white card */}
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}

      {showPrintReferents && <PrintReferentsTable residents={residents} onClose={() => setShowPrintReferents(false)} />}

      {/* Modal PAP View */}
      {viewingId && (() => {
        const res = residents.find(r => r.id === viewingId);
        const pap = paps.find(p => p.resident_id === viewingId);
        if (!res || !pap) return null;
        return <PAPView key={viewingId} pap={pap} resident={res} onClose={() => setViewingId(null)} />;
      })()}

      {/* Modal Version archivée */}
      {viewingVersion && (
        <PAPView pap={viewingVersion.pap} resident={viewingVersion.res}
          onClose={() => setViewingVersion(null)} readOnly archiveDate={viewingVersion.date} />
      )}

      {/* Modal Historique */}
      {historyResidentId && (() => {
        const res = residents.find(r => r.id === historyResidentId);
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h2 className="font-semibold text-slate-900">Historique des versions</h2>
                  <p className="text-xs text-slate-500">{res?.title} {res?.last_name} {res?.first_name}</p>
                </div>
                <button onClick={() => setHistoryResidentId(null)} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
              </div>
              <div className="overflow-y-auto p-4 space-y-3">
                {versions.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">Aucune version sauvegardée.<br /><span className="text-xs">Les versions sont créées à chaque sauvegarde.</span></p>
                ) : (
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  versions.map((v: any, i: number) => {
                    const parsed = v.data as Pap | null;
                    const prog = parsed ? computeProgress(parsed) : 0;
                    const pc = prog < 30 ? 'bg-red-400' : prog < 70 ? 'bg-amber-400' : 'bg-green-500';
                    return (
                      <div key={v.id} className="border border-slate-200 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="text-sm font-semibold text-slate-800">Version {versions.length - i}</span>
                            <span className="text-xs text-slate-500 ml-2">{new Date(v.saved_at).toLocaleString('fr-FR')}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{prog}% complet</span>
                            {parsed && res && (
                              <button onClick={() => setViewingVersion({ pap: parsed, res, date: v.saved_at })}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs hover:bg-slate-50 transition-colors">
                                <Eye className="h-3 w-3" /> Voir
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${pc}`} style={{ width: `${prog}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Modifier référent */}
      {editingReferent && (() => {
        const res = residents.find(r => r.id === editingReferent.residentId);
        return (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
              <h2 className="text-base font-semibold text-slate-700 mb-1">Référent soignant</h2>
              <p className="text-sm text-slate-500 mb-4">{res?.title} {res?.last_name} {res?.first_name}</p>
              <div className="relative">
                <input autoFocus placeholder="Nom du référent"
                  value={editingReferent.value}
                  onChange={e => setEditingReferent({ ...editingReferent, value: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && updateResidentMutation.mutate({ id: editingReferent.residentId, referent: editingReferent.value.trim() })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400" />
                {editingReferent.value.length > 0 && (() => {
                  const suggestions = allReferents.filter(r =>
                    r.toLowerCase().includes(editingReferent.value.toLowerCase()) && r !== editingReferent.value
                  );
                  if (!suggestions.length) return null;
                  return (
                    <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg z-10 mt-1 overflow-hidden">
                      {suggestions.map(s => (
                        <button key={s} type="button"
                          onMouseDown={e => { e.preventDefault(); setEditingReferent({ ...editingReferent, value: s }); }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">
                          {s}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <button onClick={() => setEditingReferent(null)} className="text-sm text-slate-400 hover:text-slate-600 px-3 py-1.5">Annuler</button>
                <button
                  onClick={() => updateResidentMutation.mutate({ id: editingReferent.residentId, referent: editingReferent.value.trim() })}
                  disabled={updateResidentMutation.isPending}
                  className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white rounded-lg px-4 py-1.5 hover:bg-indigo-700 disabled:opacity-50">
                  {updateResidentMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Sans référents */}
      {showSansReferents && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-slate-900">Résidents sans référent ({nbSansReferent})</h2>
              <button onClick={() => setShowSansReferents(false)} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {sansReferentResidents.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Tous les résidents ont un référent 🎉</p>
              ) : (
                [...sansReferentResidents].sort((a, b) => (a.last_name || '').localeCompare(b.last_name || '')).map(r => (
                  <div key={r.id} className="bg-slate-50 rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-slate-800">{r.title} {r.last_name} {r.first_name}</div>
                        <div className="text-xs text-slate-500">Chambre {r.room} • {r.section}</div>
                      </div>
                      <button onClick={() => setAssigningReferentFor(assigningReferentFor === r.id ? null : r.id)}
                        className="text-xs text-indigo-600 hover:underline">
                        {assigningReferentFor === r.id ? 'Annuler' : 'Assigner'}
                      </button>
                    </div>
                    {assigningReferentFor === r.id && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {allReferents.length === 0 && <span className="text-xs text-slate-400">Aucun référent existant.</span>}
                        {allReferents.map(ref => {
                          const refCount = residents.filter(res2 => res2.referent === ref).length;
                          return (
                            <button key={ref}
                              onClick={async () => {
                                await updateResidentMutation.mutateAsync({ id: r.id, referent: ref });
                                setAssigningReferentFor(null);
                              }}
                              className="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border border-indigo-200 px-2 py-1 rounded-md font-medium transition-colors">
                              {ref} <span className="opacity-60">({refCount})</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Gestion référents */}
      {showGestionReferents && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-slate-900">Gestion des référents</h2>
              <button onClick={() => { setShowGestionReferents(false); setEditingReferentName(null); }}
                className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3">
              <div className="pb-3 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-500 mb-2">Ajouter un nouveau référent</p>
                <div className="flex gap-2">
                  <input className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                    placeholder="Nom du référent..."
                    value={newReferentName}
                    onChange={e => setNewReferentName(e.target.value)} />
                  <button
                    disabled={!newReferentName.trim() || allReferents.includes(newReferentName.trim())}
                    onClick={() => {
                      const name = newReferentName.trim();
                      if (!name || allReferents.includes(name)) return;
                      const stored = JSON.parse(localStorage.getItem('extra_referents') || '[]') as string[];
                      const updated = stored.includes(name) ? stored : [...stored, name];
                      localStorage.setItem('extra_referents', JSON.stringify(updated));
                      setExtraReferentsList(updated);
                      setNewReferentName('');
                    }}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-indigo-700 transition-colors">
                    Ajouter
                  </button>
                </div>
                {newReferentName.trim() && allReferents.includes(newReferentName.trim()) && (
                  <p className="text-xs text-orange-500 mt-1">Ce référent existe déjà.</p>
                )}
              </div>
              {referentsStats.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Aucun référent défini.</p>}
              {referentsStats.map(({ name, count, residents: residents_ }) => (
                <div key={name} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-50">
                    {editingReferentName?.old === name ? (
                      <input autoFocus className="flex-1 px-2 py-1 border border-indigo-300 rounded text-sm mr-2"
                        value={editingReferentName.new}
                        onChange={e => setEditingReferentName({ ...editingReferentName, new: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === 'Enter') renameReferentMutation.mutate({ oldName: name, newName: editingReferentName.new });
                          if (e.key === 'Escape') setEditingReferentName(null);
                        }} />
                    ) : (
                      <span className="font-medium text-slate-800 text-sm">{name}</span>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">{count} résident{count > 1 ? 's' : ''}</span>
                      {editingReferentName?.old === name ? (
                        <>
                          <button onClick={() => renameReferentMutation.mutate({ oldName: name, newName: editingReferentName.new })} className="text-xs text-green-600 hover:underline">OK</button>
                          <button onClick={() => setEditingReferentName(null)} className="text-xs text-slate-400 hover:underline">Annuler</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setEditingReferentName({ old: name, new: name })} className="text-slate-400 hover:text-indigo-600 transition-colors" title="Renommer"><UserPen className="h-3.5 w-3.5" /></button>
                          <button onClick={() => deleteReferentMutation.mutate(name)} className="text-slate-400 hover:text-red-600 transition-colors" title="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="px-4 py-2 text-xs text-slate-500 flex flex-wrap gap-1">
                    {residents_.map(r => (
                      <span key={r.id} className="bg-white border border-slate-200 px-2 py-0.5 rounded">{r.last_name} {r.first_name}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Suppression */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <h2 className="text-base font-semibold text-slate-700 mb-1">Supprimer le PAP</h2>
            <p className="text-sm text-slate-500 mb-4">Confirmer la suppression du PAP de <strong>{deleteTarget.residentName}</strong> ?</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteTarget(null)}
                className="text-sm text-slate-400 hover:text-slate-600 px-3 py-1.5">Annuler</button>
              <button onClick={handleDeleteConfirm}
                className="text-sm bg-red-600 text-white rounded-lg px-4 py-1.5 hover:bg-red-700">Supprimer</button>
            </div>
          </div>
        </div>
      )}

      </div>{/* fin z-index: 1 */}
    </div>
  );
}

export default function PAPPage() {
  return (
    <Suspense fallback={null}>
      <PAPPageInner />
    </Suspense>
  );
}
