'use client';

/**
 * Fiche de Liaison des Soins Infirmiers — CHPLM-ENR-00499
 * Présentation calquée sur le document officiel.
 * Auto-remplit depuis : Résidents, GIR, Vaccination, Poids, Fiches Menu,
 * Prises en Charge, Contentions, Matelas.
 */

import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Printer, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface PersonneAPrevenir {
  nom?: string;
  prenom?: string;
  lien?: string;
  adresse?: string;
  tel?: string;
  mobile?: string;
}

interface TutelleCuratelle {
  type?: 'tutelle' | 'curatelle';
  nom?: string;
  tel?: string;
}

interface Respiration {
  normale?: boolean;
  dyspnee?: boolean;
  o2?: boolean;
  o2Debit?: string;
  o2Jour?: boolean;
  o2Nuit?: boolean;
  vni?: boolean;
  vniDebit?: string;
}

interface Comportement {
  coherent?: boolean;
  communique?: boolean;
}

interface DSI {
  personne_prevenir?: PersonneAPrevenir;
  autres_personnes?: Array<{ nom?: string; prenom?: string; lien?: string; adresse?: string; tel?: string }>;
  motif_entree?: string;
  tutelle_curatelle?: TutelleCuratelle;
  respiration?: Respiration;
  comportement?: Comportement;
}

interface Resident {
  id: string;
  room: string;
  floor: string;
  title: string;
  first_name: string;
  last_name: string;
  maiden_name?: string;
  date_naissance: string | null;
  medecin: string;
  antecedents: string;
  allergie_medicamenteuse?: string;
  allergie_poisson?: boolean;
  allergie_autre?: string;
  regime_mixe?: boolean;
  viande_mixee?: boolean;
  regime_diabetique?: boolean;
  epargne_intestinale?: boolean;
  photo_url?: string | null;
  archived?: boolean;
  dsi?: DSI | null;
  situation_familiale?: '' | 'marie' | 'celibataire' | 'divorce' | 'veuf';
}

interface PoidsMesure { resident_id: string; date: string; poids_kg: number; }
interface NiveauSoin {
  resident_id: string;
  gir: string;
  niveau_soin: string;
  appel_nuit_info: string;
  tutelle: string;
  updated_at?: string;
}
interface Vaccination {
  resident_id?: string;
  resident_name?: string;
  year: number;
  covid_inj1?: string | null;
  covid_inj2?: string | null;
  covid_inj3?: string | null;
  grippe_inj1?: string | null;
  infos?: string | null;
}
interface VaccinationLT {
  resident_id?: string;
  resident_name?: string;
  tetanos_date?: string | null;
  pneumovax_date?: string | null;
  notes?: string | null;
}
interface FicheMenu { resident_id: string; repas: string; observation: string; }
interface PecDetails {
  aideAlim?: string[];
  hydratation?: string[];
  fausseRoute?: string[];
  dentier?: string[];
  urinaire?: string[];
  fecale?: string[];
  elimMateriel?: string[];
  appareilAuditif?: string[];
  lunettes?: string[];
  toilette?: string[];
  hygiene?: string[];
  habillage?: string[];
  locomotion?: string[];
  locoMateriel?: string[];
  protectionJour?: string;
  protectionNuit?: string;
}
interface PecRow { chambre: string; protection: string; details?: PecDetails | null; }
interface Contention { chambre: string; traitement: string; date_debut: string; date_fin: string; pas_de_fin: boolean; }
interface MatCouss { resident_id: string | null; kind: string; type_name: string | null; }

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

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

function todayFR(): string {
  return new Date().toLocaleDateString('fr-FR');
}

function asArr(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string' && v) return [v];
  return [];
}

const LOCO_MATERIEL_MAP: Record<string, string> = {
  'canne': 'Canne',
  'deambulateur': 'Déambulateur',
  'fauteuil-roulant': 'Fauteuil roulant',
  'verticalisateur': 'Verticalisateur',
  'leve-malade': 'Lève-malade',
};

function isFemaleTitle(title?: string): boolean {
  if (!title) return false;
  const t = title.toLowerCase().replace(/\./g, '').trim();
  return t === 'mme' || t === 'me' || t === 'mlle' || t === 'madame' || t === 'mademoiselle';
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

function matchesResident(row: { resident_id?: string; resident_name?: string }, resident: Resident): boolean {
  if (row.resident_id === resident.id) return true;
  const vName = (row.resident_name || '').toLowerCase().trim();
  if (!vName) return false;
  const full = `${resident.last_name} ${resident.first_name || ''}`.toLowerCase().trim();
  if (vName === full) return true;
  const last = (resident.last_name || '').toLowerCase().trim();
  return vName === last || vName.startsWith(last + ' ') || vName.startsWith(last + '.');
}

// ─────────────────────────────────────────────────────────────
// SUPABASE FETCHERS
// ─────────────────────────────────────────────────────────────

async function fetchResidents(): Promise<Resident[]> {
  const sb = createClient();
  const { data, error } = await sb.from('residents').select('*').eq('archived', false).order('last_name');
  if (error) throw new Error(error.message);
  const residents = (data ?? []) as Resident[];
  const withPhotos = residents.filter(r => r.photo_url && !r.photo_url.startsWith('http'));
  if (withPhotos.length > 0) {
    const { data: signed } = await sb.storage.from('resident-photos').createSignedUrls(withPhotos.map(r => r.photo_url!), 3600);
    if (signed) {
      const urlMap: Record<string, string> = {};
      signed.forEach(s => { if (s.signedUrl && s.path) urlMap[s.path] = s.signedUrl; });
      return residents.map(r => r.photo_url && urlMap[r.photo_url] ? { ...r, photo_url: urlMap[r.photo_url] } : r);
    }
  }
  return residents;
}

async function fetchMutationContext(resident: Resident) {
  const sb = createClient();
  const [
    { data: lastWeight }, { data: niveau }, { data: allVacc }, { data: allVaccLT },
    { data: fichesMenu }, { data: pecRows }, { data: contentions }, { data: matCouss },
  ] = await Promise.all([
    sb.from('poids_mesure').select('*').eq('resident_id', resident.id).order('date', { ascending: false }).limit(1).maybeSingle(),
    sb.from('niveau_soin').select('*').eq('resident_id', resident.id).maybeSingle(),
    sb.from('vaccination').select('*'),
    sb.from('vaccination_long_terme').select('*'),
    sb.from('fiches_menu').select('*').eq('resident_id', resident.id),
    sb.rpc('get_pec_rows', { p_floor: resident.floor }),
    sb.from('contentions').select('*').eq('type_suivi', 'contention').eq('chambre', resident.room),
    sb.from('mat_couss_items').select('*').eq('resident_id', resident.id).eq('status', 'attribue'),
  ]);
  const pecArr = Array.isArray(pecRows) ? pecRows : (pecRows ? [pecRows] : []);
  const pec = (pecArr as PecRow[]).find(r => r.chambre === resident.room) ?? null;
  const matchingVacc = ((allVacc ?? []) as Vaccination[]).filter(v => matchesResident(v, resident));
  const vaccination = matchingVacc.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0] ?? null;
  const matchingVaccLT = ((allVaccLT ?? []) as VaccinationLT[]).filter(v => matchesResident(v, resident));
  const vaccinationLT = matchingVaccLT[0] ?? null;
  return {
    lastWeight: lastWeight as PoidsMesure | null,
    niveau: niveau as NiveauSoin | null,
    vaccination, vaccinationLT,
    fichesMenu: (fichesMenu ?? []) as FicheMenu[],
    pec: pec as PecRow | null,
    contentions: (contentions ?? []) as Contention[],
    matCouss: (matCouss ?? []) as MatCouss[],
  };
}

