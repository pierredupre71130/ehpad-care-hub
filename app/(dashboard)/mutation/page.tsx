'use client';

/**
 * Lettre de Liaison des Soins Infirmiers — feuille de mutation
 * Auto-remplit les données depuis les modules (Résidents, GIR, Vaccination,
 * Surveillance Poids, Fiches Menu, Prises en Charge, Contentions, Matelas).
 * Les zones libres restent éditables. Bouton « Imprimer » pour export papier.
 */

import { useState, useMemo, type ReactNode } from 'react';
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
}
interface Vaccination {
  resident_id?: string;
  year: number;
  covid_inj1?: string | null;
  covid_inj2?: string | null;
  covid_inj3?: string | null;
  grippe_inj1?: string | null;
  infos?: string | null;
}
interface VaccinationLT {
  resident_id?: string;
  tetanos_date?: string | null;
  pneumovax_date?: string | null;
  notes?: string | null;
}
interface FicheMenu {
  resident_id: string;
  repas: string;
  observation: string;
}
interface PecRow { chambre: string; protection: string; }
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
    { data: vaccinations },
    { data: vaccinationLT },
    { data: fichesMenu },
    { data: pec },
    { data: contentions },
    { data: matCouss },
  ] = await Promise.all([
    sb.from('poids_mesure').select('*').eq('resident_id', resident.id).order('date', { ascending: false }).limit(1).maybeSingle(),
    sb.from('niveau_soin').select('*').eq('resident_id', resident.id).maybeSingle(),
    sb.from('vaccination').select('*').eq('resident_id', resident.id).order('year', { ascending: false }).limit(1).maybeSingle(),
    sb.from('vaccination_long_terme').select('*').eq('resident_id', resident.id).maybeSingle(),
    sb.from('fiches_menu').select('*').eq('resident_id', resident.id),
    sb.from('prise_en_charge').select('*').eq('chambre', resident.room).maybeSingle(),
    sb.from('contentions').select('*').eq('type_suivi', 'contention').eq('chambre', resident.room),
    sb.from('mat_couss_items').select('*').eq('resident_id', resident.id).eq('status', 'attribue'),
  ]);

  return {
    lastWeight: lastWeight as PoidsMesure | null,
    niveau: niveau as NiveauSoin | null,
    vaccination: vaccinations as Vaccination | null,
    vaccinationLT: vaccinationLT as VaccinationLT | null,
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
    personnePrevenue: false,
    tutellePrevenue: false,
    situationFamiliale: '',
    suiviSocial: '',
    kineActif: false,
    kineDetail: '',
    motif: '',
    isolement: false,
    aideAlim: 'autonome' as 'autonome' | 'aide',
    hydratation: '' as '' | 'petillante' | 'gelifiee',
    eliminationUrinaire: '' as '' | 'continent' | 'incontinent',
    eliminationFecale: '' as '' | 'continent' | 'incontinent',
    materielUrinaire: [] as string[],
    sadOui: false,
    sadDate: '',
    derniereSelle: '',
    hygiene: '' as '' | 'autonome' | 'partielle' | 'totale',
    habillage: '' as '' | 'autonome' | 'partielle' | 'totale',
    hygieneCommentaire: '',
    sommeil: '',
    etatGeneral: [] as string[],
    capacite: '' as '' | 'adaptees' | 'demence' | 'mutique',
    locomotion: '' as '' | 'autonome' | 'partielle' | 'totale',
    materielLoco: [] as string[],
    etatCutane: '',
    localisationEscarre: '',
    localisationMycose: '',
    localisationPansement: '',
    ablationFils: '',
    ablationAgraffe: '',
    ktPoseLe: '',
  });

  const patch = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(s => ({ ...s, [k]: v }));

  const toggleList = (key: 'materielUrinaire' | 'etatGeneral' | 'materielLoco', value: string) => {
    setForm(s => {
      const arr = s[key];
      return { ...s, [key]: arr.includes(value) ? arr.filter(x => x !== value) : [...arr, value] };
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

  // Régime synthétique depuis les flags residents
  const regimeText = useMemo(() => {
    if (!selected) return '';
    const flags: string[] = [];
    if (selected.regime_mixe) flags.push('Mixé');
    if (selected.viande_mixee) flags.push('Viande mixée');
    if (selected.regime_diabetique) flags.push('Diabétique');
    if (selected.epargne_intestinale) flags.push('Épargne intestinale');
    return flags.join(', ');
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
    const a: string[] = [];
    if (selected.allergie_poisson) a.push('Poisson');
    if (selected.allergie_autre) a.push(selected.allergie_autre);
    return a.join(', ');
  }, [selected]);

  const vaccinsText = useMemo(() => {
    if (!ctx) return '';
    const v: string[] = [];
    if (ctx.vaccination) {
      const annee = ctx.vaccination.year;
      const covid = [ctx.vaccination.covid_inj1, ctx.vaccination.covid_inj2, ctx.vaccination.covid_inj3].filter(Boolean).join(', ');
      const grippe = ctx.vaccination.grippe_inj1;
      if (covid) v.push(`COVID ${annee} : ${covid}`);
      if (grippe) v.push(`Grippe ${annee} : ${grippe}`);
      if (ctx.vaccination.infos) v.push(ctx.vaccination.infos);
    }
    if (ctx.vaccinationLT) {
      if (ctx.vaccinationLT.tetanos_date) v.push(`Tétanos : ${formatDate(ctx.vaccinationLT.tetanos_date)}`);
      if (ctx.vaccinationLT.pneumovax_date) v.push(`Pneumovax : ${formatDate(ctx.vaccinationLT.pneumovax_date)}`);
    }
    return v.join(' · ');
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
                <FieldRow label="Personne à prévenir :">{personnePrevenir || <span className="text-slate-400">—</span>}</FieldRow>
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
                  <CheckOption label="Oui" checked={form.personnePrevenue} onChange={v => patch('personnePrevenue', v)} />
                  <CheckOption label="Non" checked={!form.personnePrevenue} onChange={v => patch('personnePrevenue', !v)} />
                  <span className="font-semibold ml-4">Tutelle prévenue :</span>
                  <CheckOption label="Oui" checked={form.tutellePrevenue} onChange={v => patch('tutellePrevenue', v)} />
                  <CheckOption label="Non" checked={!form.tutellePrevenue} onChange={v => patch('tutellePrevenue', !v)} />
                </div>
              </div>

              {/* ── ENVIRONNEMENT ── */}
              <SectionTitle>Environnement familial et social</SectionTitle>
              <div className="space-y-1.5">
                <div>
                  <Label className="text-sm font-semibold">Situation familiale :</Label>
                  <Input
                    value={form.situationFamiliale}
                    onChange={e => patch('situationFamiliale', e.target.value)}
                    className="h-7 print:border-0 print:border-b print:rounded-none print:px-0"
                  />
                </div>
                <FieldRow label="Environnement :">Vit en établissement EHPAD La Fourrier</FieldRow>
                <div>
                  <Label className="text-sm font-semibold">Suivi social :</Label>
                  <Input
                    value={form.suiviSocial || ctx?.niveau?.tutelle || ''}
                    onChange={e => patch('suiviSocial', e.target.value)}
                    placeholder={ctx?.niveau?.tutelle ? `Tutelle : ${ctx.niveau.tutelle}` : ''}
                    className="h-7 print:border-0 print:border-b print:rounded-none print:px-0"
                  />
                </div>
              </div>

              {/* ── INTERVENANTS ── */}
              <SectionTitle>Intervenants</SectionTitle>
              <div className="space-y-1.5">
                <FieldRow label="Médecin traitant :">{selected.medecin || '—'}</FieldRow>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-semibold">Kiné :</span>
                  <CheckOption label="Oui" checked={form.kineActif} onChange={v => patch('kineActif', v)} />
                  <CheckOption label="Non" checked={!form.kineActif} onChange={v => patch('kineActif', !v)} />
                  <Input
                    value={form.kineDetail}
                    onChange={e => patch('kineDetail', e.target.value)}
                    placeholder="Nom / coordonnées"
                    className="h-7 flex-1 print:border-0 print:border-b print:rounded-none print:px-0"
                  />
                </div>
              </div>

              {/* ── VACCINATION / NIVEAU DE SOINS / GIR ── */}
              <SectionTitle>Vaccination / Niveau de soins / GIR</SectionTitle>
              <div className="space-y-1.5">
                <FieldRow label="Niveau de soins :">{ctx?.niveau?.niveau_soin || '—'}</FieldRow>
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
                  <CheckOption label="Autonome" checked={form.aideAlim === 'autonome'} onChange={() => patch('aideAlim', 'autonome')} />
                  <CheckOption label="Aide" checked={form.aideAlim === 'aide'} onChange={() => patch('aideAlim', 'aide')} />
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-semibold">Hydratation :</span>
                  <CheckOption label="Eau pétillante" checked={form.hydratation === 'petillante'} onChange={v => patch('hydratation', v ? 'petillante' : '')} />
                  <CheckOption label="Eau gélifiée" checked={form.hydratation === 'gelifiee'} onChange={v => patch('hydratation', v ? 'gelifiee' : '')} />
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
                  <CheckOption label="Chaise percée" checked={form.materielUrinaire.includes('chaise-percee')} onChange={() => toggleList('materielUrinaire', 'chaise-percee')} />
                </div>
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-semibold">SAD :</span>
                  <CheckOption label="Oui" checked={form.sadOui} onChange={v => patch('sadOui', v)} />
                  <CheckOption label="Non" checked={!form.sadOui} onChange={v => patch('sadOui', !v)} />
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
                <FieldRow label="Protection :">{ctx?.pec?.protection || <span className="text-slate-400">—</span>}</FieldRow>
              </div>

              {/* ── HYGIENE ── */}
              <SectionTitle>Hygiène et confort</SectionTitle>
              <div className="space-y-1.5">
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
                <div>
                  <Label className="text-sm font-semibold">Sommeil :</Label>
                  <Textarea
                    value={form.sommeil}
                    onChange={e => patch('sommeil', e.target.value)}
                    rows={2}
                    className="text-sm print:border print:border-slate-400"
                  />
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
                <div>
                  <Label className="text-sm font-semibold">État cutané :</Label>
                  <Textarea
                    value={form.etatCutane}
                    onChange={e => patch('etatCutane', e.target.value)}
                    rows={2}
                    className="text-sm print:border print:border-slate-400"
                  />
                </div>
                <FieldRow label="Matelas :">{matelasText || <span className="text-slate-400">—</span>}</FieldRow>
                <div>
                  <Label className="text-sm font-semibold">Localisation et stade de l&apos;escarre :</Label>
                  <Textarea
                    value={form.localisationEscarre}
                    onChange={e => patch('localisationEscarre', e.target.value)}
                    rows={2}
                    className="text-sm print:border print:border-slate-400"
                  />
                </div>
                <div>
                  <Label className="text-sm font-semibold">Localisation mycose :</Label>
                  <Input
                    value={form.localisationMycose}
                    onChange={e => patch('localisationMycose', e.target.value)}
                    className="h-7 print:border-0 print:border-b print:rounded-none print:px-0"
                  />
                </div>
                <div>
                  <Label className="text-sm font-semibold">Localisation pansement :</Label>
                  <Input
                    value={form.localisationPansement}
                    onChange={e => patch('localisationPansement', e.target.value)}
                    className="h-7 print:border-0 print:border-b print:rounded-none print:px-0"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-semibold">Ablation fils :</Label>
                    <Input
                      value={form.ablationFils}
                      onChange={e => patch('ablationFils', e.target.value)}
                      className="h-7 print:border-0 print:border-b print:rounded-none print:px-0"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Ablation agraffe :</Label>
                    <Input
                      value={form.ablationAgraffe}
                      onChange={e => patch('ablationAgraffe', e.target.value)}
                      className="h-7 print:border-0 print:border-b print:rounded-none print:px-0"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-semibold">KT posé le :</Label>
                  <Input
                    value={form.ktPoseLe}
                    onChange={e => patch('ktPoseLe', e.target.value)}
                    className="h-7 max-w-xs print:border-0 print:border-b print:rounded-none print:px-0"
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
