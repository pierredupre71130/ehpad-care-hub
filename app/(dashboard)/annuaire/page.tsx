'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookUser, ChevronRight, Phone, PhoneOff, Plus, Pencil, Trash2,
  X, Check, Search, Wifi, WifiOff, Building2, Hospital, Ambulance, Hash,
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useModuleAccess } from '@/lib/use-module-access';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Resident {
  id: string;
  title?: string;
  first_name?: string;
  last_name: string;
  room?: string;
  floor?: string;
  archived?: boolean;
}

interface AnnuaireEntry {
  id: string;
  resident_id: string;
  phone_number: string;
  ligne_active: boolean;
  created_at: string;
  resident: Resident;
}

interface ServiceEntry {
  id: string;
  section: string;
  label: string;
  phone_number: string;
  sort_order: number;
}

interface AmbulanceEntry extends ServiceEntry {
  speed_dial?: string | null;
}

interface ChpcbEntry extends ServiceEntry {
  site: string;
}

type Tab = 'lignes-directes' | 'services' | 'externes' | 'ambulances' | 'chpcb';

// ── CHPCB Sites ───────────────────────────────────────────────────────────────

const CHPCB_SITES = [
  { id: 'all',              label: 'Tous les sites' },
  { id: 'SITE LES CHARMES', label: 'Les Charmes' },
  { id: 'SITE LA ROSERAIE', label: 'La Roseraie' },
  { id: 'SITE LA COLLINE',  label: 'La Colline' },
  { id: 'IFSI-IFAS',        label: 'IFSI-IFAS' },
  { id: 'SITE CHAROLLES',   label: 'Charolles' },
  { id: 'SITE LA CLAYETTE', label: 'La Clayette' },
  { id: 'GCS',              label: 'GCS' },
] as const;

type ChpcbSite = typeof CHPCB_SITES[number]['id'];

// ── CHPCB Pôles ───────────────────────────────────────────────────────────────

const CHPCB_POLES = [
  { id: 'all',              label: 'Tous' },
  { id: 'medico-technique', label: 'Médico-Technique' },
  { id: 'medecine',         label: 'Médecine' },
  { id: 'mere-enfant',      label: 'Mère & Enfant' },
  { id: 'personnes-agees',  label: 'Pers. Âgées' },
  { id: 'chirurgie',        label: 'Chirurgie' },
  { id: 'administratif',    label: 'Administratif' },
  { id: 'logistique',       label: 'Logistique' },
  { id: 'autres',           label: 'Autres' },
] as const;

type ChpcbPole = typeof CHPCB_POLES[number]['id'];

