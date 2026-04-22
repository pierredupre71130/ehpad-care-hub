'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Edit2, Trash2, AlertCircle, Clock, Printer, TableProperties, Upload, ImagePlus, Plus, Shield } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { fetchColorOverrides, darkenHex, type ColorOverrides } from '@/lib/module-colors';
import { MODULES } from '@/components/dashboard/module-config';
import { ImportContentionModal } from '@/components/contentions/import-contention-modal';
import { ImportContentionFromImage } from '@/components/contentions/import-contention-from-image';
import type { Keywords } from '@/lib/import-parser';

// ── Types ────────────────────────────────────────────────────────────────────

interface Resident {
  id: string;
  first_name?: string;
  last_name: string;
  room?: string;
  floor?: string;
  medecin?: string;
}

interface Contention {
  id: string;
  nom: string;
  chambre: string;
  traitement: string;
  type_suivi: string;
  date_debut: string;
  date_fin: string;
  pas_de_fin: boolean;
  poso_matin: boolean;
  poso_midi: boolean;
  poso_soir: boolean;
  prescripteur: string;
  dotation_nominative: boolean;
}

interface FormState {
  nom_prenom: string;
  chambre: string;
  type_contention: string;
  date_prescription: string;
  date_fin_prevue: string;
  si_besoin: boolean;
  cause: string;
  famille_prevenue: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormState = {
  nom_prenom: '', chambre: '', type_contention: 'lit',
  date_prescription: '', date_fin_prevue: '', si_besoin: false, cause: '', famille_prevenue: false,
};

const TYPES_CONTENTION = ['lit', 'fauteuil', 'barrière gauche', 'barrière droite', 'barrière x2'];

const CAUSES_CONTENTION = [
  'agitation', 'confusion / désorientation', 'déambulation', 'fugue', 'hétéro-agressivité',
  'risque de chute', "risque d'arrachage de dispositif médical", 'position thérapeutique',
  'post-opératoire', 'troubles du comportement',
];

const DEFAULT_KEYWORDS: Keywords = {
  lit: ['SANGLE VENTRALE', 'CONTENTIONS LIT'],
  fauteuil: ['CONTENTIONS FAUTEUIL'],
  'barrière gauche': ['barrière gauche'],
  'barrière droite': ['barrière droite'],
  'barrière x2': ['BARRIERES AU LIT', 'BARRIÈRES AU LIT'],
  'si besoin': ['Note médecin : si besoin', 'Si besoin'],
};

const TYPE_COLORS: Record<string, string> = {
  lit: 'bg-blue-100 text-blue-800 border-blue-300',
  fauteuil: 'bg-purple-100 text-purple-800 border-purple-300',
  'barrière gauche': 'bg-amber-100 text-amber-800 border-amber-300',
  'barrière droite': 'bg-amber-100 text-amber-800 border-amber-300',
  'barrière x2': 'bg-amber-100 text-amber-800 border-amber-300',
};

const TYPE_BORDER_COLORS: Record<string, string> = {
  lit: 'border-blue-400',
  fauteuil: 'border-purple-400',
  'barrière gauche': 'border-amber-400',
  'barrière droite': 'border-amber-400',
  'barrière x2': 'border-amber-400',
};

// ── Badge components ─────────────────────────────────────────────────────────

function ContentionBadge({ label, bg, border, size = 'large' }: { label: string; bg: string; border: string; size?: 'large' | 'small' }) {
  const s = size === 'large' ? { width: 22, height: 22, fontSize: 10 } : { width: 14, height: 14, fontSize: 7 };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: s.width, height: s.height, borderRadius: '50%', background: bg,
      border: `1.5px solid ${border}`, fontWeight: 'bold', fontSize: s.fontSize, color: '#000', flexShrink: 0,
    }}>{label}</span>
  );
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  lit: <ContentionBadge label="L" bg="#dbeafe" border="#93c5fd" />,
  fauteuil: <ContentionBadge label="F" bg="#f3e8ff" border="#c4b5fd" />,
  'barrière gauche': <ContentionBadge label="BG" bg="#fef3c7" border="#d97706" />,
  'barrière droite': <ContentionBadge label="BD" bg="#fef3c7" border="#d97706" />,
  'barrière x2': <ContentionBadge label="B2" bg="#fef3c7" border="#d97706" />,
};

