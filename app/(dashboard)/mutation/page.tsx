'use client';

/**
 * Lettre de Liaison des Soins Infirmiers — feuille de mutation
 * Auto-remplit les données depuis les modules (Résidents, GIR, Vaccination,
 * Surveillance Poids, Fiches Menu, Prises en Charge, Contentions, Matelas).
 * Les zones libres restent éditables. Bouton « Imprimer » pour export papier.
 */

import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Printer, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

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
interface FicheMenu {
  resident_id: string;
  repas: string;
  observation: string;
}
interface PecDetails {
  aideAlim?: string[];
  hydratation?: string[];
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

// Parse "covid:Refus famille C|grippe:Accepte G|..." → { covid, grippe }
function parseVaccInfos(infos: string | null | undefined): { covid: string; grippe: string } {
  if (!infos) return { covid: '', grippe: '' };
  const map: Record<string, string> = {};
  infos.split('|').forEach(p => {
    const idx = p.indexOf(':');
    if (idx > 0) {
      const k = p.slice(0, idx).trim();
      const v = p.slice(idx + 1).trim();
      if (k) map[k] = v;
    }
  });
  return { covid: map.covid || '', grippe: map.grippe || '' };
}

// Mirror of the matching logic from vaccination/page.tsx: id, then full name,
// then last-name fallback. Vaccination rows often miss resident_id.
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
  const { data, error } = await sb
    .from('residents')
    .select('*')
    .eq('archived', false)
    .order('last_name', { ascending: true });
  if (error) throw new Error(error.message);
  const residents = (data ?? []) as Resident[];

  // Sign photo URLs
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

async function fetchMutationContext(resident: Resident) {
  const sb = createClient();

  const [
    { data: lastWeight },
    { data: niveau },
    { data: allVacc },
    { data: allVaccLT },
    { data: fichesMenu },
    { data: pecRows },
    { data: contentions },
    { data: matCouss },
  ] = await Promise.all([
    sb.from('poids_mesure').select('*').eq('resident_id', resident.id).order('date', { ascending: false }).limit(1).maybeSingle(),
    sb.from('niveau_soin').select('*').eq('resident_id', resident.id).maybeSingle(),
    sb.from('vaccination').select('*'),
    sb.from('vaccination_long_terme').select('*'),
    sb.from('fiches_menu').select('*').eq('resident_id', resident.id),
    // RPC pour récupérer la colonne JSONB details (contourne le cache schéma PostgREST)
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
    vaccination,
    vaccinationLT,
    fichesMenu: (fichesMenu ?? []) as FicheMenu[],
    pec: pec as PecRow | null,
    contentions: (contentions ?? []) as Contention[],
    matCouss: (matCouss ?? []) as MatCouss[],
  };
}

// ─────────────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="bg-blue-900 text-white text-sm font-bold uppercase tracking-wide px-3 py-1.5 mb-2 mt-4 print:bg-slate-200 print:text-black print:border print:border-black">
      {children}
    </h2>
  );
}

function FieldRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-baseline gap-2 text-sm', className)}>
      <span className="font-semibold whitespace-nowrap">{label}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}