function getPole(section: string): ChpcbPole {
  const s = section.toUpperCase();
  if (s.includes('BRANCARDIER') || s.includes('IMAGERIE') || s.includes('CONSULTATIONS EXTERNES') ||
      s.includes('BLOC OPERATOIRE') || s.includes('SURVEILLANCE CONTINUE') || s.includes('BANQUE DE SANG') ||
      s.includes('PSYCHOLOGUE') || s.includes('PHARMACIE') || s.includes('STERILISATION') ||
      s.includes('MORTUAIRE') || s.includes('DOULEUR')) return 'medico-technique';
  if (s.includes('URGENCES') || s.includes('SMUR') || s.includes('COURTE DUREE') ||
      s.includes('MEDECINE POLYVALENTE') || s.includes('SOINS PALLIATIFS')) return 'medecine';
  if (s.includes('PLANIFICATION') || s.includes('OBSTETRICAL') || s.includes('ORTHOGENIE') ||
      s.includes('MATERNITE') || s.includes('PEDIATRIE')) return 'mere-enfant';
  if (s.includes('GERIATRIQUE') || s.includes('SERVICE SOCIAL')) return 'personnes-agees';
  if (s.includes('CHIRURGIE') || s.includes('DIETETIQUE') || s.includes('KINESITHERAPIE')) return 'chirurgie';
  if (s.includes('RESSOURCES HUMAINES') || s.includes('FINANCES') || s.includes('ADMISSION') ||
      s.includes(' DIM') || s.includes('QUALITE') || s.includes('MEDECINE DU TRAVAIL')) return 'administratif';
  if (s.includes('ECONOMIQUE') || s.includes('TECHNIQUES') || s.includes('PREVENTION') ||
      s.includes('BIOMEDICAL') || s.includes('RESTAURATION') || s.includes('LINGERIE') ||
      s.includes('INFORMATIQUE') || s.includes('ARCHIVES') || s.includes('STANDARD')) return 'logistique';
  return 'autres';
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function fetchAnnuaire(): Promise<AnnuaireEntry[]> {
  const sb = createClient();
  const { data: annRows, error: err1 } = await sb
    .from('annuaire_residents')
    .select('id, resident_id, phone_number, ligne_active, created_at');
  if (err1) throw err1;
  if (!annRows || annRows.length === 0) return [];

  const ids = annRows.map(r => r.resident_id).filter(Boolean);
  const { data: resRows, error: err2 } = await sb
    .from('residents')
    .select('id,title,first_name,last_name,room,floor,archived')
    .in('id', ids)
    .neq('archived', true);
  if (err2) throw err2;

  const resMap = new Map((resRows ?? []).map(r => [r.id, r as Resident]));
  return annRows
    .filter(e => resMap.has(e.resident_id))
    .map(e => ({ ...e, resident: resMap.get(e.resident_id)! })) as AnnuaireEntry[];
}

async function fetchResidents(): Promise<Resident[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('residents')
    .select('id,title,first_name,last_name,room,floor,archived')
    .neq('archived', true)
    .order('last_name');
  if (error) throw error;
  return (data ?? []) as Resident[];
}

async function fetchServices(): Promise<ServiceEntry[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('annuaire_services')
    .select('id, section, label, phone_number, sort_order')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as ServiceEntry[];
}

async function fetchExternes(): Promise<AmbulanceEntry[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('annuaire_externes')
    .select('id, section, label, phone_number, speed_dial, sort_order')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as AmbulanceEntry[];
}

async function fetchAmbulances(): Promise<AmbulanceEntry[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('annuaire_ambulances')
    .select('id, section, label, phone_number, speed_dial, sort_order')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as AmbulanceEntry[];
}

async function fetchChpcb(): Promise<ChpcbEntry[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('annuaire_chpcb')
    .select('id, site, section, label, phone_number, sort_order')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as ChpcbEntry[];
}

function roomNum(r?: string) {
  return parseInt((r ?? '').replace(/\D/g, '') || '0');
}

function sortEntries(entries: AnnuaireEntry[]) {
  return [...entries].sort((a, b) => {
    const fa = a.resident.floor ?? '', fb = b.resident.floor ?? '';
    if (fa !== fb) return fa < fb ? -1 : 1;
    const ra = roomNum(a.resident.room), rb = roomNum(b.resident.room);
    if (ra !== rb) return ra - rb;
    return (a.resident.last_name ?? '').localeCompare(b.resident.last_name ?? '');
  });
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function AnnuairePage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  useModuleAccess('annuaire');
  const isAdmin = profile?.role === 'admin';

  const [activeTab, setActiveTab] = useState<Tab>('lignes-directes');

  // Tab 1 state
  const [filterEtage, setFilterEtage] = useState<'all' | 'RDC' | '1ER'>('all');
  const [filterLigne, setFilterLigne] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch]           = useState('');
  const [showAdd,      setShowAdd]      = useState(false);
  const [editEntry,    setEditEntry]    = useState<AnnuaireEntry | null>(null);
  const [deleteEntry,  setDeleteEntry]  = useState<AnnuaireEntry | null>(null);

  // Tab 2 state
  const [showAddSvc,   setShowAddSvc]   = useState(false);
  const [editSvc,      setEditSvc]      = useState<ServiceEntry | null>(null);
  const [deleteSvc,    setDeleteSvc]    = useState<ServiceEntry | null>(null);

  // Tab 3 externes state
  const [showAddExt,   setShowAddExt]   = useState(false);
  const [editExt,      setEditExt]      = useState<AmbulanceEntry | null>(null);
  const [deleteExt,    setDeleteExt]    = useState<AmbulanceEntry | null>(null);

  // Tab 4 ambulances state
  const [showAddAmb,   setShowAddAmb]   = useState(false);
  const [editAmb,      setEditAmb]      = useState<AmbulanceEntry | null>(null);
  const [deleteAmb,    setDeleteAmb]    = useState<AmbulanceEntry | null>(null);

  // Tab 3 state
  const [chpcbSearch,  setChpcbSearch]  = useState('');
  const [chpcbSite,    setChpcbSite]    = useState<ChpcbSite>('all');
  const [chpcbPole,    setChpcbPole]    = useState<ChpcbPole>('all');
  const [showAddChpcb, setShowAddChpcb] = useState(false);
  const [editChpcb,    setEditChpcb]    = useState<ChpcbEntry | null>(null);
  const [deleteChpcb,  setDeleteChpcb]  = useState<ChpcbEntry | null>(null);

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: entries = [], isLoading: loadingEntries } = useQuery({
    queryKey: ['annuaire_residents'],
    queryFn: fetchAnnuaire,
  });

  const { data: allResidents = [] } = useQuery({
    queryKey: ['residents'],
    queryFn: fetchResidents,
    enabled: isAdmin,
  });

  const { data: services = [], isLoading: loadingServices } = useQuery({
    queryKey: ['annuaire_services'],
    queryFn: fetchServices,
  });

  const { data: externes = [], isLoading: loadingExt } = useQuery<AmbulanceEntry[]>({
    queryKey: ['annuaire_externes'],
    queryFn: fetchExternes,
  });

  const { data: ambulances = [], isLoading: loadingAmb } = useQuery<AmbulanceEntry[]>({
    queryKey: ['annuaire_ambulances'],
    queryFn: fetchAmbulances,
  });

  const { data: chpcbEntries = [], isLoading: loadingChpcb } = useQuery<ChpcbEntry[]>({
    queryKey: ['annuaire_chpcb'],
    queryFn: fetchChpcb,
  });

  const residentsInAnnuaire = new Set(entries.map(e => e.resident_id));
  const availableResidents  = allResidents.filter(r => !residentsInAnnuaire.has(r.id));

  // Sections groupées (tab 2)
  const servicesBySection = useMemo(() => {
    const map = new Map<string, ServiceEntry[]>();
    for (const s of services) {
      if (!map.has(s.section)) map.set(s.section, []);
      map.get(s.section)!.push(s);
    }
    // Trier les sections par le sort_order minimum de chacune
    return [...map.entries()].sort((a, b) =>
      Math.min(...a[1].map(x => x.sort_order)) - Math.min(...b[1].map(x => x.sort_order))
    );
  }, [services]);

  // Sections groupées externes (tab 3)
  const externesBySection = useMemo(() => {
    const map = new Map<string, AmbulanceEntry[]>();
    for (const s of externes) {
      if (!map.has(s.section)) map.set(s.section, []);
      map.get(s.section)!.push(s);
    }
    return [...map.entries()].sort((a, b) =>
      Math.min(...a[1].map(x => x.sort_order)) - Math.min(...b[1].map(x => x.sort_order))
    );
  }, [externes]);

  // Sections groupées ambulances (tab 4)
  const ambulancesBySection = useMemo(() => {
    const map = new Map<string, AmbulanceEntry[]>();
    for (const s of ambulances) {
      if (!map.has(s.section)) map.set(s.section, []);
      map.get(s.section)!.push(s);
    }
    return [...map.entries()].sort((a, b) =>
      Math.min(...a[1].map(x => x.sort_order)) - Math.min(...b[1].map(x => x.sort_order))
    );
  }, [ambulances]);

  // Sections groupées + filtre site + filtre pôle + recherche (tab 4 CHPCB)
  const showPolePills = chpcbSite === 'all' || chpcbSite === 'SITE LES CHARMES';

  const chpcbBySection = useMemo(() => {
    const q = chpcbSearch.trim().toLowerCase();
    const poleFilter = chpcbSite === 'all' || chpcbSite === 'SITE LES CHARMES';
    const filtered = chpcbEntries.filter(e => {
      if (chpcbSite !== 'all' && e.site !== chpcbSite) return false;
      if (poleFilter && chpcbPole !== 'all' && getPole(e.section) !== chpcbPole) return false;
      if (q) return (
        e.label.toLowerCase().includes(q) ||
        e.phone_number.includes(q) ||
        e.section.toLowerCase().includes(q)
      );
      return true;
    });
    const map = new Map<string, ChpcbEntry[]>();
    for (const s of filtered) {
      if (!map.has(s.section)) map.set(s.section, []);
      map.get(s.section)!.push(s);
    }
    return [...map.entries()].sort((a, b) =>
      Math.min(...a[1].map(x => x.sort_order)) - Math.min(...b[1].map(x => x.sort_order))
    );
  }, [chpcbEntries, chpcbSearch, chpcbSite, chpcbPole]);

  // ── Filtrage tab 1 ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortEntries(entries.filter(e => {
      if (filterEtage !== 'all' && e.resident.floor !== filterEtage) return false;
      if (filterLigne === 'active'   && !e.ligne_active) return false;
      if (filterLigne === 'inactive' &&  e.ligne_active) return false;
      if (q) {
        const name = `${e.resident.last_name} ${e.resident.first_name ?? ''} ${e.resident.room ?? ''}`.toLowerCase();
        if (!name.includes(q) && !e.phone_number.includes(q)) return false;
      }
      return true;
    }));
  }, [entries, filterEtage, filterLigne, search]);

  const nbActive = entries.filter(e => {
    if (filterEtage !== 'all' && e.resident.floor !== filterEtage) return false;
    return e.ligne_active;
  }).length;

  // ── Mutations tab 1 ───────────────────────────────────────────────────────

  const invalidate1 = () => qc.invalidateQueries({ queryKey: ['annuaire_residents'] });

  const toggleMut = useMutation({
    mutationFn: async ({ id, current }: { id: string; current: boolean }) => {
      const sb = createClient();
      const { error } = await sb.from('annuaire_residents')
        .update({ ligne_active: !current, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate1(); toast.success('Ligne mise à jour'); },
    onError:   () => toast.error('Erreur de mise à jour'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const sb = createClient();
      const { error } = await sb.from('annuaire_residents').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate1(); setDeleteEntry(null); toast.success('Entrée supprimée'); },
    onError:   () => toast.error('Erreur de suppression'),
  });

  // ── Mutations tab 2 ───────────────────────────────────────────────────────

  const invalidate2 = () => qc.invalidateQueries({ queryKey: ['annuaire_services'] });

  const deleteSvcMut = useMutation({
    mutationFn: async (id: string) => {
      const sb = createClient();
      const { error } = await sb.from('annuaire_services').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate2(); setDeleteSvc(null); toast.success('Entrée supprimée'); },
    onError:   () => toast.error('Erreur de suppression'),
  });

  // ── Mutations tab 3 ───────────────────────────────────────────────────────

  const invalidate3 = () => qc.invalidateQueries({ queryKey: ['annuaire_chpcb'] });

  const deleteChpcbMut = useMutation({
    mutationFn: async (id: string) => {
      const sb = createClient();
      const { error } = await sb.from('annuaire_chpcb').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate3(); setDeleteChpcb(null); toast.success('Entrée supprimée'); },
    onError:   () => toast.error('Erreur de suppression'),
  });

  // ── Render ────────────────────────────────────────────────────────────────

  const invalidateExt = () => qc.invalidateQueries({ queryKey: ['annuaire_externes'] });

  const deleteExtMut = useMutation({
    mutationFn: async (id: string) => {
      const sb = createClient();
      const { error } = await sb.from('annuaire_externes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateExt(); setDeleteExt(null); toast.success('Entrée supprimée'); },
    onError:   () => toast.error('Erreur de suppression'),
  });

  const invalidateAmb = () => qc.invalidateQueries({ queryKey: ['annuaire_ambulances'] });

  const deleteAmbMut = useMutation({
    mutationFn: async (id: string) => {
      const sb = createClient();
      const { error } = await sb.from('annuaire_ambulances').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAmb(); setDeleteAmb(null); toast.success('Entrée supprimée'); },
    onError:   () => toast.error('Erreur de suppression'),
  });

  if (loadingEntries || loadingServices || loadingExt || loadingAmb || loadingChpcb) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a3560]" />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>

      {/* ── Header ── */}
      <div className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}>
        <div className="relative z-10 max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/90">Annuaire</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <BookUser className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">Annuaire</h1>
              <p className="text-white/70 text-sm">Numéros internes</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => activeTab === 'lignes-directes' ? setShowAdd(true) : activeTab === 'services' ? setShowAddSvc(true) : activeTab === 'externes' ? setShowAddExt(true) : activeTab === 'ambulances' ? setShowAddAmb(true) : setShowAddChpcb(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <Plus className="h-4 w-4" /> Ajouter
              </button>
            )}
          </div>

          {/* ── Onglets ── */}
          <div className="flex gap-1 mt-5 border-b border-white/20 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('lignes-directes')}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors',
                activeTab === 'lignes-directes'
                  ? 'border-white text-white'
                  : 'border-transparent text-white/50 hover:text-white/80'
              )}
            >
              <Phone className="h-3.5 w-3.5" />
              Lignes Directes Chambres
            </button>
            <button
              onClick={() => setActiveTab('services')}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors',
                activeTab === 'services'
                  ? 'border-white text-white'
                  : 'border-transparent text-white/50 hover:text-white/80'
              )}
            >
              <Building2 className="h-3.5 w-3.5" />
              Numéros Internes
            </button>
            <button
              onClick={() => setActiveTab('externes')}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap',
                activeTab === 'externes'
                  ? 'border-white text-white'
                  : 'border-transparent text-white/50 hover:text-white/80'
              )}
            >
              <Hash className="h-3.5 w-3.5" />
              N° Abrégés Ext.
            </button>
            <button
              onClick={() => setActiveTab('ambulances')}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap',
                activeTab === 'ambulances'
                  ? 'border-white text-white'
                  : 'border-transparent text-white/50 hover:text-white/80'
              )}
            >
              <Ambulance className="h-3.5 w-3.5" />
              Ambulances / VSL
            </button>
            <button
              onClick={() => setActiveTab('chpcb')}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors',
                activeTab === 'chpcb'
                  ? 'border-white text-white'
                  : 'border-transparent text-white/50 hover:text-white/80'
              )}
            >
              <Hospital className="h-3.5 w-3.5" />
              CHPCB
            </button>
          </div>
        </div>
      </div>

      {/* ── Corps ── */}
      <div className={cn('max-w-5xl mx-auto px-4', (activeTab === 'services' || activeTab === 'externes' || activeTab === 'ambulances') ? 'py-3 pb-4' : 'py-6 pb-20')}>

        {/* ══ TAB 1 : Lignes Directes Chambres ══ */}
        {activeTab === 'lignes-directes' && (
          <>
            {/* Filtres + recherche + stats */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex flex-wrap gap-2">
                <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1 shadow-sm">
                  {([['all','Tous'],['RDC','RDC'],['1ER','1er étage']] as const).map(([v,l]) => (
                    <button key={v} onClick={() => setFilterEtage(v)}
                      className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                        filterEtage === v ? 'bg-[#1a3560] text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                      )}>{l}</button>
                  ))}
                </div>
                <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1 shadow-sm">
                  {([['all','Toutes'],['active','Activée'],['inactive','Non activée']] as const).map(([v,l]) => (
                    <button key={v} onClick={() => setFilterLigne(v)}
                      className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                        filterLigne === v ? 'bg-[#1a3560] text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                      )}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-1 gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Rechercher un résident ou un numéro…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-[#0e6e80] shadow-sm"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-white rounded-xl px-4 py-2.5 border border-slate-200 shadow-sm whitespace-nowrap">
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span className="font-semibold">{nbActive}</span>
                  <span className="text-slate-300 mx-1">·</span>
                  <span className="text-slate-400">{filtered.length} affiché{filtered.length > 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>

            {/* Liste */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {filtered.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <PhoneOff className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Aucun résultat</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filtered.map(e => {
                    const r = e.resident;
                    const name = [r.title, r.last_name?.toUpperCase(), r.first_name].filter(Boolean).join(' ');
                    return (
                      <div key={e.id}
                        className={cn(
                          'flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors',
                          e.ligne_active && 'bg-green-50/40 hover:bg-green-50/60'
                        )}
                      >
                        <span className={cn(
                          'text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 w-10 text-center',
                          r.floor === 'RDC' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
                        )}>{r.floor}</span>
                        <span className="text-xs font-mono text-slate-400 w-12 shrink-0">Ch.{r.room}</span>
                        <span className="font-semibold text-slate-800 flex-1 truncate text-sm">{name}</span>
                        <span className={cn(
                          'flex items-center gap-1.5 font-mono font-bold text-base px-3 py-1 rounded-xl shrink-0',
                          e.ligne_active ? 'text-green-700 bg-green-100' : 'text-slate-500 bg-slate-100'
                        )}>
                          <Phone className="h-3.5 w-3.5" />
                          {e.phone_number}
                        </span>
                        <span className={cn(
                          'text-[10px] font-bold px-2 py-1 rounded-full shrink-0 hidden sm:inline-flex items-center gap-1',
                          e.ligne_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
                        )}>
                          {e.ligne_active
                            ? <><Wifi className="h-2.5 w-2.5" /> Activée</>
                            : <><WifiOff className="h-2.5 w-2.5" /> Non activée</>}
                        </span>
                        {isAdmin && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => toggleMut.mutate({ id: e.id, current: e.ligne_active })}
                              title={e.ligne_active ? 'Désactiver' : 'Activer'}
                              className={cn('p-1.5 rounded-lg transition-colors',
                                e.ligne_active ? 'text-green-600 hover:bg-green-100' : 'text-slate-400 hover:bg-slate-100'
                              )}
                            >
                              {e.ligne_active ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                            </button>
                            <button onClick={() => setEditEntry(e)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button onClick={() => setDeleteEntry(e)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ TAB 2 : Numéros Internes ══ */}
        {activeTab === 'services' && (
          <div className="columns-2 gap-3">
            {servicesBySection.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center text-slate-400">
                <PhoneOff className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Aucun numéro interne</p>
              </div>
            ) : servicesBySection.map(([section, items]) => (
              <div key={section} className="break-inside-avoid mb-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {/* En-tête de section */}
                <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{section}</span>
                </div>
                {/* Entrées */}
                <div className="divide-y divide-slate-100">
                  {items.map(svc => (
                    <div key={svc.id}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 transition-colors">
                      <span className="text-slate-700 flex-1 text-sm leading-tight">{svc.label}</span>
                      <span className="font-mono font-bold text-sm text-blue-700 shrink-0 tabular-nums">
                        {svc.phone_number}
                      </span>
                      {isAdmin && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => setEditSvc(svc)}
                            className="p-1 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Modifier">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button onClick={() => setDeleteSvc(svc)}
                            className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Supprimer">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ TAB 3 : N° Abrégés Extérieurs ══ */}
        {activeTab === 'externes' && (
          <div className="columns-2 gap-3">
            {externesBySection.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center text-slate-400">
                <PhoneOff className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Aucun numéro</p>
              </div>
            ) : externesBySection.map(([section, items]) => (
              <div key={section} className="break-inside-avoid mb-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-3 py-1.5 bg-indigo-50 border-b border-indigo-100">
                  <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">{section}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map(ext => (
                    <div key={ext.id}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 transition-colors">
                      {ext.speed_dial && (
                        <span className="font-mono text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0 tabular-nums">
                          {ext.speed_dial}
                        </span>
                      )}
                      <span className="text-slate-700 flex-1 text-xs leading-tight">{ext.label}</span>
                      <span className="font-mono font-bold text-xs text-slate-700 shrink-0 tabular-nums">
                        {ext.phone_number}
                      </span>
                      {isAdmin && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => setEditExt(ext)}
                            className="p-1 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button onClick={() => setDeleteExt(ext)}
                            className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ TAB 4 : Ambulances / VSL ══ */}
        {activeTab === 'ambulances' && (
          <div className="columns-2 gap-3">
            {ambulancesBySection.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center text-slate-400">
                <PhoneOff className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Aucun numéro</p>
              </div>
            ) : ambulancesBySection.map(([section, items]) => (
              <div key={section} className="break-inside-avoid mb-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-100">
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">{section}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map(amb => (
                    <div key={amb.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors">
                      <span className="text-slate-700 flex-1 text-sm leading-tight">{amb.label}</span>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="font-mono font-bold text-sm text-slate-700 tabular-nums">
                          {amb.phone_number}
                        </span>
                        {amb.speed_dial && (
                          <span className="font-mono text-xs font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                            {amb.speed_dial}
                          </span>
                        )}
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => setEditAmb(amb)}
                            className="p-1 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button onClick={() => setDeleteAmb(amb)}
                            className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ TAB 4 : CHPCB ══ */}
        {activeTab === 'chpcb' && (
          <>
            {/* Filtre sites */}
            <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1 scrollbar-none">
              {CHPCB_SITES.map(site => (
                <button key={site.id} onClick={() => { setChpcbSite(site.id); setChpcbPole('all'); }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors shrink-0',
                    chpcbSite === site.id
                      ? 'bg-[#0e6e80] text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  )}>
                  {site.label}
                </button>
              ))}
            </div>

            {/* Filtre pôles (seulement pour Les Charmes / Tous) */}
            {showPolePills && (
              <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1 scrollbar-none">
                {CHPCB_POLES.map(pole => (
                  <button key={pole.id} onClick={() => setChpcbPole(pole.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors shrink-0',
                      chpcbPole === pole.id
                        ? 'bg-[#1a3560] text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    )}>
                    {pole.label}
                  </button>
                ))}
              </div>
            )}

            {/* Barre de recherche */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher un service, un nom ou un numéro…"
                value={chpcbSearch}
                onChange={e => setChpcbSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-[#0e6e80] shadow-sm"
              />
            </div>
            <div className="columns-3 gap-3">
              {chpcbBySection.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-center text-slate-400">
                  <PhoneOff className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Aucun résultat</p>
                </div>
              ) : chpcbBySection.map(([section, items]) => (
                <div key={section} className="break-inside-avoid mb-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{section}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.map(entry => (
                      <div key={entry.id}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 transition-colors">
                        <span className="text-slate-700 flex-1 text-xs leading-tight">{entry.label}</span>
                        <span className="font-mono font-bold text-xs text-blue-700 shrink-0 tabular-nums">
                          {entry.phone_number}
                        </span>
                        {isAdmin && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button onClick={() => setEditChpcb(entry)}
                              className="p-1 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button onClick={() => setDeleteChpcb(entry)}
                              className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Modals Tab 1 ── */}
      {showAdd && (
        <AddResidentModal
          residents={availableResidents}
          onClose={() => setShowAdd(false)}
          onSaved={() => { invalidate1(); setShowAdd(false); }}
        />
      )}
      {editEntry && (
        <EditResidentModal
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={() => { invalidate1(); setEditEntry(null); }}
        />
      )}
      {deleteEntry && (
        <ConfirmModal
          title="Supprimer cette entrée ?"
          description={`${deleteEntry.resident.last_name?.toUpperCase()} ${deleteEntry.resident.first_name} — ${deleteEntry.phone_number}`}
          onCancel={() => setDeleteEntry(null)}
          onConfirm={() => deleteMut.mutate(deleteEntry.id)}
        />
      )}

      {/* ── Modals Tab 2 ── */}
      {showAddSvc && (
        <AddServiceModal
          existingSections={servicesBySection.map(([s]) => s)}
          maxSortOrder={services.length > 0 ? Math.max(...services.map(s => s.sort_order)) : 0}
          onClose={() => setShowAddSvc(false)}
          onSaved={() => { invalidate2(); setShowAddSvc(false); }}
        />
      )}
      {editSvc && (
        <EditServiceModal
          entry={editSvc}
          existingSections={servicesBySection.map(([s]) => s)}
          onClose={() => setEditSvc(null)}
          onSaved={() => { invalidate2(); setEditSvc(null); }}
        />
      )}
      {deleteSvc && (
        <ConfirmModal
          title="Supprimer cette entrée ?"
          description={`${deleteSvc.label} — ${deleteSvc.phone_number}`}
          onCancel={() => setDeleteSvc(null)}
          onConfirm={() => deleteSvcMut.mutate(deleteSvc.id)}
        />
      )}

      {/* ── Modals Tab 3 Externes ── */}
      {showAddExt && (
        <AddServiceModal
          existingSections={externesBySection.map(([s]) => s)}
          maxSortOrder={externes.length > 0 ? Math.max(...externes.map(s => s.sort_order)) : 0}
          tableName="annuaire_externes"
          onClose={() => setShowAddExt(false)}
          onSaved={() => { invalidateExt(); setShowAddExt(false); }}
        />
      )}
      {editExt && (
        <EditServiceModal
          entry={editExt}
          existingSections={externesBySection.map(([s]) => s)}
          tableName="annuaire_externes"
          onClose={() => setEditExt(null)}
          onSaved={() => { invalidateExt(); setEditExt(null); }}
        />
      )}
      {deleteExt && (
        <ConfirmModal
          title="Supprimer cette entrée ?"
          description={`${deleteExt.label} — ${deleteExt.phone_number}`}
          onCancel={() => setDeleteExt(null)}
          onConfirm={() => deleteExtMut.mutate(deleteExt.id)}
        />
      )}

      {/* ── Modals Tab 4 Ambulances ── */}
      {showAddAmb && (
        <AddServiceModal
          existingSections={ambulancesBySection.map(([s]) => s)}
          maxSortOrder={ambulances.length > 0 ? Math.max(...ambulances.map(s => s.sort_order)) : 0}
          tableName="annuaire_ambulances"
          onClose={() => setShowAddAmb(false)}
          onSaved={() => { invalidateAmb(); setShowAddAmb(false); }}
        />
      )}
      {editAmb && (
        <EditServiceModal
          entry={editAmb}
          existingSections={ambulancesBySection.map(([s]) => s)}
          tableName="annuaire_ambulances"
          onClose={() => setEditAmb(null)}
          onSaved={() => { invalidateAmb(); setEditAmb(null); }}
        />
      )}
      {deleteAmb && (
        <ConfirmModal
          title="Supprimer cette entrée ?"
          description={`${deleteAmb.label} — ${deleteAmb.phone_number}`}
          onCancel={() => setDeleteAmb(null)}
          onConfirm={() => deleteAmbMut.mutate(deleteAmb.id)}
        />
      )}

      {/* ── Modals Tab 4 CHPCB ── */}
      {showAddChpcb && (
        <AddServiceModal
          existingSections={[...new Set(chpcbEntries.map(e => e.section))]}
          maxSortOrder={chpcbEntries.length > 0 ? Math.max(...chpcbEntries.map(s => s.sort_order)) : 0}
          tableName="annuaire_chpcb"
          onClose={() => setShowAddChpcb(false)}
          onSaved={() => { invalidate3(); setShowAddChpcb(false); }}
        />
      )}
      {editChpcb && (
        <EditServiceModal
          entry={editChpcb}
          existingSections={[...new Set(chpcbEntries.map(e => e.section))]}
          tableName="annuaire_chpcb"
          onClose={() => setEditChpcb(null)}
          onSaved={() => { invalidate3(); setEditChpcb(null); }}
        />
      )}
      {deleteChpcb && (
        <ConfirmModal
          title="Supprimer cette entrée ?"
          description={`${deleteChpcb.label} — ${deleteChpcb.phone_number}`}
          onCancel={() => setDeleteChpcb(null)}
          onConfirm={() => deleteChpcbMut.mutate(deleteChpcb.id)}
        />
      )}
    </div>
  );
}

// ── Modal Confirm générique ───────────────────────────────────────────────────

function ConfirmModal({ title, description, onCancel, onConfirm }: {
  title: string; description: string; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <p className="font-bold text-slate-800 text-base mb-2">{title}</p>
        <p className="text-sm text-slate-500 mb-6">{description}</p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
            Annuler
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-semibold transition-colors">
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Ajouter résident ────────────────────────────────────────────────────

function AddResidentModal({ residents, onClose, onSaved }: {
  residents: Resident[]; onClose: () => void; onSaved: () => void;
}) {
  const [search,     setSearch]     = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [phone,      setPhone]      = useState('');
  const [active,     setActive]     = useState(false);
  const [saving,     setSaving]     = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return residents.filter(r => {
      const txt = `${r.last_name} ${r.first_name ?? ''} ${r.room ?? ''} ${r.floor ?? ''}`.toLowerCase();
      return !q || txt.includes(q);
    }).sort((a, b) => {
      if (a.floor !== b.floor) return (a.floor ?? '') < (b.floor ?? '') ? -1 : 1;
      return roomNum(a.room) - roomNum(b.room);
    });
  }, [residents, search]);

  const handleSave = async () => {
    if (!selectedId || !phone.trim()) return;
    setSaving(true);
    try {
      const sb = createClient();
      const { error } = await sb.from('annuaire_residents').insert({
        resident_id: selectedId, phone_number: phone.trim(), ligne_active: active,
      });
      if (error) throw error;
      toast.success('Résident ajouté à l\'annuaire');
      onSaved();
    } catch { toast.error('Erreur lors de l\'ajout'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <p className="font-bold text-slate-800">Ajouter un résident</p>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Résident</label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input type="text" placeholder="Rechercher par nom, chambre…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0e6e80]" />
            </div>
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {filtered.length === 0
                ? <p className="text-sm text-slate-400 text-center py-4">Aucun résident disponible</p>
                : filtered.map(r => {
                  const name = [r.title, r.last_name?.toUpperCase(), r.first_name].filter(Boolean).join(' ');
                  return (
                    <button key={r.id} onClick={() => setSelectedId(r.id)}
                      className={cn('w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors',
                        selectedId === r.id ? 'bg-[#0e6e80]/10 text-[#0e6e80]' : 'hover:bg-slate-50 text-slate-700')}>
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0',
                        r.floor === 'RDC' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700')}>{r.floor}</span>
                      <span className="text-xs text-slate-400 font-mono w-8 shrink-0">Ch.{r.room}</span>
                      <span className="font-medium flex-1 truncate">{name}</span>
                      {selectedId === r.id && <Check className="h-4 w-4 shrink-0 text-[#0e6e80]" />}
                    </button>
                  );
                })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Numéro interne</label>
            <input type="text" placeholder="ex : 85 96" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0e6e80] font-mono" />
          </div>
          <button onClick={() => setActive(v => !v)}
            className={cn('w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-sm font-semibold',
              active ? 'bg-green-50 border-green-300 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-500')}>
            {active ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {active ? 'Ligne activée' : 'Ligne non activée'}
          </button>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">Annuler</button>
          <button onClick={handleSave} disabled={!selectedId || !phone.trim() || saving}
            className="flex-1 py-2.5 bg-[#1a3560] hover:bg-[#0e6e80] disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors">
            {saving ? 'Ajout…' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Modifier résident ───────────────────────────────────────────────────

function EditResidentModal({ entry, onClose, onSaved }: {
  entry: AnnuaireEntry; onClose: () => void; onSaved: () => void;
}) {
  const [phone,  setPhone]  = useState(entry.phone_number);
  const [active, setActive] = useState(entry.ligne_active);
  const [saving, setSaving] = useState(false);
  const r = entry.resident;
  const name = [r.title, r.last_name?.toUpperCase(), r.first_name].filter(Boolean).join(' ');

  const handleSave = async () => {
    if (!phone.trim()) return;
    setSaving(true);
    try {
      const sb = createClient();
      const { error } = await sb.from('annuaire_residents')
        .update({ phone_number: phone.trim(), ligne_active: active, updated_at: new Date().toISOString() })
        .eq('id', entry.id);
      if (error) throw error;
      toast.success('Mis à jour');
      onSaved();
    } catch { toast.error('Erreur de mise à jour'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-bold text-slate-800">Modifier</p>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <p className="text-sm font-semibold text-slate-700 mb-4">{name} — Ch.{r.room}</p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Numéro interne</label>
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0e6e80] font-mono" />
          </div>
          <button onClick={() => setActive(v => !v)}
            className={cn('w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-sm font-semibold',
              active ? 'bg-green-50 border-green-300 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-500')}>
            {active ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {active ? 'Ligne activée' : 'Ligne non activée'}
          </button>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">Annuler</button>
          <button onClick={handleSave} disabled={!phone.trim() || saving}
            className="flex-1 py-2.5 bg-[#1a3560] hover:bg-[#0e6e80] disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Ajouter service ─────────────────────────────────────────────────────

function AddServiceModal({ existingSections, maxSortOrder, tableName = 'annuaire_services', onClose, onSaved }: {
  existingSections: string[]; maxSortOrder: number; tableName?: string; onClose: () => void; onSaved: () => void;
}) {
  const [section, setSection] = useState(existingSections[0] ?? '');
  const [newSection, setNewSection] = useState('');
  const [useNewSection, setUseNewSection] = useState(false);
  const [label, setLabel] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const finalSection = useNewSection ? newSection.trim() : section;

  const handleSave = async () => {
    if (!finalSection || !label.trim() || !phone.trim()) return;
    setSaving(true);
    try {
      const sb = createClient();
      const { error } = await sb.from(tableName).insert({
        section: finalSection,
        label: label.trim(),
        phone_number: phone.trim(),
        sort_order: maxSortOrder + 10,
      });
      if (error) throw error;
      toast.success('Entrée ajoutée');
      onSaved();
    } catch { toast.error('Erreur lors de l\'ajout'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <p className="font-bold text-slate-800">Ajouter un numéro interne</p>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <div className="space-y-4">
          {/* Section */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Section</label>
            {!useNewSection ? (
              <div className="flex gap-2">
                <select value={section} onChange={e => setSection(e.target.value)}
                  className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0e6e80]">
                  {existingSections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => setUseNewSection(true)}
                  className="px-3 py-2.5 text-xs font-semibold text-[#0e6e80] border border-[#0e6e80]/30 rounded-xl hover:bg-[#0e6e80]/10 transition-colors whitespace-nowrap">
                  + Nouvelle
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input type="text" placeholder="Nom de la section" value={newSection}
                  onChange={e => setNewSection(e.target.value)}
                  className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0e6e80]" />
                <button onClick={() => setUseNewSection(false)}
                  className="px-3 py-2.5 text-xs font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                  Existante
                </button>
              </div>
            )}
          </div>
          {/* Label */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Intitulé</label>
            <input type="text" placeholder="ex : Infirmière" value={label} onChange={e => setLabel(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0e6e80]" />
          </div>
          {/* Numéro */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Numéro</label>
            <input type="text" placeholder="ex : 85 53" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0e6e80] font-mono" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">Annuler</button>
          <button onClick={handleSave} disabled={!finalSection || !label.trim() || !phone.trim() || saving}
            className="flex-1 py-2.5 bg-[#1a3560] hover:bg-[#0e6e80] disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors">
            {saving ? 'Ajout…' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Modifier service ────────────────────────────────────────────────────

function EditServiceModal({ entry, existingSections, tableName = 'annuaire_services', onClose, onSaved }: {
  entry: ServiceEntry; existingSections: string[]; tableName?: string; onClose: () => void; onSaved: () => void;
}) {
  const [section, setSection] = useState(entry.section);
  const [label,   setLabel]   = useState(entry.label);
  const [phone,   setPhone]   = useState(entry.phone_number);
  const [saving,  setSaving]  = useState(false);

  const handleSave = async () => {
    if (!section.trim() || !label.trim() || !phone.trim()) return;
    setSaving(true);
    try {
      const sb = createClient();
      const { error } = await sb.from(tableName)
        .update({ section: section.trim(), label: label.trim(), phone_number: phone.trim(), updated_at: new Date().toISOString() })
        .eq('id', entry.id);
      if (error) throw error;
      toast.success('Mis à jour');
      onSaved();
    } catch { toast.error('Erreur de mise à jour'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <p className="font-bold text-slate-800">Modifier</p>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Section</label>
            <select value={section} onChange={e => setSection(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0e6e80]">
              {existingSections.map(s => <option key={s} value={s}>{s}</option>)}
              {!existingSections.includes(section) && <option value={section}>{section}</option>}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Intitulé</label>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0e6e80]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Numéro</label>
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0e6e80] font-mono" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">Annuler</button>
          <button onClick={handleSave} disabled={!section.trim() || !label.trim() || !phone.trim() || saving}
            className="flex-1 py-2.5 bg-[#1a3560] hover:bg-[#0e6e80] disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