// ─────────────────────────────────────────────────────────────
// UI HELPERS (présentation fiche officielle)
// ─────────────────────────────────────────────────────────────

/** Titre de section avec fond gris foncé, texte blanc, uppercase */
function Titre({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#4a4a4a] text-white text-[10px] font-bold uppercase tracking-widest text-center py-[3px] px-2 print:bg-[#aaaaaa] print:text-black">
      {children}
    </div>
  );
}

/** Titre de sous-section (ex: ALIMENTATION ET HYDRATATION) dans les 2 colonnes */
function SousTitre({ children }: { children: ReactNode }) {
  return (
    <div className="text-[9px] font-bold uppercase text-center py-[2px] border-b border-black">
      {children}
    </div>
  );
}

/** Ligne de champ avec label + zone de saisie soulignée */
function Ligne({ label, children, className }: { label: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-baseline gap-1 text-[10px] leading-tight', className)}>
      <span className="font-semibold whitespace-nowrap shrink-0">{label}</span>
      <span className="flex-1 border-b border-black min-h-[14px] leading-tight">{children}</span>
    </div>
  );
}

/** Case à cocher style officiel */
function Case({
  checked, onChange, label, readOnly = false
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  label: string;
  readOnly?: boolean;
}) {
  return (
    <label className={cn('inline-flex items-center gap-1 text-[10px] cursor-pointer', readOnly && 'cursor-default')}>
      <span
        className={cn(
          'inline-block w-3 h-3 border border-black shrink-0 flex items-center justify-center',
          checked && 'bg-black'
        )}
        onClick={() => !readOnly && onChange?.(!checked)}
      >
        {checked && <span className="text-white text-[8px] leading-none">✓</span>}
      </span>
      <span>{label}</span>
    </label>
  );
}