function CheckOption({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer text-sm">
      <Checkbox checked={checked} onCheckedChange={v => onChange(!!v)} className="h-4 w-4" />
      <span>{label}</span>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default function MutationPage() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Editable free-text fields (state local — pour impression)
  const [form, setForm] = useState({
    tel: '',
    personneAPrevenirManuel: '',
    personnePrevenue: '' as '' | 'oui' | 'non',
    tutellePrevenue: '' as '' | 'oui' | 'non',
    suiviSocial: '',
    situationFamiliale: '' as '' | 'marie' | 'celibataire' | 'divorce' | 'veuf',
    kineActif: null as boolean | null,
    kineDetail: '',
    motif: '',
    isolement: false,
    aideAlim: '' as '' | 'autonome' | 'aide',
    hydratation: '' as '' | 'petillante' | 'gelifiee',
    dentierHaut: false,
    dentierBas: false,
    dentierNonApportes: false,
    eliminationUrinaire: '' as '' | 'continent' | 'incontinent',
    eliminationFecale: '' as '' | 'continent' | 'incontinent',
    materielUrinaire: [] as string[],
    sadOui: '' as '' | 'oui' | 'non',
    sadDate: '',
    derniereSelle: '',
    appareilAuditif: '' as '' | 'oui' | 'non' | 'non-apportes',
    lunettes: '' as '' | 'oui' | 'non' | 'non-apportees',
    hygiene: '' as '' | 'autonome' | 'partielle' | 'totale',
    habillage: '' as '' | 'autonome' | 'partielle' | 'totale',
    hygieneCommentaire: '',
    sommeil: '' as '' | 'satisfaisant' | 'perturbe',
    etatGeneral: [] as string[],
    capacite: '' as '' | 'adaptees' | 'demence' | 'mutique',
    locomotion: '' as '' | 'autonome' | 'partielle' | 'totale',
    materielLoco: [] as string[],
    escarrePresent: '' as '' | 'oui' | 'non',
    escarres: [{ localisation: '', stade: '', protocole: '' }] as Array<{ localisation: string; stade: string; protocole: string }>,
    pansementPresent: '' as '' | 'oui' | 'non',
    pansements: [{ localisation: '', stade: '', protocole: '' }] as Array<{ localisation: string; stade: string; protocole: string }>,
    mycosePresent: '' as '' | 'oui' | 'non',
    mycoses: [{ localisation: '', stade: '', protocole: '' }] as Array<{ localisation: string; stade: string; protocole: string }>,
    perfusion: false,
    perfusionDetail: '',
    perfusionKtDate: '',
    dernierBilanSanguin: '',
    soinsIdeAutre: '',
  });

  const patch = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(s => ({ ...s, [k]: v }));

  const toggleList = (key: 'materielUrinaire' | 'etatGeneral' | 'materielLoco', value: string) => {
    setForm(s => {
      const arr = s[key];
      return { ...s, [key]: arr.includes(value) ? arr.filter(x => x !== value) : [...arr, value] };
    });
  };

  const updateLesion = (
    key: 'escarres' | 'pansements' | 'mycoses',
    index: number,
    field: 'localisation' | 'stade' | 'protocole',
    value: string,
  ) => {
    setForm(s => {
      const arr = [...s[key]];
      arr[index] = { ...arr[index], [field]: value };
      return { ...s, [key]: arr };
    });
  };

  const addLesion = (key: 'escarres' | 'pansements' | 'mycoses') => {
    setForm(s => ({ ...s, [key]: [...s[key], { localisation: '', stade: '', protocole: '' }] }));
  };

  const removeLesion = (key: 'escarres' | 'pansements' | 'mycoses', index: number) => {
    setForm(s => {
      const arr = s[key].filter((_, i) => i !== index);
      return { ...s, [key]: arr.length ? arr : [{ localisation: '', stade: '', protocole: '' }] };
    });
  };

  const { data: residents = [], isLoading: loadingResidents } = useQuery({
    queryKey: ['mutation-residents'],
    queryFn: fetchResidents,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return residents;
    return residents.filter(r =>
      `${r.last_name} ${r.first_name} ${r.room}`.toLowerCase().includes(q)
    );
  }, [residents, search]);

  const selected = useMemo(
    () => residents.find(r => r.id === selectedId) ?? null,
    [residents, selectedId]
  );

  const { data: ctx } = useQuery({
    queryKey: ['mutation-context', selectedId],
    queryFn: () => fetchMutationContext(selected!),
    enabled: !!selected,
  });

  // Régime synthétique depuis les flags residents — défaut "Normal" si rien
  const regimeText = useMemo(() => {
    if (!selected) return '';
    const flags: string[] = [];
    if (selected.regime_mixe) flags.push('Mixé');
    if (selected.viande_mixee) flags.push('Viande mixée');
    if (selected.regime_diabetique) flags.push('Diabétique');
    if (selected.epargne_intestinale) flags.push('Épargne intestinale');
    return flags.length ? flags.join(', ') : 'Normal';
  }, [selected]);

  const alimentationObs = useMemo(() => {
    if (!ctx?.fichesMenu?.length) return '';
    return ctx.fichesMenu
      .map(f => `${f.repas === 'midi' ? 'Midi' : 'Soir'}: ${f.observation || '—'}`)
      .join(' | ');
  }, [ctx]);

  const personnePrevenir = useMemo(() => {
    if (!ctx?.niveau) return '';
    const parts: string[] = [];
    if (ctx.niveau.appel_nuit_info) parts.push(ctx.niveau.appel_nuit_info);
    if (ctx.niveau.tutelle) parts.push(`Tutelle : ${ctx.niveau.tutelle}`);
    return parts.join(' — ');
  }, [ctx]);

  const allergiesText = useMemo(() => {
    if (!selected) return '';
    return selected.allergie_medicamenteuse?.trim() ?? '';
  }, [selected]);

  const vaccinsText = useMemo(() => {
    if (!ctx) return '';
    const lines: string[] = [];
    const refus: string[] = [];

    if (ctx.vaccination) {
      const annee = ctx.vaccination.year;
      const { covid: covidChoice, grippe: grippeChoice } = parseVaccInfos(ctx.vaccination.infos);
      const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

      // ── COVID ──
      if (covidChoice && /refus/i.test(covidChoice)) {
        const famille = /famille/i.test(covidChoice);
        refus.push(`COVID (${famille ? 'refus famille' : 'refus résident'})`);
      } else {
        const covidDates = [ctx.vaccination.covid_inj1, ctx.vaccination.covid_inj2, ctx.vaccination.covid_inj3]
          .filter(isDate)
          .sort()
          .reverse();
        if (covidDates.length) {
          lines.push(`COVID ${annee} : dernière injection le ${formatDate(covidDates[0])}`);
        } else if (covidChoice) {
          lines.push(`COVID ${annee} : ${covidChoice}`);
        }
      }

      // ── GRIPPE ──
      if (grippeChoice && /refus/i.test(grippeChoice)) {
        const famille = /famille/i.test(grippeChoice);
        refus.push(`Grippe (${famille ? 'refus famille' : 'refus résident'})`);
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

  const matelasText = useMemo(() => {
    if (!ctx?.matCouss?.length) return '';
    return ctx.matCouss
      .filter(m => m.kind === 'matelas')
      .map(m => m.type_name ?? '—')
      .join(', ');
  }, [ctx]);

  const contentionText = useMemo(() => {
    if (!ctx?.contentions?.length) return '';
    return ctx.contentions
      .map(c => {
        const fin = c.pas_de_fin ? 'sans fin' : c.date_fin ? `→ ${formatDate(c.date_fin)}` : '';
        return `${c.traitement}${c.date_debut ? ` (depuis ${formatDate(c.date_debut)}${fin ? ' ' + fin : ''})` : ''}`;
      })
      .join(' · ');
  }, [ctx]);

  // Réinitialise les champs auto-remplis dès que le résident change
  useEffect(() => {
    setForm(s => ({
      ...s,
      aideAlim: '',
      hydratation: '',
      dentierHaut: false,
      dentierBas: false,
      eliminationUrinaire: '',
      eliminationFecale: '',
      materielUrinaire: [],
      appareilAuditif: '',
      lunettes: '',
      hygiene: '',
      habillage: '',
      locomotion: '',
      materielLoco: [],
    }));
  }, [selectedId]);

  // Auto-remplit les champs du formulaire depuis Prises en Charge (JSONB details)
  useEffect(() => {
    const d = ctx?.pec?.details;
    if (!d) return;
    const aideA = asArr(d.aideAlim);
    const hyd = asArr(d.hydratation);
    const dent = asArr(d.dentier);
    const uri = asArr(d.urinaire);
    const fec = asArr(d.fecale);
    const aud = asArr(d.appareilAuditif);
    const lun = asArr(d.lunettes);
    const hyg = asArr(d.hygiene);
    const hab = asArr(d.habillage);
    const loc = asArr(d.locomotion);
    setForm(s => ({
      ...s,
      aideAlim: aideA.includes('autonome') ? 'autonome' : aideA.includes('aide') ? 'aide' : '',
      hydratation: hyd.includes('petillante') ? 'petillante' : hyd.includes('gelifiee') ? 'gelifiee' : '',
      dentierHaut: dent.includes('haut'),
      dentierBas: dent.includes('bas'),
      eliminationUrinaire: uri.includes('continent') ? 'continent' : uri.includes('incontinent') ? 'incontinent' : '',
      eliminationFecale: fec.includes('continent') ? 'continent' : fec.includes('incontinent') ? 'incontinent' : '',
      materielUrinaire: asArr(d.elimMateriel),
      appareilAuditif: aud.includes('oui') ? 'oui' : aud.includes('non') ? 'non' : '',
      lunettes: lun.includes('oui') ? 'oui' : lun.includes('non') ? 'non' : '',
      hygiene: hyg.includes('autonome') ? 'autonome' : hyg.includes('partielle') ? 'partielle' : hyg.includes('totale') ? 'totale' : '',
      habillage: hab.includes('autonome') ? 'autonome' : hab.includes('partielle') ? 'partielle' : hab.includes('totale') ? 'totale' : '',
      locomotion: loc.includes('autonome') ? 'autonome' : loc.includes('partielle') ? 'partielle' : loc.includes('totale') ? 'totale' : '',
      materielLoco: asArr(d.locoMateriel).map(v => LOCO_MATERIEL_MAP[v]).filter(Boolean),
    }));
  }, [ctx?.pec]);

  const protectionText = useMemo(() => {
    const d = ctx?.pec?.details;
    const j = d?.protectionJour ?? '';
    const n = d?.protectionNuit ?? '';
    if (j && n) return `J : ${j} · N : ${n}`;
    if (j) return `J : ${j}`;
    if (n) return `N : ${n}`;
    return ctx?.pec?.protection || '';
  }, [ctx?.pec]);

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      {/* ── Top bar (cachée à l'impression) ── */}
      <div className="bg-blue-900 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10 print:hidden">
        <Link href="/" className="text-white/70 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-bold flex-1">Lettre de Liaison des Soins Infirmiers</h1>
        {selected && (
          <Button onClick={() => window.print()} size="sm" className="bg-white text-blue-900 hover:bg-slate-100">
            <Printer className="h-4 w-4 mr-1.5" /> Imprimer
          </Button>
        )}
      </div>

      <div className="max-w-4xl mx-auto p-4 sm:p-6 print:p-0 print:max-w-none">
        {/* ── Sélecteur résident (caché à l'impression) ── */}
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
                    {r.photo_url ? (
                      <img src={r.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-slate-200" />
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-medium">
                        {r.title} <span className="uppercase">{r.last_name}</span> {r.first_name}
                      </div>
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
            {/* Bouton retour (non-print) */}
            <div className="mb-3 print:hidden">
              <button
                onClick={() => setSelectedId(null)}
                className="text-sm text-blue-700 hover:underline"
              >
                ← Changer de résident
              </button>
            </div>

            {/* ── DOCUMENT IMPRIMABLE ── */}
            <article className="bg-white border border-slate-300 rounded-lg p-6 print:border-0 print:rounded-none print:p-4 print:shadow-none shadow-sm">
              {/* En-tête */}
              <header className="border-b-2 border-blue-900 pb-3 mb-3 text-center">
                <h1 className="text-lg font-bold uppercase tracking-wide">Lettre de Liaison des Soins Infirmiers</h1>
                <p className="text-sm mt-1">Site de Gueugnon · EHPAD La Fourrier · 5 route de Toulon · 71130</p>
                <p className="text-xs text-slate-700 mt-0.5">
                  Secrétariat : 03 85 85 85 47 · IDE : 03 85 85 85 53 · Email : medecins.mapad@ch-paray.fr
                </p>
              </header>

              {/* Bloc service / date / élaboré par */}
              <div className="grid grid-cols-3 gap-2 text-sm mb-2">
                <FieldRow label="Nom du service :">EHPAD Gueugnon La Fourrier</FieldRow>
                <FieldRow label="Fait le :">{todayFR()}</FieldRow>
                <FieldRow label="Élaboré par :">IDE</FieldRow>
              </div>

              {/* ── IDENTIFICATION ── */}
              <SectionTitle>Identification de la personne soignée</SectionTitle>
              <div className="flex gap-4">
                {/* Photo */}
                <div className="flex-shrink-0">
                  {selected.photo_url ? (
                    <img
                      src={selected.photo_url}
                      alt=""
                      className="h-24 w-20 object-cover border border-slate-300 rounded"
                    />
                  ) : (
                    <div className="h-24 w-20 bg-slate-100 border border-slate-300 rounded flex items-center justify-center text-[10px] text-slate-400">
                      Photo
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <FieldRow label="NOM :">
                    <span className="uppercase font-medium">{selected.last_name}</span>
                    {selected.maiden_name && (
                      <span className="text-slate-700"> (née {selected.maiden_name.toUpperCase()})</span>
                    )}
                  </FieldRow>
                  <FieldRow label="PRÉNOM :">{selected.first_name}</FieldRow>
                  <div className="flex gap-4">
                    <FieldRow label="Né(e) le :" className="flex-1">{formatDate(selected.date_naissance)}</FieldRow>
                    <FieldRow label="ÂGE :" className="flex-1">{calcAge(selected.date_naissance)}</FieldRow>
                  </div>
                  <div className="flex gap-4">
                    <FieldRow label="ÉTAGE :" className="flex-1">{selected.floor}</FieldRow>
                    <FieldRow label="CHAMBRE :" className="flex-1">{selected.room}</FieldRow>
                  </div>
                  <FieldRow label="Poids :">
                    {ctx?.lastWeight
                      ? `${ctx.lastWeight.poids_kg} kg (mesuré le ${formatDate(ctx.lastWeight.date)})`
                      : '—'}
                  </FieldRow>
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                {personnePrevenir ? (
                  <FieldRow label="Personne à prévenir :">{personnePrevenir}</FieldRow>
                ) : (
                  <div className="flex items-center gap-3">
                    <Label className="text-sm font-semibold whitespace-nowrap">Personne à prévenir :</Label>
                    <Input
                      value={form.personneAPrevenirManuel}
                      onChange={e => patch('personneAPrevenirManuel', e.target.value)}
                      className="h-7 flex-1 print:border-0 print:border-b print:rounded-none print:px-0"
                    />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Label className="text-sm font-semibold">Tél :</Label>
                  <Input
                    value={form.tel}
                    onChange={e => patch('tel', e.target.value)}
                    className="h-7 max-w-xs print:border-0 print:border-b print:rounded-none print:px-0"
                  />
                </div>
                <div className="flex flex-wrap gap-4 text-sm pt-1">
                  <span className="font-semibold">Personne prévenue :</span>
                  <CheckOption label="Oui" checked={form.personnePrevenue === 'oui'} onChange={v => patch('personnePrevenue', v ? 'oui' : '')} />
                  <CheckOption label="Non" checked={form.personnePrevenue === 'non'} onChange={v => patch('personnePrevenue', v ? 'non' : '')} />
                  {ctx?.niveau?.tutelle && (
                    <>
                      <span className="font-semibold ml-4">Tutelle prévenue :</span>
                      <CheckOption label="Oui" checked={form.tutellePrevenue === 'oui'} onChange={v => patch('tutellePrevenue', v ? 'oui' : '')} />
                      <CheckOption label="Non" checked={form.tutellePrevenue === 'non'} onChange={v => patch('tutellePrevenue', v ? 'non' : '')} />
                    </>
                  )}
                </div>
              </div>

              {/* ── ENVIRONNEMENT ── */}
              <SectionTitle>Environnement familial et social</SectionTitle>
              <div className="space-y-1.5">
                {(() => {
                  const fem = isFemaleTitle(selected.title);
                  return (
                    <div className="flex items-center gap-3 text-sm flex-wrap">
                      <span className="font-semibold">Situation familiale :</span>
                      <CheckOption label={fem ? 'Mariée' : 'Marié'} checked={form.situationFamiliale === 'marie'} onChange={v => patch('situationFamiliale', v ? 'marie' : '')} />
                      <CheckOption label="Célibataire" checked={form.situationFamiliale === 'celibataire'} onChange={v => patch('situationFamiliale', v ? 'celibataire' : '')} />
                      <CheckOption label={fem ? 'Divorcée' : 'Divorcé'} checked={form.situationFamiliale === 'divorce'} onChange={v => patch('situationFamiliale', v ? 'divorce' : '')} />
                      <CheckOption label={fem ? 'Veuve' : 'Veuf'} checked={form.situationFamiliale === 'veuf'} onChange={v => patch('situationFamiliale', v ? 'veuf' : '')} />
                    </div>
                  );
                })()}
                <FieldRow label="Environnement :">Vit en établissement EHPAD La Fourrier</FieldRow>
                {ctx?.niveau?.tutelle && (
                  <div>
                    <Label className="text-sm font-semibold">Suivi social :</Label>
                    <Input
                      value={form.suiviSocial || ctx.niveau.tutelle}
                      onChange={e => patch('suiviSocial', e.target.value)}
                      className="h-7 print:border-0 print:border-b print:rounded-none print:px-0"
                    />
                  </div>
                )}
              </div>

              {/* ── INTERVENANTS ── */}
              <SectionTitle>Intervenants</SectionTitle>
              <div className="space-y-1.5">
                <FieldRow label="Médecin traitant :">{selected.medecin || '—'}</FieldRow>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-semibold">Kiné :</span>
                  <CheckOption label="Oui" checked={form.kineActif === true} onChange={v => patch('kineActif', v ? true : null)} />
                  <CheckOption label="Non" checked={form.kineActif === false} onChange={v => patch('kineActif', v ? false : null)} />
                  <Input
                    value={form.kineDetail}
                    onChange={e => patch('kineDetail', e.target.value)}
                    placeholder="Type de kiné"
                    className="h-7 flex-1 print:border-0 print:border-b print:rounded-none print:px-0"
                  />
                </div>
              </div>

              {/* ── VACCINATION / NIVEAU DE SOINS / GIR ── */}
              <SectionTitle>Vaccination / Niveau de soins / GIR</SectionTitle>
              <div className="space-y-1.5">
                <FieldRow label="Niveau de soins :">
                  {ctx?.niveau?.niveau_soin
                    ? `${ctx.niveau.niveau_soin} (décidé par Médecin Co. avec Personne référente / résident)`
                    : 'non évalué par Médecin Co.'}
                </FieldRow>
                <FieldRow label="GIR :">{ctx?.niveau?.gir || '—'}</FieldRow>
                <FieldRow label="Vaccins :">{vaccinsText || '—'}</FieldRow>
              </div>

              {/* ── VECU D'HOSPITALISATION ── */}
              <SectionTitle>Vécu d&apos;hospitalisation</SectionTitle>
              <div className="space-y-2">
                <div>
                  <Label className="text-sm font-semibold">Motif :</Label>
                  <Textarea
                    value={form.motif}
                    onChange={e => patch('motif', e.target.value)}
                    rows={2}
                    className="text-sm print:border print:border-slate-400"
                  />
                </div>
                <div>
                  <Label className="text-sm font-semibold">ATCD :</Label>
                  <div className="text-sm whitespace-pre-wrap border border-slate-200 rounded p-2 bg-slate-50 print:bg-white">
                    {selected.antecedents || <span className="text-slate-400">—</span>}
                  </div>
                </div>
                <FieldRow label="Allergie :">{allergiesText || <span className="text-slate-400">—</span>}</FieldRow>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-semibold">Isolement :</span>
                  <CheckOption label="Oui" checked={form.isolement} onChange={v => patch('isolement', v)} />
                  <CheckOption label="Non" checked={!form.isolement} onChange={v => patch('isolement', !v)} />
                </div>
              </div>

              {/* ── ALIMENTATION ── */}
              <SectionTitle>Alimentation et hydratation</SectionTitle>
              <div className="space-y-1.5">
                <FieldRow label="Alimentation :">{alimentationObs || <span className="text-slate-400">—</span>}</FieldRow>
                <FieldRow label="Régime :">{regimeText || <span className="text-slate-400">—</span>}</FieldRow>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-semibold">Aide alimentation :</span>
                  <CheckOption label="Autonome" checked={form.aideAlim === 'autonome'} onChange={v => patch('aideAlim', v ? 'autonome' : '')} />
                  <CheckOption label="Aide" checked={form.aideAlim === 'aide'} onChange={v => patch('aideAlim', v ? 'aide' : '')} />
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-semibold">Hydratation :</span>
                  <CheckOption label="Eau pétillante" checked={form.hydratation === 'petillante'} onChange={v => patch('hydratation', v ? 'petillante' : '')} />
                  <CheckOption label="Eau gélifiée" checked={form.hydratation === 'gelifiee'} onChange={v => patch('hydratation', v ? 'gelifiee' : '')} />
                </div>
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">Dentiers :</span>
                  <CheckOption label="Haut" checked={form.dentierHaut} onChange={v => patch('dentierHaut', v)} />
                  <CheckOption label="Bas" checked={form.dentierBas} onChange={v => patch('dentierBas', v)} />
                  <CheckOption label="Non apportés" checked={form.dentierNonApportes} onChange={v => patch('dentierNonApportes', v)} />
                </div>
              </div>

              {/* ── ÉLIMINATION ── */}
              <SectionTitle>Élimination</SectionTitle>
              <div className="space-y-1.5">
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">Urinaire :</span>
                  <CheckOption label="Continent" checked={form.eliminationUrinaire === 'continent'} onChange={v => patch('eliminationUrinaire', v ? 'continent' : '')} />
                  <CheckOption label="Incontinent" checked={form.eliminationUrinaire === 'incontinent'} onChange={v => patch('eliminationUrinaire', v ? 'incontinent' : '')} />
                </div>
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">Fécale :</span>
                  <CheckOption label="Continent" checked={form.eliminationFecale === 'continent'} onChange={v => patch('eliminationFecale', v ? 'continent' : '')} />
                  <CheckOption label="Incontinent" checked={form.eliminationFecale === 'incontinent'} onChange={v => patch('eliminationFecale', v ? 'incontinent' : '')} />
                </div>
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">Matériel :</span>
                  <CheckOption label="Urinal" checked={form.materielUrinaire.includes('urinal')} onChange={() => toggleList('materielUrinaire', 'urinal')} />
                  <CheckOption label="Bassin" checked={form.materielUrinaire.includes('bassin')} onChange={() => toggleList('materielUrinaire', 'bassin')} />
                  <CheckOption label="Chaise percée" checked={form.materielUrinaire.includes('chaise-percee')} onChange={() => toggleList('materielUrinaire', 'chaise-percee')} />
                </div>
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">SAD :</span>
                  <CheckOption label="Oui" checked={form.sadOui === 'oui'} onChange={v => patch('sadOui', v ? 'oui' : '')} />
                  <CheckOption label="Non" checked={form.sadOui === 'non'} onChange={v => patch('sadOui', v ? 'non' : '')} />
                  <span>Date de pose :</span>
                  <Input
                    value={form.sadDate}
                    onChange={e => patch('sadDate', e.target.value)}
                    className="h-7 max-w-xs print:border-0 print:border-b print:rounded-none print:px-0"
                  />
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-semibold">Date dernière selle :</span>
                  <Input
                    value={form.derniereSelle}
                    onChange={e => patch('derniereSelle', e.target.value)}
                    className="h-7 max-w-xs print:border-0 print:border-b print:rounded-none print:px-0"
                  />
                </div>
                <FieldRow label="Protection :">{protectionText || <span className="text-slate-400">—</span>}</FieldRow>
              </div>

              {/* ── HYGIENE ── */}
              <SectionTitle>Hygiène et confort</SectionTitle>
              <div className="space-y-1.5">
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">Appareil auditif :</span>
                  <CheckOption label="Oui" checked={form.appareilAuditif === 'oui'} onChange={v => patch('appareilAuditif', v ? 'oui' : '')} />
                  <CheckOption label="Non" checked={form.appareilAuditif === 'non'} onChange={v => patch('appareilAuditif', v ? 'non' : '')} />
                  <CheckOption label="Non apportés" checked={form.appareilAuditif === 'non-apportes'} onChange={v => patch('appareilAuditif', v ? 'non-apportes' : '')} />
                </div>
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">Lunettes :</span>
                  <CheckOption label="Oui" checked={form.lunettes === 'oui'} onChange={v => patch('lunettes', v ? 'oui' : '')} />
                  <CheckOption label="Non" checked={form.lunettes === 'non'} onChange={v => patch('lunettes', v ? 'non' : '')} />
                  <CheckOption label="Non apportées" checked={form.lunettes === 'non-apportees'} onChange={v => patch('lunettes', v ? 'non-apportees' : '')} />
                </div>
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">Hygiène :</span>
                  <CheckOption label="Autonome" checked={form.hygiene === 'autonome'} onChange={() => patch('hygiene', 'autonome')} />
                  <CheckOption label="Aide partielle" checked={form.hygiene === 'partielle'} onChange={() => patch('hygiene', 'partielle')} />
                  <CheckOption label="Aide totale" checked={form.hygiene === 'totale'} onChange={() => patch('hygiene', 'totale')} />
                </div>
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">Habillage :</span>
                  <CheckOption label="Autonome" checked={form.habillage === 'autonome'} onChange={() => patch('habillage', 'autonome')} />
                  <CheckOption label="Aide partielle" checked={form.habillage === 'partielle'} onChange={() => patch('habillage', 'partielle')} />
                  <CheckOption label="Aide totale" checked={form.habillage === 'totale'} onChange={() => patch('habillage', 'totale')} />
                </div>
                <div>
                  <Label className="text-sm font-semibold">Commentaire :</Label>
                  <Textarea
                    value={form.hygieneCommentaire}
                    onChange={e => patch('hygieneCommentaire', e.target.value)}
                    rows={2}
                    className="text-sm print:border print:border-slate-400"
                  />
                </div>
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">Sommeil :</span>
                  <CheckOption label="Satisfaisant" checked={form.sommeil === 'satisfaisant'} onChange={v => patch('sommeil', v ? 'satisfaisant' : '')} />
                  <CheckOption label="Perturbé" checked={form.sommeil === 'perturbe'} onChange={v => patch('sommeil', v ? 'perturbe' : '')} />
                </div>
              </div>

              {/* ── COMPORTEMENT ── */}
              <SectionTitle>Comportement</SectionTitle>
              <div className="space-y-1.5">
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">État général :</span>
                  {['Calme', 'Agitation', 'Déambulation', 'Agressivité', 'Risque de fugue'].map(opt => (
                    <CheckOption
                      key={opt}
                      label={opt}
                      checked={form.etatGeneral.includes(opt)}
                      onChange={() => toggleList('etatGeneral', opt)}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">Capacité :</span>
                  <CheckOption label="Réponses adaptées" checked={form.capacite === 'adaptees'} onChange={() => patch('capacite', 'adaptees')} />
                  <CheckOption label="Démence" checked={form.capacite === 'demence'} onChange={() => patch('capacite', 'demence')} />
                  <CheckOption label="Mutique" checked={form.capacite === 'mutique'} onChange={() => patch('capacite', 'mutique')} />
                </div>
                <FieldRow label="Contention physique :">{contentionText || <span className="text-slate-400">—</span>}</FieldRow>
              </div>

              {/* ── LOCOMOTION ── */}
              <SectionTitle>Locomotion / Mobilisation</SectionTitle>
              <div className="space-y-1.5">
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">Locomotion :</span>
                  <CheckOption label="Autonome" checked={form.locomotion === 'autonome'} onChange={() => patch('locomotion', 'autonome')} />
                  <CheckOption label="Aide partielle" checked={form.locomotion === 'partielle'} onChange={() => patch('locomotion', 'partielle')} />
                  <CheckOption label="Aide totale" checked={form.locomotion === 'totale'} onChange={() => patch('locomotion', 'totale')} />
                </div>
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">Matériel :</span>
                  {['Canne', 'Déambulateur', 'Fauteuil roulant', 'Verticalisateur', 'Lève-malade'].map(opt => (
                    <CheckOption
                      key={opt}
                      label={opt}
                      checked={form.materielLoco.includes(opt)}
                      onChange={() => toggleList('materielLoco', opt)}
                    />
                  ))}
                </div>
              </div>

              {/* ── ETAT CUTANE ── */}
              <SectionTitle>État cutané</SectionTitle>
              <div className="space-y-2">
                <div className={cn('flex items-baseline gap-2 text-sm', matelasText && 'font-bold')}>
                  <span className="font-semibold whitespace-nowrap">Matelas :</span>
                  <span className="flex-1">{matelasText || <span className="text-slate-400 font-normal">—</span>}</span>
                </div>

                {/* Escarres */}
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">Escarre :</span>
                  <CheckOption label="Oui" checked={form.escarrePresent === 'oui'} onChange={v => patch('escarrePresent', v ? 'oui' : '')} />
                  <CheckOption label="Non" checked={form.escarrePresent === 'non'} onChange={v => patch('escarrePresent', v ? 'non' : '')} />
                </div>
                {form.escarrePresent === 'oui' && (
                  <div className="space-y-2 pl-4 border-l-2 border-slate-200">
                    {form.escarres.map((e, i) => (
                      <div key={i} className="space-y-1 pb-2 border-b border-slate-100 last:border-b-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-600">Escarre #{i + 1}</span>
                          {form.escarres.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLesion('escarres', i)}
                              className="text-xs text-red-600 hover:underline print:hidden"
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs font-semibold">Localisation :</Label>
                          <Input
                            value={e.localisation}
                            onChange={ev => updateLesion('escarres', i, 'localisation', ev.target.value)}
                            className="h-7 print:border-0 print:border-b print:rounded-none print:px-0"
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-semibold">Stade :</Label>
                          <Input
                            value={e.stade}
                            onChange={ev => updateLesion('escarres', i, 'stade', ev.target.value)}
                            className="h-7 print:border-0 print:border-b print:rounded-none print:px-0"
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-semibold">Protocole :</Label>
                          <Textarea
                            value={e.protocole}
                            onChange={ev => updateLesion('escarres', i, 'protocole', ev.target.value)}
                            rows={2}
                            className="text-sm print:border print:border-slate-400"
                          />
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      onClick={() => addLesion('escarres')}
                      size="sm"
                      variant="outline"
                      className="text-xs print:hidden"
                    >
                      + Ajouter une escarre
                    </Button>
                  </div>
                )}

                {/* Pansements */}
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">Pansement :</span>
                  <CheckOption label="Oui" checked={form.pansementPresent === 'oui'} onChange={v => patch('pansementPresent', v ? 'oui' : '')} />
                  <CheckOption label="Non" checked={form.pansementPresent === 'non'} onChange={v => patch('pansementPresent', v ? 'non' : '')} />
                </div>
                {form.pansementPresent === 'oui' && (
                  <div className="space-y-2 pl-4 border-l-2 border-slate-200">
                    {form.pansements.map((p, i) => (
                      <div key={i} className="space-y-1 pb-2 border-b border-slate-100 last:border-b-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-600">Pansement #{i + 1}</span>
                          {form.pansements.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLesion('pansements', i)}
                              className="text-xs text-red-600 hover:underline print:hidden"
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs font-semibold">Localisation :</Label>
                          <Input
                            value={p.localisation}
                            onChange={ev => updateLesion('pansements', i, 'localisation', ev.target.value)}
                            className="h-7 print:border-0 print:border-b print:rounded-none print:px-0"
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-semibold">Stade :</Label>
                          <Input
                            value={p.stade}
                            onChange={ev => updateLesion('pansements', i, 'stade', ev.target.value)}
                            className="h-7 print:border-0 print:border-b print:rounded-none print:px-0"
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-semibold">Protocole :</Label>
                          <Textarea
                            value={p.protocole}
                            onChange={ev => updateLesion('pansements', i, 'protocole', ev.target.value)}
                            rows={2}
                            className="text-sm print:border print:border-slate-400"
                          />
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      onClick={() => addLesion('pansements')}
                      size="sm"
                      variant="outline"
                      className="text-xs print:hidden"
                    >
                      + Ajouter un pansement
                    </Button>
                  </div>
                )}

                {/* Mycoses */}
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">Mycose cutanée :</span>
                  <CheckOption label="Oui" checked={form.mycosePresent === 'oui'} onChange={v => patch('mycosePresent', v ? 'oui' : '')} />
                  <CheckOption label="Non" checked={form.mycosePresent === 'non'} onChange={v => patch('mycosePresent', v ? 'non' : '')} />
                </div>
                {form.mycosePresent === 'oui' && (
                  <div className="space-y-2 pl-4 border-l-2 border-slate-200">
                    {form.mycoses.map((m, i) => (
                      <div key={i} className="space-y-1 pb-2 border-b border-slate-100 last:border-b-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-600">Mycose #{i + 1}</span>
                          {form.mycoses.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLesion('mycoses', i)}
                              className="text-xs text-red-600 hover:underline print:hidden"
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs font-semibold">Localisation :</Label>
                          <Input
                            value={m.localisation}
                            onChange={ev => updateLesion('mycoses', i, 'localisation', ev.target.value)}
                            className="h-7 print:border-0 print:border-b print:rounded-none print:px-0"
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-semibold">Stade :</Label>
                          <Input
                            value={m.stade}
                            onChange={ev => updateLesion('mycoses', i, 'stade', ev.target.value)}
                            className="h-7 print:border-0 print:border-b print:rounded-none print:px-0"
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-semibold">Protocole :</Label>
                          <Textarea
                            value={m.protocole}
                            onChange={ev => updateLesion('mycoses', i, 'protocole', ev.target.value)}
                            rows={2}
                            className="text-sm print:border print:border-slate-400"
                          />
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      onClick={() => addLesion('mycoses')}
                      size="sm"
                      variant="outline"
                      className="text-xs print:hidden"
                    >
                      + Ajouter une mycose
                    </Button>
                  </div>
                )}
              </div>

              {/* ── SOINS IDE DIVERS ── */}
              <SectionTitle>Soins IDE divers</SectionTitle>
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">Perfusion :</span>
                  <CheckOption label="Oui" checked={form.perfusion} onChange={v => patch('perfusion', v)} />
                  <CheckOption label="Non" checked={!form.perfusion} onChange={v => patch('perfusion', !v)} />
                </div>
                {form.perfusion && (
                  <div className="space-y-2 pl-4 border-l-2 border-slate-200">
                    <div>
                      <Label className="text-sm font-semibold">Détail perfusion :</Label>
                      <Textarea
                        value={form.perfusionDetail}
                        onChange={e => patch('perfusionDetail', e.target.value)}
                        rows={2}
                        className="text-sm print:border print:border-slate-400"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-semibold">Date KT posé :</Label>
                      <Input
                        value={form.perfusionKtDate}
                        onChange={e => patch('perfusionKtDate', e.target.value)}
                        className="h-7 max-w-xs print:border-0 print:border-b print:rounded-none print:px-0"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <Label className="text-sm font-semibold">Dernier bilan sanguin :</Label>
                  <Input
                    value={form.dernierBilanSanguin}
                    onChange={e => patch('dernierBilanSanguin', e.target.value)}
                    placeholder="Date si connue"
                    className="h-7 max-w-xs print:border-0 print:border-b print:rounded-none print:px-0"
                  />
                </div>
                <div>
                  <Label className="text-sm font-semibold">Autre :</Label>
                  <Textarea
                    value={form.soinsIdeAutre}
                    onChange={e => patch('soinsIdeAutre', e.target.value)}
                    rows={2}
                    className="text-sm print:border print:border-slate-400"
                  />
                </div>
              </div>
            </article>
          </>
        )}
      </div>

      {/* Styles print spécifiques */}
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 1cm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
