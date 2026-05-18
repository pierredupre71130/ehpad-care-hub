'use client';

/**
 * Dossier de Soins Infirmiers (DSI)
 * Vue consolidée par résident regroupant : identité, DSI (personne à prévenir
 * + autres + motif), GIR/niveau de soin, prises en charge, surveillance poids,
 * matelas/coussins, contentions, vaccinations.
 */

import { useState, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft, Search, FolderHeart, User, Phone, MapPin, Heart, Stethoscope,
  Shield, Scale, BedDouble, Syringe, ClipboardList, Pill, AlertTriangle,
  CalendarDays, ChevronRight,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface PersonneAPrevenir {
  nom?: string; prenom?: string; adresse?: string; tel?: string; mobile?: string;
  lien?: string; personne_confiance?: boolean;
}
interface AutrePersonne { nom?: string; prenom?: string; lien?: string; adresse?: string; tel?: string; }
interface DSI { personne_prevenir?: PersonneAPrevenir; autres_personnes?: AutrePersonne[]; motif_entree?: string; }

interface Resident {
  id: string;
  room: string;
  floor: string;
  title: string;
  first_name: string;
  last_name: string;
  maiden_name?: string;
  date_naissance: string | null;
  date_entree: string | null;
  situation_familiale?: string;
  medecin: string;
  antecedents: string;
  allergie_medicamenteuse?: string;
  allergie_poisson?: boolean;
  allergie_autre?: string;
  regime_mixe?: boolean;
  viande_mixee?: boolean;
  regime_diabetique?: boolean;
  epargne_intestinale?: boolean;
  traitement_ecrase?: boolean;
  insuline_matin?: boolean;
  insuline_soir?: boolean;
  anticoagulants?: boolean;
  appel_nuit?: boolean;
  chaussettes_de_contention?: boolean;
  bas_de_contention?: boolean;
  bande_de_contention?: boolean;
  annotations?: string;
  archived?: boolean;
  photo_url?: string | null;
  dsi?: DSI | null;
}

interface PoidsMesure { resident_id: string; date: string; poids_kg: number; }
interface NiveauSoin {
  resident_id: string; gir: string; niveau_soin: string;
  appel_nuit_info: string; tutelle: string; updated_at?: string;
}
interface Vaccination {
  resident_id?: string; resident_name?: string; year: number;
  covid_inj1?: string | null; covid_inj2?: string | null; covid_inj3?: string | null;
  grippe_inj1?: string | null; infos?: string | null;
}
interface VaccinationLT {
  resident_id?: string; resident_name?: string;
  tetanos_date?: string | null; pneumovax_date?: string | null; notes?: string | null;
}
interface PecDetails {
  aideAlim?: string[]; hydratation?: string[]; dentier?: string[];
  urinaire?: string[]; fecale?: string[]; elimMateriel?: string[];
  appareilAuditif?: string[]; lunettes?: string[]; toilette?: string[];
  hygiene?: string[]; habillage?: string[]; locomotion?: string[];
  locoMateriel?: string[]; protectionJour?: string; protectionNuit?: string;
}
interface PecRow {
  chambre: string; matin?: string; apres_midi?: string; protection?: string;
  details?: PecDetails | null;
}
interface Contention { chambre: string; traitement: string; date_debut: string; date_fin: string; pas_de_fin: boolean; }
interface MatCouss { resident_id: string | null; kind: string; type_name: string | null; serial_number?: string | null; }

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function asArr(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string' && v) return [v];
  return [];
}

function isFemaleTitle(t?: string): boolean {
  if (!t) return false;
  const s = t.toLowerCase().replace(/\./g, '').trim();
  return s === 'mme' || s === 'me' || s === 'mlle' || s === 'madame' || s === 'mademoiselle';
}

function calcAge(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 ? `${age} ans` : '';
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR');
}

function parseVaccInfos(infos: string | null | undefined): { covid: string; grippe: string } {
  if (!infos) return { covid: '', grippe: '' };
  const map: Record<string, string> = {};
  infos.split('|').forEach(p => {
    const idx = p.indexOf(':');
    if (idx > 0) { map[p.slice(0, idx).trim()] = p.slice(idx + 1).trim(); }
  });
  return { covid: map.covid || '', grippe: map.grippe || '' };
}

function matchesResident(row: { resident_id?: string; resident_name?: string }, r: Resident): boolean {
  if (row.resident_id === r.id) return true;
  const vName = (row.resident_name || '').toLowerCase().trim();
  if (!vName) return false;
  const full = `${r.last_name} ${r.first_name || ''}`.toLowerCase().trim();
  if (vName === full) return true;
  const last = (r.last_name || '').toLowerCase().trim();
  return vName === last || vName.startsWith(last + ' ') || vName.startsWith(last + '.');
}

function situationLabel(s: string | undefined, fem: boolean): string {
  switch (s) {
    case 'marie':       return fem ? 'Mariée' : 'Marié';
    case 'celibataire': return 'Célibataire';
    case 'divorce':     return fem ? 'Divorcée' : 'Divorcé';
    case 'veuf':        return fem ? 'Veuve' : 'Veuf';
    default:            return '';
  }
}

const LOCO_MATERIEL_LABELS: Record<string, string> = {
  'canne': 'Canne',
  'deambulateur': 'Déambulateur',
  'fauteuil-roulant': 'Fauteuil roulant',
  'verticalisateur': 'Verticalisateur',
  'leve-malade': 'Lève-malade',
};

// ─────────────────────────────────────────────────────────────
// FETCHERS
// ─────────────────────────────────────────────────────────────

async function fetchResidents(): Promise<Resident[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('residents')
    .select('*')
    .eq('archived', false)
    .order('last_name', { ascending: true });
  if (error) throw new Error(error.message);
  const residents = (data ?? []) as Resident[];

  const withPhotos = residents.filter(r => r.photo_url && !r.photo_url.startsWith('http'));
  if (withPhotos.length > 0) {
    const { data: signed } = await sb.storage
      .from('resident-photos')
      .createSignedUrls(withPhotos.map(r => r.photo_url!), 3600);
    if (signed) {
      const urlMap: Record<string, string> = {};
      signed.forEach(s => { if (s.signedUrl && s.path) urlMap[s.path] = s.signedUrl; });
      return residents.map(r =>
        r.photo_url && urlMap[r.photo_url] ? { ...r, photo_url: urlMap[r.photo_url] } : r
      );
    }
  }
  return residents;
}

async function fetchDsiContext(resident: Resident) {
  const sb = createClient();
  const [
    { data: weights },
    { data: niveau },
    { data: allVacc },
    { data: allVaccLT },
    { data: pecRows },
    { data: contentions },
    { data: matCouss },
  ] = await Promise.all([
    sb.from('poids_mesure').select('*').eq('resident_id', resident.id).order('date', { ascending: false }).limit(5),
    sb.from('niveau_soin').select('*').eq('resident_id', resident.id).maybeSingle(),
    sb.from('vaccination').select('*'),
    sb.from('vaccination_long_terme').select('*'),
    sb.rpc('get_pec_rows', { p_floor: resident.floor }),
    sb.from('contentions').select('*').eq('type_suivi', 'contention').eq('chambre', resident.room),
    sb.from('mat_couss_items').select('*').eq('resident_id', resident.id).eq('status', 'attribue'),
  ]);

  const matchingVacc = ((allVacc ?? []) as Vaccination[]).filter(v => matchesResident(v, resident));
  const vaccination = matchingVacc.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0] ?? null;
  const matchingVaccLT = ((allVaccLT ?? []) as VaccinationLT[]).filter(v => matchesResident(v, resident));
  const vaccinationLT = matchingVaccLT[0] ?? null;

  const pecArr = Array.isArray(pecRows) ? pecRows : (pecRows ? [pecRows] : []);
  const pec = (pecArr as PecRow[]).find(r => r.chambre === resident.room) ?? null;

  return {
    weights: (weights ?? []) as PoidsMesure[],
    niveau: niveau as NiveauSoin | null,
    vaccination,
    vaccinationLT,
    pec,
    contentions: (contentions ?? []) as Contention[],
    matCouss: (matCouss ?? []) as MatCouss[],
  };
}