/** Zone de texte inline éditable (style soulignement) */
function ZoneSaisie({ value, onChange, placeholder, className, multiline = false, rows = 1 }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  rows?: number;
}) {
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={cn(
          'w-full border-0 border-b border-black bg-transparent text-[10px] leading-tight resize-none outline-none focus:bg-blue-50 print:focus:bg-transparent px-0',
          className
        )}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full border-0 border-b border-black bg-transparent text-[10px] leading-tight outline-none focus:bg-blue-50 print:focus:bg-transparent px-0',
        className
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default function MutationPage() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    // En-tête
    nomService: 'EHPAD La Fourrier – Gueugnon',
    telService: '03 85 85 85 47',
    elaborePar: 'IDE',
    // Identification
    adresse: '5 route de Toulon, 71130 Gueugnon',
    taille: '',
    personneAPrevenirManuel: '',
    telPrevenir: '',
    personnePrevenue: false,
    // Environnement
    sitFamiliale: { celibataire: false, marie: false, veuf: false },
    vit: { famille: false, seul: false, etablissement: true, autre: '' },
    suiviSocialOui: false,
    suiviSocialNom: '',
    suiviSocialTel: '',
    tutelle: false,
    curatelle: false,
    // Devenir
    retourDomicileOui: false,
    retourDomicileNon: false,
    ssrOui: false,
    ssrNon: false,
    ssrLesquels: '',
    ehpadOui: false,
    ehpadNon: false,
    ehpadLesquels: '',
    // Intervenants
    ideLiberale: '',
    ssiad: '',
    kinesitherapeute: '',
    aidedomicile: '',
    ambulancier: '',
    portageRepas: '',
    teleAlarme: '',
    autreIntervenant: '',
    // Hospitalisation
    motif: '',
    isolementOui: false,
    isolementNon: false,
    // Alimentation
    alimentNormale: false,
    alimentMixee: false,
    alimentAjeun: false,
    regimeLequel: '',
    fausseRoute: false,
    alimentParenterale: false,
    eauGelifiee: false,
    complementAlimentaire: false,
    aideAlim: { autonome: false, partielle: false, totale: false },
    protheseDentaireOui: false,
    protheseDentaireNon: false,
    // Elimination
    urinesContinent: false,
    urinesIncontinent: false,
    sellesContinent: false,
    sellesIncontinent: false,
    quelleProtection: '',
    dateDerniereSelle: '',
    urinal: false,
    bassin: false,
    penilex: false,
    chaisePerce: false,
    sadOui: false,
    sadDate: '',
    // Hygiène
    hygieneAutonome: false,
    hygienePartielle: false,
    hygieneTotale: false,
    hygieneCommentaire: '',
    habillageAutonome: false,
    habillagePartielle: false,
    habillageTotale: false,
    sommeilNormal: false,
    sommeilPerturbe: false,
    sommeilTraitement: '',
    // Respiration
    respirationNormale: false,
    dyspnee: false,
    o2Oui: false,
    o2Non: false,
    o2Debit: '',
    o2Jour: false,
    o2Nuit: false,
    vniOui: false,
    vniNon: false,
    vniDebit: '',
    tracheotomie: false,
    coherentOui: false,
    coherentNon: false,
    communiqueOui: false,
    communiqueNon: false,
    // Locomotion
    locoAutonome: false,
    locoPartielle: false,
    locoBrancardier: false,
    deambulateur: false,
    canne: false,
    fauteuilRoulant: false,
    locoAutreDetail: '',
    leveMalade: false,
    verticalisateur: false,
    // Autres
    lunettes: false,
    appareilAuditif: false,
    // État cutané
    matelasAirOui: false,
    matelasAirNon: false,
    matelasAirLequel: '',
    matelasAntiEscarreOui: false,
    matelasAntiEscarreNon: false,
    matelasAntiEscarreLequel: '',
    escarreOui: false,
    escarreNon: false,
    escarreLocalisation: '',
    escarreStade: '',
    pansementProtOui: false,
    pansementProtNon: false,
    pansementProtLocalisation: '',
    mycoseOui: false,
    mycoseNon: false,
    mycoseLocalisation: '',
    etatCutaneAutre: '',
    // Pansement (tableau)
    plaies: [
      { type: '', localisation: '', protocole: '' },
      { type: '', localisation: '', protocole: '' },
      { type: '', localisation: '', protocole: '' },
    ] as Array<{ type: string; localisation: string; protocole: string }>,
    ablationFils: '',
    ablationAgrafes: '',
    drainageOui: false,
    drainageNon: false,
    drainageLequel: '',
    // Traitement
    traitementJour: '',
    perfusion: '',
    ktPoseLe: '',
    examensPrevus: '',
    // Vécu hospitalisation
    vecuHospitalisation: '',
  });

  const patch = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(s => ({ ...s, [k]: v }));

  const { data: residents = [], isLoading: loadingResidents } = useQuery({
    queryKey: ['mutation-residents'],
    queryFn: fetchResidents,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return residents;
    return residents.filter(r => `${r.last_name} ${r.first_name} ${r.room}`.toLowerCase().includes(q));
  }, [residents, search]);

  const selected = useMemo(() => residents.find(r => r.id === selectedId) ?? null, [residents, selectedId]);

  const { data: ctx } = useQuery({
    queryKey: ['mutation-context', selectedId],
    queryFn: () => fetchMutationContext(selected!),
    enabled: !!selected,
  });

  // ── Données calculées auto-remplies ──
  const regimeAutoText = useMemo(() => {
    if (!selected) return '';
    const flags: string[] = [];
    if (selected.regime_mixe) flags.push('Mixé');
    if (selected.viande_mixee) flags.push('Viande mixée');
    if (selected.regime_diabetique) flags.push('Diabétique');
    if (selected.epargne_intestinale) flags.push('Épargne intestinale');
    return flags.join(', ');
  }, [selected]);

  const personnePrevenir = useMemo(() => {
    const pp = selected?.dsi?.personne_prevenir;
    if (!pp) return '';
    const parts: string[] = [];
    if (pp.prenom || pp.nom) parts.push([pp.prenom, pp.nom].filter(Boolean).join(' '));
    if (pp.lien) parts.push(`(${pp.lien})`);
    return parts.join(' ');
  }, [selected]);

  const telPrevenir = useMemo(() => {
    const pp = selected?.dsi?.personne_prevenir;
    if (!pp) return '';
    return pp.tel || pp.mobile || '';
  }, [selected]);


  const matelasAirText = useMemo(() => {
    if (!ctx?.matCouss?.length) return '';
    return ctx.matCouss.filter(m => m.kind === 'matelas' && m.type_name?.toLowerCase().includes('air')).map(m => m.type_name ?? '').join(', ');
  }, [ctx]);

  const contentionText = useMemo(() => {
    if (!ctx?.contentions?.length) return '';
    return ctx.contentions.map(c => {
      const fin = c.pas_de_fin ? 'sans fin' : c.date_fin ? `→ ${formatDate(c.date_fin)}` : '';
      return `${c.traitement}${c.date_debut ? ` (depuis ${formatDate(c.date_debut)}${fin ? ' ' + fin : ''})` : ''}`;
    }).join(' · ');
  }, [ctx]);

  const vaccinsText = useMemo(() => {
    if (!ctx) return '';
    const lines: string[] = [];
    const refus: string[] = [];
    if (ctx.vaccination) {
      const annee = ctx.vaccination.year;
      const { covid: covidChoice, grippe: grippeChoice } = parseVaccInfos(ctx.vaccination.infos);
      const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
      if (covidChoice && /refus/i.test(covidChoice)) {
        refus.push(`COVID (${/famille/i.test(covidChoice) ? 'refus famille' : 'refus résident'})`);
      } else {
        const dates = [ctx.vaccination.covid_inj1, ctx.vaccination.covid_inj2, ctx.vaccination.covid_inj3].filter(isDate).sort().reverse();
        if (dates.length) lines.push(`COVID ${annee} : dernière inj. ${formatDate(dates[0])}`);
        else if (covidChoice) lines.push(`COVID ${annee} : ${covidChoice}`);
      }
      if (grippeChoice && /refus/i.test(grippeChoice)) {
        refus.push(`Grippe (${/famille/i.test(grippeChoice) ? 'refus famille' : 'refus résident'})`);
      } else if (isDate(ctx.vaccination.grippe_inj1)) {
        lines.push(`Grippe ${annee} : ${formatDate(ctx.vaccination.grippe_inj1)}`);
      } else if (grippeChoice) {
        lines.push(`Grippe ${annee} : ${grippeChoice}`);
      }
    }
    if (ctx.vaccinationLT) {
      if (ctx.vaccinationLT.tetanos_date) lines.push(`Tétanos : ${formatDate(ctx.vaccinationLT.tetanos_date)}`);
      if (ctx.vaccinationLT.pneumovax_date) lines.push(`Pneumovax : ${formatDate(ctx.vaccinationLT.pneumovax_date)}`);
    }
    if (refus.length) lines.push(`Refus : ${refus.join(', ')}`);
    return lines.join(' · ');
  }, [ctx]);

  const dentierLabel = useMemo(() => {
    const dent = asArr(ctx?.pec?.details?.dentier);
    if (dent.includes('haut') && dent.includes('bas')) return 'Haut/Bas';
    if (dent.includes('haut')) return 'Haut';
    if (dent.includes('bas')) return 'Bas';
    return '';
  }, [ctx?.pec?.details?.dentier]);

  const protectionText = useMemo(() => {
    const d = ctx?.pec?.details;
    const j = d?.protectionJour ?? '';
    const n = d?.protectionNuit ?? '';
    if (j && n) return `J : ${j} · N : ${n}`;
    if (j) return `J : ${j}`;
    if (n) return `N : ${n}`;
    return ctx?.pec?.protection || '';
  }, [ctx?.pec]);

  // Reset + auto-remplit depuis PEC quand résident change
  useEffect(() => {
    const d = ctx?.pec?.details;
    const uri = asArr(d?.urinaire);
    const fec = asArr(d?.fecale);
    const matElim = asArr(d?.elimMateriel);
    const hyg = asArr(d?.hygiene);
    const hab = asArr(d?.habillage);
    const loc = asArr(d?.locomotion);
    const locoMat = asArr(d?.locoMateriel);
    const aud = asArr(d?.appareilAuditif);
    const lun = asArr(d?.lunettes);
    const dent = asArr(d?.dentier);
    const aideA = asArr(d?.aideAlim);
    const hyd = asArr(d?.hydratation);
    const fausseRouteArr = asArr(d?.fausseRoute);

    const sf = selected?.situation_familiale ?? '';
    const tc = selected?.dsi?.tutelle_curatelle;
    const resp = selected?.dsi?.respiration;
    const comp = selected?.dsi?.comportement;
    setForm(s => ({
      ...s,
      // Situation familiale
      sitFamiliale: {
        celibataire: sf === 'celibataire' || sf === 'divorce',
        marie: sf === 'marie',
        veuf: sf === 'veuf',
      },
      // Tutelle / Curatelle depuis DSI
      tutelle: tc?.type === 'tutelle',
      curatelle: tc?.type === 'curatelle',
      suiviSocialOui: !!(tc?.type),
      suiviSocialNom: tc?.nom ?? '',
      suiviSocialTel: tc?.tel ?? '',
      // Respiration depuis DSI
      respirationNormale: !!(resp?.normale),
      dyspnee: !!(resp?.dyspnee),
      o2Oui: resp?.o2 === true,
      o2Non: resp?.o2 === false,
      o2Debit: resp?.o2Debit ?? '',
      o2Jour: !!(resp?.o2Jour),
      o2Nuit: !!(resp?.o2Nuit),
      vniOui: resp?.vni === true,
      vniNon: resp?.vni === false,
      vniDebit: resp?.vniDebit ?? '',
      // Comportement depuis DSI
      coherentOui: comp?.coherent === true,
      coherentNon: comp?.coherent === false,
      communiqueOui: comp?.communique === true,
      communiqueNon: comp?.communique === false,
      // Alimentation
      alimentNormale: !selected?.regime_mixe && !selected?.viande_mixee,
      alimentMixee: !!(selected?.regime_mixe || selected?.viande_mixee),
      fausseRoute: fausseRouteArr.includes('oui'),
      eauGelifiee: hyd.includes('gelifiee'),
      aideAlim: {
        autonome: aideA.includes('autonome'),
        partielle: false,
        totale: aideA.includes('aide'),
      },
      protheseDentaireOui: dent.includes('haut') || dent.includes('bas'),
      protheseDentaireNon: dent.length === 0,
      // Élimination
      urinesContinent: uri.includes('continent'),
      urinesIncontinent: uri.includes('incontinent'),
      sellesContinent: fec.includes('continent'),
      sellesIncontinent: fec.includes('incontinent'),
      urinal: matElim.includes('urinal'),
      bassin: matElim.includes('bassin'),
      chaisePerce: matElim.includes('chaise-percee'),
      // Hygiène
      hygieneAutonome: hyg.includes('autonome'),
      hygienePartielle: hyg.includes('partielle'),
      hygieneTotale: hyg.includes('totale'),
      habillageAutonome: hab.includes('autonome'),
      habillagePartielle: hab.includes('partielle'),
      habillageTotale: hab.includes('totale'),
      // Locomotion
      locoAutonome: loc.includes('autonome'),
      locoPartielle: loc.includes('partielle'),
      locoBrancardier: loc.includes('totale'),
      deambulateur: locoMat.includes('deambulateur'),
      canne: locoMat.includes('canne'),
      fauteuilRoulant: locoMat.includes('fauteuil-roulant'),
      verticalisateur: locoMat.includes('verticalisateur'),
      leveMalade: locoMat.includes('leve-malade'),
      // Autres
      appareilAuditif: aud.includes('oui'),
      lunettes: lun.includes('oui'),
      // Matelas
      matelasAirOui: matelasAirText.length > 0,
      matelasAirNon: matelasAirText.length === 0,
      matelasAirLequel: matelasAirText,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.pec, selected, matelasAirText]);

  const fem = isFemaleTitle(selected?.title);

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Barre supérieure (cachée à l'impression) */}
      <div className="bg-blue-900 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10 print:hidden">
        <Link href="/" className="text-white/70 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-bold flex-1">Fiche de Liaison des Soins Infirmiers</h1>
        {selected && (
          <Button onClick={() => window.print()} size="sm" className="bg-white text-blue-900 hover:bg-slate-100">
            <Printer className="h-4 w-4 mr-1.5" /> Imprimer
          </Button>
        )}
      </div>

      <div className="max-w-4xl mx-auto p-4 sm:p-6 print:p-0 print:max-w-none">

        {/* ── Sélecteur résident ── */}
        {!selected && (
          <div className="bg-white border border-slate-200 rounded-lg p-4 print:hidden">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un résident (nom, prénom, chambre)…"
                className="pl-9"
              />
            </div>
            {loadingResidents ? (
              <p className="text-sm text-slate-500">Chargement…</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
                {filtered.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-3 transition-colors"
                  >
                    {r.photo_url
                      ? <img src={r.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                      : <div className="h-10 w-10 rounded-full bg-slate-200" />}
                    <div className="flex-1">
                      <div className="text-sm font-medium">{r.title} <span className="uppercase">{r.last_name}</span> {r.first_name}</div>
                      <div className="text-xs text-slate-500">Chambre {r.room} · {r.floor}</div>
                    </div>
                  </button>
                ))}
                {filtered.length === 0 && <p className="text-sm text-slate-500 px-3 py-2">Aucun résident.</p>}
              </div>
            )}
          </div>
        )}

        {selected && (
          <>
            <div className="mb-3 print:hidden">
              <button onClick={() => setSelectedId(null)} className="text-sm text-blue-700 hover:underline">
                ← Changer de résident
              </button>
            </div>

            {/* ══════════════════════════════════════════════════════
                DOCUMENT OFFICIEL
            ══════════════════════════════════════════════════════ */}
            <div className="bg-white border-2 border-black font-sans text-[10px] print:border-0 print:shadow-none shadow-lg">

              {/* ── En-tête ── */}
              <div className="border-b-2 border-black px-3 pt-2 pb-1">
                <div className="flex justify-between items-start">
                  <h1 className="text-[13px] font-bold uppercase tracking-wide text-center flex-1">
                    Fiche de Liaison des Soins Infirmiers
                  </h1>
                  <span className="text-[9px] font-bold ml-2 mt-1 whitespace-nowrap">CHPLM-ENR-00499</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 mt-1">
                  <div className="flex gap-1 items-baseline">
                    <span className="font-semibold whitespace-nowrap">Nom du service :</span>
                    <ZoneSaisie value={form.nomService} onChange={v => patch('nomService', v)} className="flex-1" />
                  </div>
                  <div className="flex gap-1 items-baseline">
                    <span className="font-semibold whitespace-nowrap">N° tél :</span>
                    <ZoneSaisie value={form.telService} onChange={v => patch('telService', v)} className="flex-1" />
                  </div>
                  <div className="flex gap-1 items-baseline mt-1">
                    <span className="font-semibold whitespace-nowrap">Fiche élaborée par :</span>
                    <ZoneSaisie value={form.elaborePar} onChange={v => patch('elaborePar', v)} className="flex-1" />
                  </div>
                  <div className="flex gap-1 items-baseline mt-1">
                    <span className="font-semibold whitespace-nowrap">Fait le :</span>
                    <span className="border-b border-black flex-1 font-medium">{todayFR()}</span>
                  </div>
                </div>
              </div>

              {/* ── IDENTIFICATION ── */}
              <Titre>Identification de la personne soignée</Titre>
              <div className="px-3 py-2 border-b-2 border-black space-y-1">
                <div className="grid grid-cols-2 gap-x-4">
                  <Ligne label="Nom :">
                    <span className="font-bold uppercase">{selected.last_name}</span>
                  </Ligne>
                  <Ligne label="Prénom :">
                    <span className="font-medium">{selected.first_name}</span>
                  </Ligne>
                </div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-x-4">
                  <Ligne label="Nom de jeune fille :">
                    {selected.maiden_name ? <span className="uppercase">{selected.maiden_name}</span> : ''}
                  </Ligne>
                  <Ligne label="Né(e) le :">
                    <span className="font-medium">{formatDate(selected.date_naissance)}</span>
                  </Ligne>
                  <Ligne label="Âge :">
                    <span className="font-medium">{calcAge(selected.date_naissance)}</span>
                  </Ligne>
                </div>
                <Ligne label="Adresse :">
                  <ZoneSaisie value={form.adresse} onChange={v => patch('adresse', v)} />
                </Ligne>
                <div className="grid grid-cols-2 gap-x-4">
                  <Ligne label="Personne à prévenir :">
                    {personnePrevenir
                      ? <span className="font-medium">{personnePrevenir}</span>
                      : <ZoneSaisie value={form.personneAPrevenirManuel} onChange={v => patch('personneAPrevenirManuel', v)} />}
                  </Ligne>
                  <Ligne label="N° tél :">
                    {telPrevenir
                      ? <span className="font-medium">{telPrevenir}</span>
                      : <ZoneSaisie value={form.telPrevenir} onChange={v => patch('telPrevenir', v)} />}
                  </Ligne>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold">Personne prévenue :</span>
                  <Case checked={form.personnePrevenue} onChange={v => patch('personnePrevenue', v)} label="Oui" />
                  <Case checked={!form.personnePrevenue} onChange={v => patch('personnePrevenue', !v)} label="Non" />
                </div>
                <div className="grid grid-cols-2 gap-x-4">
                  <Ligne label="Poids :">
                    {ctx?.lastWeight
                      ? <span className="font-medium">{ctx.lastWeight.poids_kg} kg (le {formatDate(ctx.lastWeight.date)})</span>
                      : <ZoneSaisie value="" onChange={() => {}} placeholder="…" />}
                  </Ligne>
                  <Ligne label="Taille :">
                    <ZoneSaisie value={form.taille} onChange={v => patch('taille', v)} placeholder="…" />
                  </Ligne>
                </div>
              </div>

              {/* ── ENVIRONNEMENT FAMILIAL ET SOCIAL ── */}
              <Titre>Environnement familial et social</Titre>
              <div className="px-3 py-2 border-b-2 border-black space-y-1">
                <div className="flex gap-6 flex-wrap">
                  <Case checked={form.sitFamiliale.celibataire} onChange={v => patch('sitFamiliale', { ...form.sitFamiliale, celibataire: v, marie: false, veuf: false })} label="Célibataire" />
                  <Case checked={form.sitFamiliale.marie} onChange={v => patch('sitFamiliale', { ...form.sitFamiliale, marie: v, celibataire: false, veuf: false })} label={fem ? 'Mariée' : 'Marié(e)'} />
                  <Case checked={form.sitFamiliale.veuf} onChange={v => patch('sitFamiliale', { ...form.sitFamiliale, veuf: v, celibataire: false, marie: false })} label={fem ? 'Veuve' : 'Veuf(ve)'} />
                </div>
                <div className="flex gap-4 flex-wrap items-center">
                  <Case checked={form.vit.famille} onChange={v => patch('vit', { ...form.vit, famille: v })} label="Vit en famille" />
                  <Case checked={form.vit.seul} onChange={v => patch('vit', { ...form.vit, seul: v })} label={fem ? 'Vit seule' : 'Vit seul(e)'} />
                  <Case checked={form.vit.etablissement} onChange={v => patch('vit', { ...form.vit, etablissement: v })} label="En établissement" />
                  <span className="font-semibold">Autre :</span>
                  <ZoneSaisie value={form.vit.autre} onChange={v => patch('vit', { ...form.vit, autre: v })} className="w-40" />
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="font-semibold">Suivi social :</span>
                  <Case checked={form.suiviSocialOui} onChange={v => patch('suiviSocialOui', v)} label="Oui" />
                  <Case checked={!form.suiviSocialOui} onChange={v => patch('suiviSocialOui', !v)} label="Non" />
                  <span className="font-semibold ml-2">Nom :</span>
                  <ZoneSaisie value={form.suiviSocialNom} onChange={v => patch('suiviSocialNom', v)} className="flex-1" />
                </div>
                <div className="flex gap-6 flex-wrap items-center">
                  <Case checked={form.tutelle} onChange={v => patch('tutelle', v)} label="Tutelle" />
                  <Case checked={form.curatelle} onChange={v => patch('curatelle', v)} label="Curatelle" />
                  {(form.tutelle || form.curatelle) && (
                    <>
                      <span className="font-semibold">Tél :</span>
                      <ZoneSaisie value={form.suiviSocialTel} onChange={v => patch('suiviSocialTel', v)} className="w-32" />
                    </>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  <span className="font-semibold">Devenir :</span>
                </div>
                <div className="flex gap-2 items-center flex-wrap pl-3">
                  <span className="font-semibold">Retour à domicile :</span>
                  <Case checked={form.retourDomicileOui} onChange={v => { patch('retourDomicileOui', v); if (v) patch('retourDomicileNon', false); }} label="Oui" />
                  <Case checked={form.retourDomicileNon} onChange={v => { patch('retourDomicileNon', v); if (v) patch('retourDomicileOui', false); }} label="Non" />
                </div>
                <div className="flex gap-2 items-center flex-wrap pl-3">
                  <span className="font-semibold">Inscription SSR :</span>
                  <Case checked={form.ssrOui} onChange={v => { patch('ssrOui', v); if (v) patch('ssrNon', false); }} label="Oui" />
                  <Case checked={form.ssrNon} onChange={v => { patch('ssrNon', v); if (v) patch('ssrOui', false); }} label="Non" />
                  <span className="font-semibold ml-2">lesquels :</span>
                  <ZoneSaisie value={form.ssrLesquels} onChange={v => patch('ssrLesquels', v)} className="flex-1" />
                </div>
                <div className="flex gap-2 items-center flex-wrap pl-3">
                  <span className="font-semibold">Inscription EHPAD :</span>
                  <Case checked={form.ehpadOui} onChange={v => { patch('ehpadOui', v); if (v) patch('ehpadNon', false); }} label="Oui" />
                  <Case checked={form.ehpadNon} onChange={v => { patch('ehpadNon', v); if (v) patch('ehpadOui', false); }} label="Non" />
                  <span className="font-semibold ml-2">lesquels :</span>
                  <ZoneSaisie value={form.ehpadLesquels} onChange={v => patch('ehpadLesquels', v)} className="flex-1" />
                </div>
              </div>

              {/* ── INTERVENANTS ── */}
              <Titre>Intervenants</Titre>
              <div className="px-3 py-2 border-b-2 border-black space-y-1">
                <div className="grid grid-cols-2 gap-x-4">
                  <Ligne label="Médecin traitant :">
                    <span className="font-medium">{selected.medecin || ''}</span>
                  </Ligne>
                  <Ligne label="IDE Libéral(e) :">
                    <ZoneSaisie value={form.ideLiberale} onChange={v => patch('ideLiberale', v)} />
                  </Ligne>
                  <Ligne label="SSIAD :">
                    <ZoneSaisie value={form.ssiad} onChange={v => patch('ssiad', v)} />
                  </Ligne>
                  <Ligne label="Kinésithérapeute :">
                    <ZoneSaisie value={form.kinesitherapeute} onChange={v => patch('kinesitherapeute', v)} />
                  </Ligne>
                  <Ligne label="Aide à domicile :">
                    <ZoneSaisie value={form.aidedomicile} onChange={v => patch('aidedomicile', v)} />
                  </Ligne>
                  <Ligne label="Ambulancier :">
                    <ZoneSaisie value={form.ambulancier} onChange={v => patch('ambulancier', v)} />
                  </Ligne>
                </div>
                <div className="flex gap-2 items-baseline flex-wrap">
                  <span className="font-semibold whitespace-nowrap">Portage de repas :</span>
                  <ZoneSaisie value={form.portageRepas} onChange={v => patch('portageRepas', v)} className="w-28" />
                  <span className="font-semibold whitespace-nowrap ml-3">Télé-alarme :</span>
                  <ZoneSaisie value={form.teleAlarme} onChange={v => patch('teleAlarme', v)} className="w-28" />
                  <span className="font-semibold whitespace-nowrap ml-3">Autre :</span>
                  <ZoneSaisie value={form.autreIntervenant} onChange={v => patch('autreIntervenant', v)} className="flex-1" />
                </div>
              </div>

              {/* ── Motif / Antécédents / Allergies ── */}
              <div className="px-3 py-2 border-b-2 border-black space-y-1">
                <div className="flex gap-1 items-start">
                  <span className="font-semibold whitespace-nowrap shrink-0">Motif d&apos;hospitalisation, résumé :</span>
                  <div className="flex-1">
                    <ZoneSaisie value={form.motif} onChange={v => patch('motif', v)} multiline rows={2} />
                  </div>
                </div>
                <div className="flex gap-1 items-start">
                  <span className="font-semibold whitespace-nowrap shrink-0">Antécédents :</span>
                  <div className="flex-1 text-[10px] border-b border-black leading-tight whitespace-pre-wrap">
                    {selected.antecedents || <span className="text-slate-400">—</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 mt-1">
                  <Ligne label="Allergies :">
                    <span>{selected.allergie_medicamenteuse || ''}</span>
                  </Ligne>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">Isolement :</span>
                    <Case checked={form.isolementOui} onChange={v => { patch('isolementOui', v); if (v) patch('isolementNon', false); }} label="Oui" />
                    <Case checked={form.isolementNon} onChange={v => { patch('isolementNon', v); if (v) patch('isolementOui', false); }} label="Non" />
                  </div>
                </div>
                {vaccinsText && (
                  <Ligne label="Vaccins :"><span className="text-[9px]">{vaccinsText}</span></Ligne>
                )}
                <div className="grid grid-cols-2 gap-x-4">
                  <Ligne label="Niveau de soins :">
                    {ctx?.niveau?.niveau_soin
                      ? <span className="font-medium">{ctx.niveau.niveau_soin}</span>
                      : <ZoneSaisie value="" onChange={() => {}} placeholder="…" />}
                  </Ligne>
                  <Ligne label="GIR :">
                    {ctx?.niveau?.gir
                      ? <span className="font-medium">{ctx.niveau.gir}</span>
                      : <ZoneSaisie value="" onChange={() => {}} placeholder="…" />}
                  </Ligne>
                </div>
                {contentionText && (
                  <Ligne label="Contention :"><span>{contentionText}</span></Ligne>
                )}
              </div>

              {/* ── SOINS DE BASE : 2 colonnes ── */}
              <Titre>Soins de base</Titre>
              <div className="grid grid-cols-2 border-b-2 border-black" style={{ borderTop: 'none' }}>
                {/* Gauche : Alimentation */}
                <div className="border-r border-black">
                  <SousTitre>Alimentation et hydratation</SousTitre>
                  <div className="px-2 py-1 space-y-0.5">
                    <div className="flex gap-3 flex-wrap">
                      <Case checked={form.alimentNormale} onChange={v => patch('alimentNormale', v)} label="Normale" />
                      <Case checked={form.alimentMixee} onChange={v => patch('alimentMixee', v)} label="Mixée" />
                      <Case checked={form.alimentAjeun} onChange={v => patch('alimentAjeun', v)} label="À jeun" />
                    </div>
                    <div className="flex gap-1 items-baseline">
                      <span className="font-semibold shrink-0">Régime - Lequel :</span>
                      <ZoneSaisie value={form.regimeLequel || regimeAutoText} onChange={v => patch('regimeLequel', v)} className="flex-1" />
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      <Case checked={form.fausseRoute} onChange={v => patch('fausseRoute', v)} label="Fausse route" />
                      <Case checked={form.alimentParenterale} onChange={v => patch('alimentParenterale', v)} label="Alim. parentérale" />
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      <Case checked={form.eauGelifiee} onChange={v => patch('eauGelifiee', v)} label="Eau gélifiée" />
                      <Case checked={form.complementAlimentaire} onChange={v => patch('complementAlimentaire', v)} label="Complément alim." />
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      <Case checked={form.aideAlim.autonome} onChange={v => patch('aideAlim', { autonome: v, partielle: false, totale: false })} label="Autonome" />
                      <Case checked={form.aideAlim.partielle} onChange={v => patch('aideAlim', { autonome: false, partielle: v, totale: false })} label="Aide partielle" />
                      <Case checked={form.aideAlim.totale} onChange={v => patch('aideAlim', { autonome: false, partielle: false, totale: v })} label="Aide totale" />
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                      <span className="font-semibold">Prothèse dentaire :</span>
                      <Case checked={form.protheseDentaireOui} onChange={v => { patch('protheseDentaireOui', v); if (v) patch('protheseDentaireNon', false); }} label="Oui" />
                      {form.protheseDentaireOui && dentierLabel && (
                        <span className="text-[10px]">({dentierLabel})</span>
                      )}
                      <Case checked={form.protheseDentaireNon} onChange={v => { patch('protheseDentaireNon', v); if (v) patch('protheseDentaireOui', false); }} label="Non" />
                    </div>
                  </div>
                </div>
                {/* Droite : Elimination */}
                <div>
                  <SousTitre>Elimination</SousTitre>
                  <div className="px-2 py-1 space-y-0.5">
                    <div className="flex gap-2 items-center flex-wrap">
                      <span className="font-semibold">Urines :</span>
                      <Case checked={form.urinesContinent} onChange={v => { patch('urinesContinent', v); if (v) patch('urinesIncontinent', false); }} label="Continent" />
                      <Case checked={form.urinesIncontinent} onChange={v => { patch('urinesIncontinent', v); if (v) patch('urinesContinent', false); }} label="Incontinent" />
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                      <span className="font-semibold">Selles :</span>
                      <Case checked={form.sellesContinent} onChange={v => { patch('sellesContinent', v); if (v) patch('sellesIncontinent', false); }} label="Continent" />
                      <Case checked={form.sellesIncontinent} onChange={v => { patch('sellesIncontinent', v); if (v) patch('sellesContinent', false); }} label="Incontinent" />
                    </div>
                    <Ligne label="Quelle protection :">
                      <ZoneSaisie value={form.quelleProtection || protectionText} onChange={v => patch('quelleProtection', v)} />
                    </Ligne>
                    <Ligne label="Date dernières selles :">
                      <ZoneSaisie value={form.dateDerniereSelle} onChange={v => patch('dateDerniereSelle', v)} />
                    </Ligne>
                    <div className="flex gap-3 flex-wrap">
                      <Case checked={form.urinal} onChange={v => patch('urinal', v)} label="Urinal" />
                      <Case checked={form.bassin} onChange={v => patch('bassin', v)} label="Bassin" />
                      <Case checked={form.penilex} onChange={v => patch('penilex', v)} label="Pénilex" />
                    </div>
                    <div className="flex gap-3 flex-wrap items-center">
                      <Case checked={form.chaisePerce} onChange={v => patch('chaisePerce', v)} label="Chaise percée" />
                      <span className="font-semibold">SAD posé le</span>
                      <ZoneSaisie value={form.sadDate} onChange={v => patch('sadDate', v)} className="w-24" />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── HYGIENE / RESPIRATION : 2 colonnes ── */}
              <div className="grid grid-cols-2 border-b-2 border-black">
                {/* Gauche : Hygiène et confort */}
                <div className="border-r border-black">
                  <SousTitre>Hygiène et confort</SousTitre>
                  <div className="px-2 py-1 space-y-0.5">
                    <div>
                      <span className="font-bold">Hygiène :</span>
                      <div className="flex gap-3 flex-wrap pl-2">
                        <Case checked={form.hygieneAutonome} onChange={v => { patch('hygieneAutonome', v); if (v) { patch('hygienePartielle', false); patch('hygieneTotale', false); } }} label="Autonome" />
                        <Case checked={form.hygienePartielle} onChange={v => { patch('hygienePartielle', v); if (v) { patch('hygieneAutonome', false); patch('hygieneTotale', false); } }} label="Aide partielle" />
                        <Case checked={form.hygieneTotale} onChange={v => { patch('hygieneTotale', v); if (v) { patch('hygieneAutonome', false); patch('hygienePartielle', false); } }} label="Aide totale" />
                      </div>
                      <Ligne label="Commentaire :">
                        <ZoneSaisie value={form.hygieneCommentaire} onChange={v => patch('hygieneCommentaire', v)} />
                      </Ligne>
                    </div>
                    <div>
                      <span className="font-bold">Habillage :</span>
                      <div className="flex gap-3 flex-wrap pl-2">
                        <Case checked={form.habillageAutonome} onChange={v => { patch('habillageAutonome', v); if (v) { patch('habillagePartielle', false); patch('habillageTotale', false); } }} label="Autonome" />
                        <Case checked={form.habillagePartielle} onChange={v => { patch('habillagePartielle', v); if (v) { patch('habillageAutonome', false); patch('habillageTotale', false); } }} label="Aide partielle" />
                        <Case checked={form.habillageTotale} onChange={v => { patch('habillageTotale', v); if (v) { patch('habillageAutonome', false); patch('habillagePartielle', false); } }} label="Aide totale" />
                      </div>
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                      <span className="font-bold">Sommeil :</span>
                      <Case checked={form.sommeilNormal} onChange={v => { patch('sommeilNormal', v); if (v) patch('sommeilPerturbe', false); }} label="Normal" />
                      <Case checked={form.sommeilPerturbe} onChange={v => { patch('sommeilPerturbe', v); if (v) patch('sommeilNormal', false); }} label="Perturbé" />
                    </div>
                    <Ligne label="Traitement :">
                      <ZoneSaisie value={form.sommeilTraitement} onChange={v => patch('sommeilTraitement', v)} />
                    </Ligne>
                  </div>
                </div>
                {/* Droite : Respiration + Comportement */}
                <div>
                  <SousTitre>Respiration</SousTitre>
                  <div className="px-2 py-1 space-y-0.5">
                    <div className="flex gap-4 flex-wrap">
                      <Case checked={form.respirationNormale} onChange={v => { patch('respirationNormale', v); if (v) patch('dyspnee', false); }} label="Normale" />
                      <Case checked={form.dyspnee} onChange={v => { patch('dyspnee', v); if (v) patch('respirationNormale', false); }} label="Dyspnée" />
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                      <span className="font-semibold">O2 :</span>
                      <Case checked={form.o2Oui} onChange={v => { patch('o2Oui', v); if (v) patch('o2Non', false); }} label="Oui" />
                      <Case checked={form.o2Non} onChange={v => { patch('o2Non', v); if (v) patch('o2Oui', false); }} label="Non" />
                      <span className="font-semibold">Débit :</span>
                      <ZoneSaisie value={form.o2Debit} onChange={v => patch('o2Debit', v)} className="w-16" />
                      {form.o2Oui && (
                        <span className="text-[10px]">
                          ({form.o2Jour && form.o2Nuit ? '24H' : form.o2Jour ? 'Jour' : form.o2Nuit ? 'Nuit' : ''})
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                      <span className="font-semibold">VNI :</span>
                      <Case checked={form.vniOui} onChange={v => { patch('vniOui', v); if (v) patch('vniNon', false); }} label="Oui" />
                      <Case checked={form.vniNon} onChange={v => { patch('vniNon', v); if (v) patch('vniOui', false); }} label="Non" />
                      {form.vniOui && (
                        <ZoneSaisie value={form.vniDebit} onChange={v => patch('vniDebit', v)} placeholder="réglages…" className="w-28" />
                      )}
                      <Case checked={form.tracheotomie} onChange={v => patch('tracheotomie', v)} label="Trachéotomie" />
                    </div>
                    <div className="border-t border-black mt-1 pt-1">
                      <span className="font-bold">Comportement :</span>
                      <div className="flex gap-2 items-center flex-wrap mt-0.5">
                        <span className="font-semibold">Cohérent :</span>
                        <Case checked={form.coherentOui} onChange={v => { patch('coherentOui', v); if (v) patch('coherentNon', false); }} label="Oui" />
                        <Case checked={form.coherentNon} onChange={v => { patch('coherentNon', v); if (v) patch('coherentOui', false); }} label="Non" />
                      </div>
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className="font-semibold">Communique :</span>
                        <Case checked={form.communiqueOui} onChange={v => { patch('communiqueOui', v); if (v) patch('communiqueNon', false); }} label="Oui" />
                        <Case checked={form.communiqueNon} onChange={v => { patch('communiqueNon', v); if (v) patch('communiqueOui', false); }} label="Non" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── LOCOMOTION / AUTRES : 2 colonnes ── */}
              <div className="grid grid-cols-2 border-b-2 border-black">
                {/* Gauche : Locomotion */}
                <div className="border-r border-black">
                  <SousTitre>Locomotion – Mobilisation</SousTitre>
                  <div className="px-2 py-1 space-y-0.5">
                    <Case checked={form.locoAutonome} onChange={v => { patch('locoAutonome', v); if (v) { patch('locoPartielle', false); patch('locoBrancardier', false); } }} label="Autonome" />
                    <div>
                      <div className="flex gap-1 items-center flex-wrap">
                        <Case checked={form.locoPartielle} onChange={v => { patch('locoPartielle', v); if (v) { patch('locoAutonome', false); patch('locoBrancardier', false); } }} label="Aide partielle :" />
                        <Case checked={form.deambulateur} onChange={v => patch('deambulateur', v)} label="Déambulateur" />
                        <Case checked={form.canne} onChange={v => patch('canne', v)} label="Canne" />
                      </div>
                      <div className="flex gap-2 items-center flex-wrap pl-4">
                        <Case checked={form.fauteuilRoulant} onChange={v => patch('fauteuilRoulant', v)} label="Fauteuil roulant" />
                        <span className="font-semibold">Autre :</span>
                        <ZoneSaisie value={form.locoAutreDetail} onChange={v => patch('locoAutreDetail', v)} className="w-24" />
                      </div>
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                      <Case checked={form.locoBrancardier} onChange={v => { patch('locoBrancardier', v); if (v) { patch('locoAutonome', false); patch('locoPartielle', false); } }} label="Aide totale :" />
                      <Case checked={form.leveMalade} onChange={v => patch('leveMalade', v)} label="Lève malade" />
                      <Case checked={form.verticalisateur} onChange={v => patch('verticalisateur', v)} label="Verticalisateur" />
                    </div>
                  </div>
                </div>
                {/* Droite : Autres */}
                <div>
                  <SousTitre>Autres</SousTitre>
                  <div className="px-2 py-1 space-y-1">
                    <Case checked={form.lunettes} onChange={v => patch('lunettes', v)} label="Lunettes" />
                    <Case checked={form.appareilAuditif} onChange={v => patch('appareilAuditif', v)} label="Appareils auditifs" />
                  </div>
                </div>
              </div>

              {/* ── ÉTAT CUTANÉ ── */}
              <Titre>État cutané</Titre>
              <div className="px-3 py-2 border-b-2 border-black space-y-1">
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="font-semibold">Matelas à air :</span>
                  <Case checked={form.matelasAirOui} onChange={v => { patch('matelasAirOui', v); if (v) patch('matelasAirNon', false); }} label="Oui" />
                  <Case checked={form.matelasAirNon} onChange={v => { patch('matelasAirNon', v); if (v) patch('matelasAirOui', false); }} label="Non" />
                  <span className="font-semibold ml-2">– Lequel :</span>
                  <ZoneSaisie value={form.matelasAirLequel} onChange={v => patch('matelasAirLequel', v)} className="flex-1" />
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="font-semibold">Matelas anti-escarre :</span>
                  <Case checked={form.matelasAntiEscarreOui} onChange={v => { patch('matelasAntiEscarreOui', v); if (v) patch('matelasAntiEscarreNon', false); }} label="Oui" />
                  <Case checked={form.matelasAntiEscarreNon} onChange={v => { patch('matelasAntiEscarreNon', v); if (v) patch('matelasAntiEscarreOui', false); }} label="Non" />
                  <span className="font-semibold ml-2">– Lequel :</span>
                  <ZoneSaisie value={form.matelasAntiEscarreLequel} onChange={v => patch('matelasAntiEscarreLequel', v)} className="flex-1" />
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="font-semibold">Escarre :</span>
                  <Case checked={form.escarreOui} onChange={v => { patch('escarreOui', v); if (v) patch('escarreNon', false); }} label="Oui" />
                  <Case checked={form.escarreNon} onChange={v => { patch('escarreNon', v); if (v) patch('escarreOui', false); }} label="Non" />
                  <span className="font-semibold ml-2">– Localisation :</span>
                  <ZoneSaisie value={form.escarreLocalisation} onChange={v => patch('escarreLocalisation', v)} className="w-36" />
                  <span className="font-semibold ml-2">Stade</span>
                  <ZoneSaisie value={form.escarreStade} onChange={v => patch('escarreStade', v)} className="w-20" />
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="font-semibold">Pansement protecteur :</span>
                  <Case checked={form.pansementProtOui} onChange={v => { patch('pansementProtOui', v); if (v) patch('pansementProtNon', false); }} label="Oui" />
                  <Case checked={form.pansementProtNon} onChange={v => { patch('pansementProtNon', v); if (v) patch('pansementProtOui', false); }} label="Non" />
                  <span className="font-semibold ml-2">– Localisation :</span>
                  <ZoneSaisie value={form.pansementProtLocalisation} onChange={v => patch('pansementProtLocalisation', v)} className="flex-1" />
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="font-semibold">Mycose :</span>
                  <Case checked={form.mycoseOui} onChange={v => { patch('mycoseOui', v); if (v) patch('mycoseNon', false); }} label="Oui" />
                  <Case checked={form.mycoseNon} onChange={v => { patch('mycoseNon', v); if (v) patch('mycoseOui', false); }} label="Non" />
                  <span className="font-semibold ml-2">– Localisation :</span>
                  <ZoneSaisie value={form.mycoseLocalisation} onChange={v => patch('mycoseLocalisation', v)} className="flex-1" />
                </div>
                <Ligne label="Autre :">
                  <ZoneSaisie value={form.etatCutaneAutre} onChange={v => patch('etatCutaneAutre', v)} />
                </Ligne>
              </div>

              {/* ── PANSEMENT ── */}
              <Titre>Pansement</Titre>
              <div className="border-b-2 border-black">
                <div className="text-[9px] text-center py-1 border-b border-black font-semibold">
                  Type de plaie, localisation + protocole utilisé
                </div>
                <table className="w-full border-collapse text-[10px]">
                  <thead>
                    <tr>
                      {['Plaie 1', 'Plaie 2', 'Plaie 3'].map((p, i) => (
                        <th key={i} className={cn('border-black text-center font-semibold py-0.5 w-1/3', i < 2 && 'border-r')}>
                          {p}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-black">
                      {form.plaies.map((plaie, i) => (
                        <td key={i} className={cn('align-top p-1', i < 2 && 'border-r border-black')}>
                          <div className="space-y-0.5">
                            <ZoneSaisie value={plaie.type} onChange={v => {
                              const updated = [...form.plaies];
                              updated[i] = { ...updated[i], type: v };
                              patch('plaies', updated);
                            }} placeholder="Type…" />
                            <ZoneSaisie value={plaie.localisation} onChange={v => {
                              const updated = [...form.plaies];
                              updated[i] = { ...updated[i], localisation: v };
                              patch('plaies', updated);
                            }} placeholder="Localisation…" />
                            <ZoneSaisie value={plaie.protocole} onChange={v => {
                              const updated = [...form.plaies];
                              updated[i] = { ...updated[i], protocole: v };
                              patch('plaies', updated);
                            }} placeholder="Protocole…" multiline rows={2} />
                          </div>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
                <div className="grid grid-cols-2 gap-x-4 px-3 py-1 border-t border-black">
                  <Ligne label="Ablation fils le :">
                    <ZoneSaisie value={form.ablationFils} onChange={v => patch('ablationFils', v)} />
                  </Ligne>
                  <Ligne label="Ablation agrafes le :">
                    <ZoneSaisie value={form.ablationAgrafes} onChange={v => patch('ablationAgrafes', v)} />
                  </Ligne>
                </div>
                <div className="flex gap-2 items-center flex-wrap px-3 pb-1">
                  <span className="font-semibold">Drainage :</span>
                  <Case checked={form.drainageOui} onChange={v => { patch('drainageOui', v); if (v) patch('drainageNon', false); }} label="Oui" />
                  <Case checked={form.drainageNon} onChange={v => { patch('drainageNon', v); if (v) patch('drainageOui', false); }} label="Non" />
                  <span className="font-semibold ml-2">Lequel :</span>
                  <ZoneSaisie value={form.drainageLequel} onChange={v => patch('drainageLequel', v)} className="flex-1" />
                </div>
              </div>

              {/* ── TRAITEMENT ── */}
              <Titre>Traitement : voir prescription médicale de sortie</Titre>
              <div className="px-3 py-2 border-b-2 border-black space-y-1">
                <div className="flex gap-1 items-start">
                  <span className="font-semibold whitespace-nowrap shrink-0">Traitement reçu ce jour :</span>
                  <div className="flex-1">
                    <ZoneSaisie value={form.traitementJour} onChange={v => patch('traitementJour', v)} multiline rows={3} />
                  </div>
                </div>
                <Ligne label="Perfusion :">
                  <ZoneSaisie value={form.perfusion} onChange={v => patch('perfusion', v)} />
                </Ligne>
                <Ligne label="KT posé le :">
                  <ZoneSaisie value={form.ktPoseLe} onChange={v => patch('ktPoseLe', v)} />
                </Ligne>
                <Ligne label="Examens prévus :">
                  <ZoneSaisie value={form.examensPrevus} onChange={v => patch('examensPrevus', v)} />
                </Ligne>
              </div>

              {/* ── VÉCU D'HOSPITALISATION ── */}
              <Titre>Vécu d&apos;hospitalisation</Titre>
              <div className="px-3 py-2 min-h-[60px]">
                <ZoneSaisie value={form.vecuHospitalisation} onChange={v => patch('vecuHospitalisation', v)} multiline rows={4} />
              </div>

            </div>
          </>
        )}
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0.8cm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 9px; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