const TYPE_ICONS_SMALL: Record<string, React.ReactNode> = {
  lit: <ContentionBadge label="L" bg="#dbeafe" border="#93c5fd" size="small" />,
  fauteuil: <ContentionBadge label="F" bg="#f3e8ff" border="#c4b5fd" size="small" />,
  'barrière gauche': <ContentionBadge label="BG" bg="#fef3c7" border="#d97706" size="small" />,
  'barrière droite': <ContentionBadge label="BD" bg="#fef3c7" border="#d97706" size="small" />,
  'barrière x2': <ContentionBadge label="B2" bg="#fef3c7" border="#d97706" size="small" />,
};

// ── Supabase fetchers ────────────────────────────────────────────────────────

async function fetchContentions(): Promise<Contention[]> {
  const sb = createClient();
  const { data, error } = await sb.from('contentions').select('*').eq('type_suivi', 'contention').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Contention[];
}

async function fetchResidents(): Promise<Resident[]> {
  const sb = createClient();
  const { data, error } = await sb.from('residents').select('*').order('last_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Resident[];
}

async function fetchKeywords(): Promise<Keywords> {
  const sb = createClient();
  const { data } = await sb.from('settings').select('value').eq('key', 'contention_keywords').maybeSingle();
  return (data?.value as Keywords) ?? DEFAULT_KEYWORDS;
}

async function saveKeywords(kw: Keywords): Promise<void> {
  const sb = createClient();
  await sb.from('settings').upsert({ key: 'contention_keywords', value: kw, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function extractLastName(fullName: string) {
  const parts = (fullName || '').trim().split(/\s+/);
  return parts.length > 0 ? parts[parts.length - 1] : fullName;
}

function formatNameLastFirst(fullName: string) {
  const parts = (fullName || '').trim().split(/\s+/);
  if (parts.length <= 1) return fullName;
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');
  return `${lastName} ${firstName}`.trim();
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

// ── Main component ───────────────────────────────────────────────────────────

export default function ContentionsPage() {
  const queryClient = useQueryClient();

  const { data: colorOverrides = {} } = useQuery<ColorOverrides>({
    queryKey: ['settings', 'module_colors'],
    queryFn: fetchColorOverrides,
    staleTime: 30000,
  });
  const contentionsModule = MODULES.find(m => m.id === 'contentions');
  const colorFrom = colorOverrides['contentions']?.from ?? contentionsModule?.cardFrom ?? '#e07820';
  const colorTo   = colorOverrides['contentions']?.to   ?? contentionsModule?.cardTo   ?? '#b85a05';

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [residentLocked, setResidentLocked] = useState(false);
  const [activeFloor, setActiveFloor] = useState('RDC');
  const [showModal, setShowModal] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportImageModal, setShowImportImageModal] = useState(false);

  const { data: fiches = [], isLoading: isLoadingFiches, error: fichesError } = useQuery({
    queryKey: ['contentions'],
    queryFn: fetchContentions,
  });

  const { data: residents = [], isLoading: isLoadingResidents } = useQuery({
    queryKey: ['residents'],
    queryFn: fetchResidents,
  });

  const { data: keywords = DEFAULT_KEYWORDS } = useQuery({
    queryKey: ['settings', 'contention_keywords'],
    queryFn: fetchKeywords,
  });

  const handleKeywordsSaved = (kw: Keywords) => {
    queryClient.setQueryData(['settings', 'contention_keywords'], kw);
    saveKeywords(kw);
  };

  const createMutation = useMutation({
    mutationFn: async (data: Omit<Contention, 'id'>) => {
      const sb = createClient();
      const { error } = await sb.from('contentions').insert(data);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contentions'] });
      setShowModal(false);
      setForm(EMPTY_FORM);
      setActiveId(null);
    },
    onError: (err: Error) => {
      alert(`Erreur lors de l'enregistrement : ${err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Contention> }) => {
      const sb = createClient();
      const { error } = await sb.from('contentions').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contentions'] });
      setShowModal(false);
      setForm(EMPTY_FORM);
      setActiveId(null);
    },
    onError: (err: Error) => {
      alert(`Erreur lors de la mise à jour : ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const sb = createClient();
      const { error } = await sb.from('contentions').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contentions'] });
      setShowModal(false);
      setForm(EMPTY_FORM);
      setActiveId(null);
    },
    onError: (err: Error) => {
      alert(`Erreur lors de la suppression : ${err.message}`);
    },
  });

  const handleSave = async () => {
    if (!form.nom_prenom.trim()) { alert('Le nom et prénom sont obligatoires'); return; }
    const dataToSave = {
      nom: form.nom_prenom,
      chambre: form.chambre,
      traitement: form.type_contention,
      type_suivi: 'contention',
      date_debut: form.date_prescription,
      date_fin: form.date_fin_prevue,
      pas_de_fin: !form.date_fin_prevue,
      poso_matin: form.famille_prevenue,
      poso_midi: false,
      poso_soir: false,
      prescripteur: form.cause,
      dotation_nominative: form.si_besoin,
    };
    if (activeId) {
      updateMutation.mutate({ id: activeId, data: dataToSave });
    } else {
      createMutation.mutate(dataToSave as Omit<Contention, 'id'>);
    }
  };

  const handleDelete = async () => {
    if (!activeId) return;
    if (confirm(`Supprimer la contention de ${form.nom_prenom} ?`)) {
      deleteMutation.mutate(activeId);
    }
  };

  const handleSelectResident = (resident: Resident) => {
    const nom_prenom = `${resident.first_name || ''} ${resident.last_name || ''}`.trim();
    setForm({ nom_prenom, chambre: resident.room || '', type_contention: 'lit', date_prescription: '', date_fin_prevue: '', si_besoin: false, cause: '', famille_prevenue: false });
    setActiveId(null);
    setResidentLocked(true);
    setShowModal(true);
  };

  const handleSelectContention = (fiche: Contention) => {
    setActiveId(fiche.id);
    setResidentLocked(true);
    setForm({
      nom_prenom: fiche.nom || '',
      chambre: fiche.chambre || '',
      type_contention: fiche.traitement || 'lit',
      date_prescription: fiche.date_debut || '',
      date_fin_prevue: fiche.date_fin || '',
      si_besoin: !!fiche.dotation_nominative,
      cause: fiche.prescripteur || '',
      famille_prevenue: !!fiche.poso_matin,
    });
    setShowModal(true);
  };

  // Floor lookup: use resident.floor if possible, else derive from room number
  const getFloorByChambre = (chambre: string): string | null => {
    const resident = residents.find(r => r.room === chambre);
    if (resident) return resident.floor ?? null;
    const num = parseInt(chambre, 10);
    if (!isNaN(num)) return num >= 100 ? '1ER' : 'RDC';
    return null;
  };

  // Residents on active floor, sorted by room number
  const sortedResidents = useMemo(() => {
    return residents
      .filter(r => r.floor === activeFloor)
      .sort((a, b) => {
        const numA = parseInt(a.room || '0') || 0;
        const numB = parseInt(b.room || '0') || 0;
        if (numA !== numB) return numA - numB;
        return (a.room || '').localeCompare(b.room || '');
      });
  }, [residents, activeFloor]);

  // Contentions on active floor
  const fichersByFloor = useMemo(() =>
    fiches.filter(f => getFloorByChambre(f.chambre) === activeFloor),
    [fiches, activeFloor, residents]
  );

  // Group contentions by resident name
  const groupedByResident = useMemo(() => {
    const g: Record<string, Contention[]> = {};
    fichersByFloor.forEach(f => {
      if (!g[f.nom]) g[f.nom] = [];
      g[f.nom].push(f);
    });
    return g;
  }, [fichersByFloor]);

  const sortedResidentNames = useMemo(() =>
    Object.keys(groupedByResident).sort((a, b) =>
      extractLastName(a).localeCompare(extractLastName(b), 'fr')
    ),
    [groupedByResident]
  );

  // Badge types per resident in left panel
  const residentContentionTypes = useMemo(() => {
    const result: Record<string, Array<{ type: string; siBesoin: boolean }>> = {};
    sortedResidents.forEach(r => {
      const nom = `${r.first_name || ''} ${r.last_name || ''}`.trim();
      const contentions = fichersByFloor.filter(f => f.nom === nom);
      const seen = new Set<string>();
      const items: Array<{ type: string; siBesoin: boolean }> = [];
      contentions.forEach(f => {
        const key = `${f.traitement}-${!!f.dotation_nominative}`;
        if (!seen.has(key)) { seen.add(key); items.push({ type: f.traitement, siBesoin: !!f.dotation_nominative }); }
      });
      result[r.id] = items;
    });
    return result;
  }, [sortedResidents, fichersByFloor]);

  // Alert panels
  const today = new Date();
  const twoWeeksFromNow = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

  const toEvaluate = useMemo(() =>
    fichersByFloor.filter(f => {
      if (!f.date_fin) return false;
      const endDate = new Date(f.date_fin);
      return endDate <= twoWeeksFromNow && endDate > today;
    }).sort((a, b) => new Date(a.date_fin).getTime() - new Date(b.date_fin).getTime()),
    [fichersByFloor]
  );

  const expiredWithoutRenewal = useMemo(() => {
    const expired: Contention[] = [];
    fichersByFloor.forEach(f => {
      if (!f.date_fin) return;
      const endDate = new Date(f.date_fin);
      if (endDate <= today) {
        const hasRenewal = fichersByFloor.some(f2 =>
          f2.nom === f.nom && f2.id !== f.id && f2.traitement === f.traitement &&
          f2.date_debut && new Date(f2.date_debut) >= endDate
        );
        if (!hasRenewal) expired.push(f);
      }
    });
    return expired.sort((a, b) => new Date(b.date_fin).getTime() - new Date(a.date_fin).getTime()).slice(0, 5);
  }, [fichersByFloor]);

  const isLoading = isLoadingFiches || isLoadingResidents;
  const isSaving = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  if (fichesError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 gap-4 p-8">
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 max-w-lg w-full">
          <h2 className="font-bold text-red-800 text-lg mb-2">Erreur de chargement</h2>
          <p className="text-red-700 text-sm font-mono">{(fichesError as Error).message}</p>
          <p className="text-red-600 text-xs mt-3">Vérifiez que la table <code className="bg-red-100 px-1 rounded">contentions</code> existe dans Supabase et que les RLS sont désactivées.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <>
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
        <div className="print:hidden relative overflow-hidden flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${colorFrom} 0%, ${colorTo} 100%)` }}>
          <div className="absolute inset-0 pointer-events-none"><NetworkBackground /></div>
          <div className="relative z-10 max-w-full px-6 py-5">
            <div className="flex items-center gap-1.5 text-white/50 text-xs mb-3">
              <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
              <span>›</span>
              <span className="text-white/90">Gestion des Contentions</span>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                <Shield className="h-6 w-6 text-white" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-white">Gestion des Contentions</h1>
                <p className="text-white/70 text-sm hidden sm:block">Suivi et prescription des contentions par étage</p>
              </div>
            </div>
          </div>
        </div>

      {/* Alerts */}
      <div className="bg-white border-b border-slate-200 px-8 py-4">
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-300 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-5 w-5 text-orange-600" />
              <h3 className="font-bold text-orange-900">À réévaluer (moins de 2 semaines)</h3>
              <span className="ml-auto bg-orange-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">{toEvaluate.length}</span>
            </div>
            {toEvaluate.length === 0 ? (
              <p className="text-sm text-orange-800">Aucune contention à réévaluer</p>
            ) : (
              <div className="space-y-2">
                {toEvaluate.map(f => {
                  const endDate = new Date(f.date_fin);
                  const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={f.id} className="text-sm bg-white rounded p-2 border border-orange-200">
                      <div className="font-semibold text-orange-900">{f.nom}</div>
                      <div className="text-xs text-orange-700">Fin le {endDate.toLocaleDateString('fr-FR')} ({daysLeft} j)</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-300 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <h3 className="font-bold text-red-900">Expirées non renouvelées</h3>
              <span className="ml-auto bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">{expiredWithoutRenewal.length}</span>
            </div>
            {expiredWithoutRenewal.length === 0 ? (
              <p className="text-sm text-red-800">Aucune contention expirée</p>
            ) : (
              <div className="space-y-2">
                {expiredWithoutRenewal.map(f => (
                  <div key={f.id} className="text-sm bg-white rounded p-2 border border-red-200">
                    <div className="font-semibold text-red-900">{f.nom}</div>
                    <div className="text-xs text-red-700">Fin le {new Date(f.date_fin).toLocaleDateString('fr-FR')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* LEFT PANEL */}
        <div className="w-80 border-r border-slate-300 bg-white flex flex-col" style={{ minHeight: 0 }}>
          <div className="px-4 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-blue-100 flex-shrink-0">
            <h2 className="text-sm font-bold text-slate-900 mb-3">Résidents</h2>
            <Tabs value={activeFloor} onValueChange={setActiveFloor} className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-8">
                <TabsTrigger value="RDC" className="text-xs">RDC</TabsTrigger>
                <TabsTrigger value="1ER" className="text-xs">1ER</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="overflow-y-auto flex-1">
            {sortedResidents.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-sm">Aucun résident</div>
            ) : (
              <div className="divide-y divide-slate-200">
                {sortedResidents.map(r => (
                  <div
                    key={r.id}
                    onClick={() => handleSelectResident(r)}
                    className="p-3 hover:bg-blue-50 cursor-pointer transition-colors border-l-4 border-l-transparent hover:border-l-blue-500"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-blue-900 text-sm">Ch. {r.room}</span>
                      <div className="flex items-center gap-1 flex-wrap justify-end">
                        {(residentContentionTypes[r.id] || []).map(({ type, siBesoin }) => (
                          <span
                            key={`${type}-${siBesoin}`}
                            title={`${type}${siBesoin ? ' (si besoin)' : ' (continu)'}`}
                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${
                              siBesoin
                                ? `bg-white border-2 border-dashed ${TYPE_BORDER_COLORS[type] || 'border-gray-400'}`
                                : TYPE_COLORS[type] || 'bg-gray-100'
                            }`}
                          >
                            {TYPE_ICONS_SMALL[type]}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-slate-800 mb-1">
                      {(r.last_name || '').toUpperCase()} {r.first_name}
                    </div>
                    {r.medecin && <div className="text-xs text-slate-500">Dr. {r.medecin}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex-shrink-0">
            Cliquez sur un résident pour ajouter une contention
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-emerald-100 border-b border-slate-200 sticky top-0 z-10 flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-bold text-slate-900">Contentions — {activeFloor} ({fichersByFloor.length})</h2>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => {
                setForm(EMPTY_FORM);
                setActiveId(null);
                setResidentLocked(false);
                setShowModal(true);
              }} size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="h-4 w-4" /> Ajouter manuellement
              </Button>
              <Button onClick={() => setShowImportImageModal(true)} size="sm" variant="outline" className="gap-2 border-blue-400 text-blue-700 hover:bg-blue-100">
                <ImagePlus className="h-4 w-4" /> Prescription (image)
              </Button>
              <Button onClick={() => setShowImportModal(true)} size="sm" variant="outline" className="gap-2 border-amber-400 text-amber-700 hover:bg-amber-100">
                <Upload className="h-4 w-4" /> Importer fichier
              </Button>
              <Button onClick={() => setShowRecap(true)} size="sm" variant="outline" className="gap-2 border-emerald-400 text-emerald-700 hover:bg-emerald-100">
                <TableProperties className="h-4 w-4" /> Récapitulatif
              </Button>
            </div>
          </div>

          {fichersByFloor.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-500">
              <p>Aucune contention enregistrée à cet étage. Sélectionnez un résident à gauche pour en créer une.</p>
            </div>
          ) : (
            <div className="px-6 py-4">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 border border-slate-300">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold text-slate-700">Résident</th>
                    <th className="px-4 py-3 text-center font-bold text-slate-700">Chambre</th>
                    <th className="px-4 py-3 text-center font-bold text-slate-700">Type</th>
                    <th className="px-4 py-3 text-center font-bold text-slate-700">Cause</th>
                    <th className="px-4 py-3 text-center font-bold text-slate-700">Prescription</th>
                    <th className="px-4 py-3 text-center font-bold text-slate-700">Fin prévue</th>
                    <th className="px-4 py-3 text-center font-bold text-slate-700">Statut</th>
                    <th className="px-4 py-3 text-center font-bold text-slate-700">Famille</th>
                    <th className="px-4 py-3 text-center font-bold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sortedResidentNames.map(residentName => {
                    const contentionsForResident = groupedByResident[residentName];
                    return contentionsForResident.map((f, fIdx) => {
                      const datePresc = f.date_debut ? new Date(f.date_debut + 'T00:00:00').toLocaleDateString('fr-FR') : '—';
                      const dateFin = f.date_fin ? new Date(f.date_fin + 'T00:00:00').toLocaleDateString('fr-FR') : '—';
                      const isFirstRow = fIdx === 0;
                      const rowsCount = contentionsForResident.length;
                      return (
                        <tr key={f.id} className={`${isFirstRow ? 'bg-blue-50' : 'bg-white'} hover:bg-slate-50 transition`}>
                          <td className={`px-4 py-3 font-semibold text-slate-900 ${isFirstRow ? 'border-l-4 border-l-blue-500' : ''}`}>
                            {isFirstRow ? (
                              <div className="flex flex-col">
                                <span>{formatNameLastFirst(f.nom)}</span>
                                {rowsCount > 1 && <span className="text-xs text-slate-500 font-normal">({rowsCount} contentions)</span>}
                              </div>
                            ) : (
                              <span className="text-slate-400">↳</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-700">{f.chambre}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${TYPE_COLORS[f.traitement] || 'bg-gray-100 text-gray-800 border-gray-300'}`}>
                              {TYPE_ICONS[f.traitement]}
                              {capitalize(f.traitement)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-slate-600">
                            {f.prescripteur ? (
                              <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">{capitalize(f.prescripteur)}</span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center text-slate-700">{datePresc}</td>
                          <td className="px-4 py-3 text-center text-slate-700">{dateFin}</td>
                          <td className="px-4 py-3 text-center">
                            {f.dotation_nominative ? (
                              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-300">Si besoin</span>
                            ) : (
                              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-300">Continu</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {f.poso_matin ? (
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-300">✓ Oui</span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">Non</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button onClick={() => handleSelectContention(f)} size="sm" variant="ghost" className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 gap-1">
                              <Edit2 className="h-4 w-4" /> Modifier
                            </Button>
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Récapitulatif */}
      <Dialog open={showRecap} onOpenChange={setShowRecap}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center justify-between">
              <span>Récapitulatif — Contentions {activeFloor}</span>
              <Button onClick={() => window.print()} size="sm" className="gap-2 bg-slate-700 hover:bg-slate-800 text-white mr-6">
                <Printer className="h-4 w-4" /> Imprimer
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div id="recap-print" className="overflow-y-auto flex-1">
            <style>{`
              @media print {
                body * { visibility: hidden !important; }
                #recap-print, #recap-print * { visibility: visible !important; }
                #recap-print { position: fixed; top: 0; left: 0; width: 100%; padding: 20px; }
              }
            `}</style>
            <div className="text-xs text-slate-500 mb-3">
              Édité le {new Date().toLocaleDateString('fr-FR')} — Étage {activeFloor}
            </div>
            {fichersByFloor.length === 0 ? (
              <p className="text-slate-500 text-sm py-6 text-center">Aucune contention à afficher.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-700">Résident</th>
                    <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-700">Médecin</th>
                    <th className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">Type</th>
                    <th className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">Cause</th>
                    <th className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">Statut</th>
                    <th className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">Prescription</th>
                    <th className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">Fin prévue</th>
                    <th className="border border-slate-300 px-3 py-2 text-center font-bold text-slate-700">Famille prévenue</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResidents.flatMap(r => {
                    const nom = `${r.first_name || ''} ${r.last_name || ''}`.trim();
                    const contentions = fichersByFloor.filter(f => f.nom === nom);
                    if (contentions.length === 0) return [];
                    return contentions.map((f, idx) => {
                      const datePresc = f.date_debut ? new Date(f.date_debut + 'T00:00:00').toLocaleDateString('fr-FR') : '—';
                      const dateFin = f.date_fin ? new Date(f.date_fin + 'T00:00:00').toLocaleDateString('fr-FR') : 'Sans limite';
                      const isExpired = f.date_fin && new Date(f.date_fin) <= today;
                      return (
                        <tr key={f.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-900">{idx === 0 ? nom : ''}</td>
                          <td className="border border-slate-300 px-3 py-2 text-slate-600 text-xs">{idx === 0 && r.medecin ? `Dr. ${r.medecin}` : ''}</td>
                          <td className="border border-slate-300 px-3 py-2 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${TYPE_COLORS[f.traitement] || 'bg-gray-100 text-gray-800 border-gray-300'}`}>
                              {TYPE_ICONS[f.traitement]}
                              {capitalize(f.traitement)}
                            </span>
                          </td>
                          <td className="border border-slate-300 px-3 py-2 text-center text-xs text-slate-700">{f.prescripteur ? capitalize(f.prescripteur) : '—'}</td>
                          <td className="border border-slate-300 px-3 py-2 text-center">
                            {f.dotation_nominative ? (
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-300">Si besoin</span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-300">Continu</span>
                            )}
                          </td>
                          <td className="border border-slate-300 px-3 py-2 text-center text-slate-700">{datePresc}</td>
                          <td className={`border border-slate-300 px-3 py-2 text-center font-semibold ${isExpired ? 'text-red-600' : 'text-slate-700'}`}>
                            {dateFin}{isExpired ? ' ⚠️' : ''}
                          </td>
                          <td className="border border-slate-300 px-3 py-2 text-center">
                            {f.poso_matin ? (
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-300">✓ Oui</span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">Non</span>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Import Fichier PDF */}
      <ImportContentionModal
        open={showImportModal}
        onOpenChange={setShowImportModal}
        residents={residents}
        keywords={keywords}
        onKeywordsSaved={handleKeywordsSaved}
        onImport={() => queryClient.invalidateQueries({ queryKey: ['contentions'] })}
      />

      {/* Modal Import Image OCR */}
      <ImportContentionFromImage
        open={showImportImageModal}
        onOpenChange={setShowImportImageModal}
        residents={residents}
        keywords={keywords}
        onKeywordsSaved={handleKeywordsSaved}
        onImport={() => queryClient.invalidateQueries({ queryKey: ['contentions'] })}
        floor={activeFloor}
      />

      {/* Modal Formulaire */}
      <Dialog open={showModal} onOpenChange={(open) => { setShowModal(open); if (!open) setResidentLocked(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {activeId ? 'Modifier la contention' : 'Nouvelle contention'}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[70vh] space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="text-sm font-semibold">Nom Prénom</Label>
                <Input
                  placeholder="Jean Dupont"
                  value={form.nom_prenom}
                  onChange={(e) => setForm({ ...form, nom_prenom: e.target.value })}
                  className="mt-1"
                  disabled={residentLocked}
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">Chambre</Label>
                <Input
                  placeholder="102"
                  value={form.chambre}
                  onChange={(e) => setForm({ ...form, chambre: e.target.value })}
                  className="mt-1"
                  disabled={residentLocked}
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">Type de contention</Label>
                <Select value={form.type_contention} onValueChange={(v) => setForm({ ...form, type_contention: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES_CONTENTION.map(t => (
                      <SelectItem key={t} value={t}>{capitalize(t)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">Cause</Label>
              <Select value={form.cause} onValueChange={(v) => setForm({ ...form, cause: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Sélectionner une cause..." /></SelectTrigger>
                <SelectContent>
                  {CAUSES_CONTENTION.map(c => (
                    <SelectItem key={c} value={c}>{capitalize(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-semibold">Date de prescription</Label>
                <Input
                  type="date"
                  value={form.date_prescription || ''}
                  onChange={(e) => setForm({ ...form, date_prescription: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">Date de fin prévue</Label>
                <Input
                  type="date"
                  value={form.date_fin_prevue || ''}
                  onChange={(e) => setForm({ ...form, date_fin_prevue: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded bg-slate-50 hover:bg-slate-100 transition">
                <input
                  type="checkbox"
                  checked={!!form.si_besoin}
                  onChange={(e) => setForm({ ...form, si_besoin: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-semibold text-slate-700">Si besoin (à la demande)</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded bg-teal-50 hover:bg-teal-100 transition border border-teal-200">
                <input
                  type="checkbox"
                  checked={!!form.famille_prevenue}
                  onChange={(e) => setForm({ ...form, famille_prevenue: e.target.checked })}
                  className="w-4 h-4 accent-teal-600"
                />
                <span className="text-sm font-semibold text-teal-800">Famille prévenue</span>
              </label>
            </div>

            <div className="flex gap-2 pt-4 border-t border-slate-200">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {isSaving ? 'Enregistrement...' : activeId ? 'Mettre à jour' : 'Enregistrer'}
              </Button>
              {activeId && (
                <Button onClick={handleDelete} disabled={isSaving} variant="destructive" className="gap-2">
                  <Trash2 className="h-4 w-4" /> Supprimer
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>{/* fin z-index: 1 */}
    </div>
    </>
  );
}