// ─────────────────────────────────────────────────────────────
// UI BUILDING BLOCKS
// ─────────────────────────────────────────────────────────────

function SectionCard({
  icon, title, accent = '#1a3560', children, span = 1,
}: { icon: ReactNode; title: string; accent?: string; children: ReactNode; span?: 1 | 2 }) {
  return (
    <section
      className={cn(
        'bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/70 overflow-hidden flex flex-col',
        span === 2 && 'sm:col-span-2'
      )}
    >
      <header
        className="flex items-center gap-2.5 px-4 py-2.5 text-white"
        style={{ background: `linear-gradient(120deg, ${accent} 0%, ${accent}cc 100%)` }}
      >
        <div className="h-7 w-7 rounded-lg bg-white/15 flex items-center justify-center">
          {icon}
        </div>
        <h3 className="text-sm font-bold tracking-wide uppercase">{title}</h3>
      </header>
      <div className="p-4 text-sm text-slate-700 flex-1">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">{label}</span>
      <span className="text-slate-800 break-words min-w-0 flex-1">
        {value || <span className="text-slate-300 italic">—</span>}
      </span>
    </div>
  );
}

function Badge({ children, color = 'slate' }: { children: ReactNode; color?: string }) {
  const palette: Record<string, string> = {
    slate:   'bg-slate-100 text-slate-700 ring-slate-200',
    rose:    'bg-rose-100 text-rose-700 ring-rose-200',
    amber:   'bg-amber-100 text-amber-700 ring-amber-200',
    emerald: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    sky:     'bg-sky-100 text-sky-700 ring-sky-200',
    violet:  'bg-violet-100 text-violet-700 ring-violet-200',
    cyan:    'bg-cyan-100 text-cyan-700 ring-cyan-200',
    red:     'bg-red-100 text-red-700 ring-red-200',
  };
  return (
    <span className={cn('inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ring-1', palette[color])}>
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default function DsiPage() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: residents = [], isLoading } = useQuery({
    queryKey: ['dsi-residents'],
    queryFn: fetchResidents,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return residents;
    return residents.filter(r => `${r.last_name} ${r.first_name} ${r.room}`.toLowerCase().includes(q));
  }, [residents, search]);

  const selected = useMemo(
    () => residents.find(r => r.id === selectedId) ?? null,
    [residents, selectedId]
  );

  const { data: ctx, isLoading: loadingCtx } = useQuery({
    queryKey: ['dsi-context', selectedId],
    queryFn: () => fetchDsiContext(selected!),
    enabled: !!selected,
  });

  return (
    <div className="min-h-screen pb-16" style={{ background: '#dde4ee' }}>
      {/* HEADER */}
      <header
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}
      >
        <div className="relative z-10 max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <span>›</span>
            <span className="text-white/75">DSI — Dossier de Soins Infirmiers</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="h-11 w-11 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center">
              <FolderHeart className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight leading-none">
                Dossier de Soins Infirmiers
              </h1>
              <p className="text-sm text-white/60 mt-1">Vue consolidée par résident — Résidence La Fourrier</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6">
        {!selected ? (
          <ResidentPicker
            residents={filtered}
            isLoading={isLoading}
            search={search}
            onSearch={setSearch}
            onSelect={setSelectedId}
          />
        ) : (
          <DsiDossier
            resident={selected}
            ctx={ctx ?? null}
            loading={loadingCtx}
            onBack={() => setSelectedId(null)}
          />
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RESIDENT PICKER
// ─────────────────────────────────────────────────────────────

function ResidentPicker({
  residents, isLoading, search, onSearch, onSelect,
}: {
  residents: Resident[];
  isLoading: boolean;
  search: string;
  onSearch: (v: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-5">
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Rechercher un résident (nom, prénom, chambre)…"
          className="pl-10 h-11"
        />
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Chargement…</p>
      ) : residents.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">Aucun résident.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[70vh] overflow-y-auto">
          {residents.map(r => (
            <button
              key={r.id}
              onClick={() => onSelect(r.id)}
              className="text-left flex items-center gap-3 p-2.5 rounded-xl hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all group"
            >
              {r.photo_url ? (
                <img src={r.photo_url} alt="" className="h-12 w-12 rounded-xl object-cover ring-1 ring-slate-200" />
              ) : (
                <div className="h-12 w-12 rounded-xl bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center">
                  <User className="h-5 w-5 text-slate-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {r.title} <span className="uppercase">{r.last_name}</span> {r.first_name}
                </div>
                <div className="text-xs text-slate-500">Chambre {r.room} · {r.floor}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DSI DOSSIER (résident sélectionné)
// ─────────────────────────────────────────────────────────────

function DsiDossier({
  resident, ctx, loading, onBack,
}: {
  resident: Resident;
  ctx: Awaited<ReturnType<typeof fetchDsiContext>> | null;
  loading: boolean;
  onBack: () => void;
}) {
  const fem = isFemaleTitle(resident.title);

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="text-sm text-blue-700 hover:underline inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Changer de résident
      </button>

      {/* HERO */}
      <HeroCard resident={resident} fem={fem} />

      {loading && (
        <p className="text-sm text-slate-500 text-center py-6">Chargement du dossier…</p>
      )}

      {/* GRID DE SECTIONS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        <IdentiteSection resident={resident} fem={fem} />

        <DsiContactsSection resident={resident} />

        <MotifSection resident={resident} />

        <MedicalSection resident={resident} niveau={ctx?.niveau ?? null} />

        <RegimesSection resident={resident} />

        <TraitementsSection resident={resident} />

        <PriseEnChargeSection pec={ctx?.pec ?? null} />

        <PoidsSection weights={ctx?.weights ?? []} />

        <VaccinationSection v={ctx?.vaccination ?? null} vLT={ctx?.vaccinationLT ?? null} />

        <MaterielSection matCouss={ctx?.matCouss ?? []} />

        <ContentionsSection contentions={ctx?.contentions ?? []} />

        <AnnotationsSection text={resident.annotations} />
      </div>
    </div>
  );
}

// ─── Hero ──────────────────────────────────────────────────────

function HeroCard({ resident, fem }: { resident: Resident; fem: boolean }) {
  return (
    <div
      className="rounded-2xl shadow-md overflow-hidden text-white"
      style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}
    >
      <div className="flex items-center gap-4 p-5">
        {resident.photo_url ? (
          <img
            src={resident.photo_url}
            alt=""
            className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl object-cover ring-4 ring-white/20 flex-shrink-0"
          />
        ) : (
          <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl bg-white/15 ring-4 ring-white/20 flex items-center justify-center flex-shrink-0">
            <User className="h-10 w-10 text-white/70" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60 mb-1">
            Dossier de soins infirmiers
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold leading-tight">
            {resident.title} <span className="uppercase">{resident.last_name}</span> {resident.first_name}
          </h2>
          {resident.maiden_name && (
            <p className="text-sm text-white/70 mt-0.5">
              ({fem ? 'née' : 'né'} {resident.maiden_name.toUpperCase()})
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Identité ─────────────────────────────────────────────────

function IdentiteSection({ resident, fem }: { resident: Resident; fem: boolean }) {
  return (
    <SectionCard icon={<User className="h-4 w-4" />} title="Identité" accent="#1a3560">
      <div className="space-y-2">
        <Field label="Titre" value={resident.title} />
        <Field label="Nom" value={<span className="uppercase font-medium">{resident.last_name}</span>} />
        <Field label="Prénom" value={resident.first_name} />
        {resident.maiden_name && (
          <Field label="Née" value={resident.maiden_name.toUpperCase()} />
        )}
        <Field label="Né(e) le" value={resident.date_naissance && `${formatDate(resident.date_naissance)} (${calcAge(resident.date_naissance)})`} />
        <Field label="Étage" value={resident.floor} />
        <Field label="Chambre" value={resident.room} />
        <Field label="Situation" value={situationLabel(resident.situation_familiale, fem)} />
        <Field label="Date d'entrée" value={formatDate(resident.date_entree)} />
      </div>
    </SectionCard>
  );
}

// ─── DSI : Personne à prévenir & autres ──────────────────────

function DsiContactsSection({ resident }: { resident: Resident }) {
  const pp = resident.dsi?.personne_prevenir ?? {};
  const autres = resident.dsi?.autres_personnes ?? [];
  const hasPP = !!(pp.nom || pp.prenom || pp.tel || pp.mobile || pp.adresse || pp.lien);

  return (
    <SectionCard icon={<Phone className="h-4 w-4" />} title="Personne à prévenir" accent="#9c1d62">
      {!hasPP && autres.length === 0 ? (
        <p className="text-sm text-slate-400 italic">Aucune information renseignée.</p>
      ) : (
        <div className="space-y-4">
          {hasPP && (
            <div className="rounded-xl ring-1 ring-rose-100 bg-rose-50/40 p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Prioritaire</span>
                {pp.personne_confiance && <Badge color="amber">Personne de confiance</Badge>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                <Field label="Nom" value={[pp.prenom, pp.nom].filter(Boolean).join(' ')} />
                <Field label="Lien" value={pp.lien} />
                <Field label="Adresse" value={pp.adresse} />
                <Field label="Tél fixe" value={pp.tel} />
                <Field label="Tél mobile" value={pp.mobile} />
              </div>
            </div>
          )}

          {autres.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Autres personnes pouvant être informées
              </p>
              <div className="space-y-2">
                {autres.map((a, i) => (
                  <div key={i} className="rounded-lg ring-1 ring-slate-200 bg-slate-50/60 p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    <Field label="Nom" value={[a.prenom, a.nom].filter(Boolean).join(' ')} />
                    <Field label="Lien" value={a.lien} />
                    <Field label="Adresse" value={a.adresse} />
                    <Field label="Tél" value={a.tel} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Motif d'entrée ────────────────────────────────────────────

function MotifSection({ resident }: { resident: Resident }) {
  const motif = resident.dsi?.motif_entree ?? '';
  return (
    <SectionCard icon={<CalendarDays className="h-4 w-4" />} title="Motif d'entrée" accent="#0e6e80" span={2}>
      <div className="space-y-2">
        <Field label="Date" value={formatDate(resident.date_entree)} />
        {motif ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{motif}</p>
        ) : (
          <p className="text-slate-300 italic text-sm">Aucun motif renseigné.</p>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Médical ──────────────────────────────────────────────────

function MedicalSection({ resident, niveau }: { resident: Resident; niveau: NiveauSoin | null }) {
  return (
    <SectionCard icon={<Stethoscope className="h-4 w-4" />} title="Suivi médical" accent="#d84040" span={2}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          <Field label="Médecin traitant" value={resident.medecin} />
          <Field label="GIR" value={niveau?.gir ? <Badge color="violet">{niveau.gir}</Badge> : ''} />
          <Field label="Niveau de soin" value={niveau?.niveau_soin} />
          <Field label="Appel nuit" value={niveau?.appel_nuit_info || (resident.appel_nuit ? 'Oui' : '')} />
          <Field label="Tutelle" value={niveau?.tutelle} />
          <Field label="Allergie médic." value={resident.allergie_medicamenteuse} />
        </div>
        {resident.antecedents && (
          <div className="pt-2 border-t border-slate-100">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Antécédents</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 bg-slate-50/60 rounded-lg p-3">
              {resident.antecedents}
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Régimes ─────────────────────────────────────────────────

function RegimesSection({ resident }: { resident: Resident }) {
  const flags: { label: string; color: string }[] = [];
  if (resident.regime_mixe) flags.push({ label: 'Mixé', color: 'sky' });
  if (resident.viande_mixee) flags.push({ label: 'Viande mixée', color: 'sky' });
  if (resident.regime_diabetique) flags.push({ label: 'Diabétique', color: 'amber' });
  if (resident.epargne_intestinale) flags.push({ label: 'Épargne intestinale', color: 'emerald' });
  if (resident.allergie_poisson) flags.push({ label: 'Allergie poisson', color: 'red' });
  return (
    <SectionCard icon={<Heart className="h-4 w-4" />} title="Régimes alimentaires" accent="#16a34a">
      {flags.length === 0 && !resident.allergie_autre ? (
        <p className="text-sm text-slate-400 italic">Régime normal</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {flags.map(f => <Badge key={f.label} color={f.color}>{f.label}</Badge>)}
            {flags.length === 0 && <Badge color="emerald">Normal</Badge>}
          </div>
          {resident.allergie_autre && (
            <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg bg-red-50 ring-1 ring-red-200">
              <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-red-800 font-medium">⚠ {resident.allergie_autre}</span>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Traitements particuliers ────────────────────────────────

function TraitementsSection({ resident }: { resident: Resident }) {
  const flags: { label: string; color: string }[] = [];
  if (resident.traitement_ecrase) flags.push({ label: 'Traitement écrasé', color: 'violet' });
  if (resident.insuline_matin)    flags.push({ label: 'Insuline matin ☀', color: 'cyan' });
  if (resident.insuline_soir)     flags.push({ label: 'Insuline soir 🌙', color: 'cyan' });
  if (resident.anticoagulants)    flags.push({ label: 'Anticoagulants', color: 'rose' });
  if (resident.chaussettes_de_contention) flags.push({ label: 'Chaussettes contention', color: 'sky' });
  if (resident.bas_de_contention) flags.push({ label: 'Bas de contention', color: 'slate' });
  if (resident.bande_de_contention) flags.push({ label: 'Bandes contention', color: 'amber' });
  return (
    <SectionCard icon={<Pill className="h-4 w-4" />} title="Traitements & matériel" accent="#7c3aed">
      {flags.length === 0 ? (
        <p className="text-sm text-slate-400 italic">Rien à signaler.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {flags.map(f => <Badge key={f.label} color={f.color}>{f.label}</Badge>)}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Prise en charge ──────────────────────────────────────────

function PriseEnChargeSection({ pec }: { pec: PecRow | null }) {
  if (!pec) {
    return (
      <SectionCard icon={<ClipboardList className="h-4 w-4" />} title="Prise en charge" accent="#3b72d8" span={2}>
        <p className="text-sm text-slate-400 italic">Aucune fiche prise en charge.</p>
      </SectionCard>
    );
  }
  const d = pec.details ?? {};
  const protJ = d.protectionJour ?? '';
  const protN = d.protectionNuit ?? '';

  const items: { label: string; value: string }[] = [];
  const push = (label: string, vals: string[]) => {
    if (vals.length) items.push({ label, value: vals.join(', ') });
  };

  push('Hygiène', asArr(d.hygiene));
  push('Toilette', asArr(d.toilette));
  push('Habillage', asArr(d.habillage));
  push('Locomotion', asArr(d.locomotion));
  push('Matériel loco', asArr(d.locoMateriel).map(v => LOCO_MATERIEL_LABELS[v] || v));
  push('Aide alim.', asArr(d.aideAlim));
  push('Hydratation', asArr(d.hydratation));
  push('Dentier', asArr(d.dentier));
  push('App. auditifs', asArr(d.appareilAuditif));
  push('Lunettes', asArr(d.lunettes));
  push('Élim. urinaire', asArr(d.urinaire));
  push('Élim. fécale', asArr(d.fecale));
  push('Matériel élim.', asArr(d.elimMateriel));

  return (
    <SectionCard icon={<ClipboardList className="h-4 w-4" />} title="Prise en charge" accent="#3b72d8" span={2}>
      <div className="space-y-3">
        {(protJ || protN) && (
          <div className="flex flex-wrap gap-2">
            {protJ && <Badge color="sky">Protection J : {protJ}</Badge>}
            {protN && <Badge color="violet">Protection N : {protN}</Badge>}
          </div>
        )}
        {pec.matin && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 mb-1">☀ Matin</p>
            <p className="whitespace-pre-wrap text-sm bg-amber-50/50 ring-1 ring-amber-100 rounded-lg p-3">{pec.matin}</p>
          </div>
        )}
        {pec.apres_midi && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 mb-1">🌙 Après-midi / Soir</p>
            <p className="whitespace-pre-wrap text-sm bg-indigo-50/50 ring-1 ring-indigo-100 rounded-lg p-3">{pec.apres_midi}</p>
          </div>
        )}
        {items.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Détail prise en charge</p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {items.map(it => (
                <div key={it.label} className="flex items-baseline gap-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">{it.label}</dt>
                  <dd className="text-slate-700 text-sm">{it.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Surveillance poids ──────────────────────────────────────

function PoidsSection({ weights }: { weights: PoidsMesure[] }) {
  if (weights.length === 0) {
    return (
      <SectionCard icon={<Scale className="h-4 w-4" />} title="Surveillance poids" accent="#0891b2">
        <p className="text-sm text-slate-400 italic">Aucune mesure.</p>
      </SectionCard>
    );
  }
  const last = weights[0];
  return (
    <SectionCard icon={<Scale className="h-4 w-4" />} title="Surveillance poids" accent="#0891b2">
      <div className="space-y-2">
        <div className="text-3xl font-bold text-slate-900">
          {last.poids_kg} <span className="text-sm font-medium text-slate-500">kg</span>
        </div>
        <p className="text-xs text-slate-500">Mesuré le {formatDate(last.date)}</p>
        {weights.length > 1 && (
          <div className="pt-2 border-t border-slate-100 space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Historique</p>
            <ul className="text-xs text-slate-600 space-y-0.5">
              {weights.slice(1).map((w, i) => (
                <li key={i} className="flex items-baseline justify-between">
                  <span>{formatDate(w.date)}</span>
                  <span className="font-mono">{w.poids_kg} kg</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Vaccination ─────────────────────────────────────────────

function VaccinationSection({ v, vLT }: { v: Vaccination | null; vLT: VaccinationLT | null }) {
  const lines: string[] = [];
  const refus: string[] = [];
  const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (v) {
    const { covid, grippe } = parseVaccInfos(v.infos);
    if (covid && /refus/i.test(covid)) {
      refus.push(`COVID (${/famille/i.test(covid) ? 'refus famille' : 'refus résident'})`);
    } else {
      const dates = [v.covid_inj1, v.covid_inj2, v.covid_inj3].filter(isDate).sort().reverse();
      if (dates.length) lines.push(`COVID ${v.year} — ${formatDate(dates[0])}`);
      else if (covid) lines.push(`COVID ${v.year} — ${covid}`);
    }
    if (grippe && /refus/i.test(grippe)) {
      refus.push(`Grippe (${/famille/i.test(grippe) ? 'refus famille' : 'refus résident'})`);
    } else if (isDate(v.grippe_inj1)) {
      lines.push(`Grippe ${v.year} — ${formatDate(v.grippe_inj1)}`);
    } else if (grippe) {
      lines.push(`Grippe ${v.year} — ${grippe}`);
    }
  }
  if (vLT?.tetanos_date)   lines.push(`Tétanos — ${formatDate(vLT.tetanos_date)}`);
  if (vLT?.pneumovax_date) lines.push(`Pneumovax — ${formatDate(vLT.pneumovax_date)}`);
  return (
    <SectionCard icon={<Syringe className="h-4 w-4" />} title="Vaccinations" accent="#0284c7">
      {lines.length === 0 && refus.length === 0 ? (
        <p className="text-sm text-slate-400 italic">Aucun vaccin enregistré.</p>
      ) : (
        <div className="space-y-2">
          <ul className="text-sm space-y-1">
            {lines.map((l, i) => <li key={i} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />{l}
            </li>)}
          </ul>
          {refus.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
              {refus.map((r, i) => <Badge key={i} color="red">{r}</Badge>)}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Matériel (matelas/coussins) ──────────────────────────────

function MaterielSection({ matCouss }: { matCouss: MatCouss[] }) {
  const matelas = matCouss.filter(m => m.kind === 'matelas');
  const coussins = matCouss.filter(m => m.kind === 'coussin');
  return (
    <SectionCard icon={<BedDouble className="h-4 w-4" />} title="Matelas & coussins" accent="#475569">
      {matCouss.length === 0 ? (
        <p className="text-sm text-slate-400 italic">Aucun matériel attribué.</p>
      ) : (
        <div className="space-y-2">
          {matelas.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Matelas</p>
              <div className="flex flex-wrap gap-1.5">
                {matelas.map((m, i) => <Badge key={i} color="slate">{m.type_name || '—'}</Badge>)}
              </div>
            </div>
          )}
          {coussins.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Coussins</p>
              <div className="flex flex-wrap gap-1.5">
                {coussins.map((c, i) => <Badge key={i} color="slate">{c.type_name || '—'}</Badge>)}
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Contentions ──────────────────────────────────────────────

function ContentionsSection({ contentions }: { contentions: Contention[] }) {
  return (
    <SectionCard icon={<Shield className="h-4 w-4" />} title="Contentions" accent="#b45309">
      {contentions.length === 0 ? (
        <p className="text-sm text-slate-400 italic">Aucune contention.</p>
      ) : (
        <ul className="text-sm space-y-2">
          {contentions.map((c, i) => (
            <li key={i} className="bg-amber-50/60 ring-1 ring-amber-100 rounded-lg p-2.5">
              <div className="font-semibold text-amber-900">{c.traitement}</div>
              <div className="text-xs text-amber-700 mt-0.5">
                {c.date_debut && <>Depuis {formatDate(c.date_debut)}</>}
                {c.pas_de_fin ? ' · sans fin' : c.date_fin ? ` · jusqu'au ${formatDate(c.date_fin)}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ─── Annotations ──────────────────────────────────────────────

function AnnotationsSection({ text }: { text?: string }) {
  if (!text?.trim()) return null;
  return (
    <SectionCard icon={<MapPin className="h-4 w-4" />} title="Annotations & consignes" accent="#475569" span={2}>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
    </SectionCard>
  );
}
