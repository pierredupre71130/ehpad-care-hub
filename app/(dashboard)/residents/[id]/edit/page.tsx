'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Save, X, Lock, Unlock, Loader2, AlertTriangle,
  ChevronDown, ChevronUp, LogOut, Trash2, ArrowLeft,
  User, Stethoscope, FileText, Utensils, Pill, Brain, ClipboardList, StickyNote,
} from 'lucide-react';
import { useModuleAccess } from '@/lib/use-module-access';
import { useEffectiveRole } from '@/lib/use-effective-role';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface PersonneAPrevenir {
  nom?: string; prenom?: string; adresse?: string;
  tel?: string; mobile?: string; lien?: string; personne_confiance?: boolean;
}
interface AutrePersonne {
  nom?: string; prenom?: string; lien?: string; adresse?: string; tel?: string;
}
interface TutelleCuratelle {
  type?: 'tutelle' | 'curatelle' | 'sauvegarde' | 'habilitation';
  nom?: string; tel?: string;
}
interface TuteurEntry { id: string; nom: string; tel: string; }
interface Respiration {
  normale?: boolean; dyspnee?: boolean;
  o2?: boolean; o2Debit?: string; o2Jour?: boolean; o2Nuit?: boolean;
  vni?: boolean; vniDebit?: string;
}
interface Comportement { coherent?: boolean; communique?: boolean; }
interface DSI {
  personne_prevenir?: PersonneAPrevenir; autres_personnes?: AutrePersonne[];
  motif_entree?: string; tutelle_curatelle?: TutelleCuratelle;
  respiration?: Respiration; comportement?: Comportement;
}
interface Resident {
  id: string; room: string; title: string; first_name: string; last_name: string;
  maiden_name?: string;
  situation_familiale?: '' | 'marie' | 'celibataire' | 'divorce' | 'veuf';
  date_naissance: string | null; date_entree: string | null;
  floor: 'RDC' | '1ER'; section: string; sort_order: number;
  annotations: string; medecin: string; referent: string;
  antecedents: string; allergie_medicamenteuse?: string;
  regime_mixe: boolean; viande_mixee: boolean; regime_diabetique: boolean;
  epargne_intestinale: boolean; allergie_poisson: boolean; allergie_autre?: string;
  traitement_ecrase: boolean; insuline_matin: boolean; insuline_soir: boolean;
  anticoagulants: boolean; appel_nuit: boolean;
  chaussettes_de_contention: boolean; bas_de_contention: boolean; bande_de_contention: boolean;
  archived?: boolean; date_sortie?: string | null; photo_url?: string;
  dsi?: DSI | null;
}

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────

const MEDECINS = ['Dr Carrat', 'Dr Benazet', 'Dr Barreau', 'Dr Sahraoui'];
const TITLES = ['Mme', 'Mr', 'Me', 'Dr'];
const DEFAULT_TUTEURS: TuteurEntry[] = [
  { id: 'default-1', nom: 'Hastings Antoine', tel: '0385882011' },
  { id: 'default-2', nom: 'Mme Organo',       tel: '0385883265' },
  { id: 'default-3', nom: 'Mme Ribeiro',      tel: '0385690404' },
  { id: 'default-4', nom: 'Mme Rodrigues',    tel: '0385883265' },
];
const MESURE_LABELS: Record<string, string> = {
  tutelle: 'Tutelle', curatelle: 'Curatelle',
  sauvegarde: 'Sauvegarde de justice', habilitation: 'Habilitation familiale',
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function calcAge(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const birth = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return `${age} ans`;
  } catch { return ''; }
}

function inferFloor(room: string): 'RDC' | '1ER' {
  const n = parseInt(room, 10);
  return !isNaN(n) && n >= 100 ? '1ER' : 'RDC';
}

function formatTutelle(tc: TutelleCuratelle | undefined | null): string {
  const parts: string[] = [];
  if (tc?.type) parts.push(MESURE_LABELS[tc.type] ?? tc.type);
  if (tc?.nom)  parts.push(tc.nom);
  if (tc?.tel)  parts.push(tc.tel);
  return parts.join(' — ');
}

// ─────────────────────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────────────────────

async function fetchResident(id: string): Promise<Resident> {
  const sb = createClient();
  const { data, error } = await sb.from('residents').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as Resident;
}

async function fetchTuteurs(): Promise<TuteurEntry[]> {
  const sb = createClient();
  const { data } = await sb.from('settings').select('value').eq('key', 'tuteurs_curators').maybeSingle();
  if (data?.value && Array.isArray(data.value)) return data.value as TuteurEntry[];
  return DEFAULT_TUTEURS;
}

async function saveResident(payload: Partial<Resident> & { id: string }): Promise<void> {
  const sb = createClient();
  const { id, ...updates } = payload;
  const { error } = await sb.from('residents').update(updates).eq('id', id);
  if (error) throw new Error(error.message);
  if ('dsi' in updates) {
    const tc = (updates.dsi as DSI | null)?.tutelle_curatelle;
    const combined = formatTutelle(tc);
    sb.from('niveau_soin')
      .update({ tutelle: combined })
      .eq('resident_id', id)
      .then((res: { error: unknown }) => { if (res.error) console.error('[sync dsi.tutelle → niveau_soin]', res.error); });
  }
}

// ─────────────────────────────────────────────────────────────
// COMPOSANTS UTILITAIRES
// ─────────────────────────────────────────────────────────────

function CheckField({ id, label, checked, onChange }: {
  id: string; label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={v => onChange(Boolean(v))} className="h-4 w-4 flex-shrink-0" />
      <Label htmlFor={id} className="text-sm text-slate-700 cursor-pointer font-normal leading-snug">{label}</Label>
    </div>
  );
}

function SectionCard({ icon, title, color, children }: {
  icon: ReactNode; title: string; color: string; children: ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 flex items-center gap-2.5" style={{ background: color }}>
        <span className="text-white/80">{icon}</span>
        <h2 className="text-sm font-bold text-white tracking-wide">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function SortieSection({ nomPrenom, onConfirm, disabled }: {
  nomPrenom: string; onConfirm: (dateSortie: string) => void; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  return (
    <div className="mt-2 border-t border-red-100">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 mt-3 text-xs text-red-400 hover:text-red-600 transition-colors"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sortie / Décès du résident
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-red-800">Enregistrer la sortie de {nomPrenom}</p>
          <p className="text-xs text-red-600 leading-relaxed">
            Le résident sera retiré des listes actives. Son historique de vaccination sera conservé dans la section « Résidents sortis ».
          </p>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-red-700">Date de sortie</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-sm border-red-300 w-44" />
            </div>
            <Button
              type="button"
              onClick={() => {
                if (confirm(`Confirmer la sortie de ${nomPrenom} le ${new Date(date + 'T12:00:00').toLocaleDateString('fr-FR')} ?\n\nCette action est irréversible depuis cette interface.`)) {
                  onConfirm(date);
                }
              }}
              disabled={disabled || !date}
              className="gap-2 bg-red-600 hover:bg-red-700 text-white h-9"
            >
              <LogOut className="h-4 w-4" /> Confirmer la sortie
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE PRINCIPALE
// ─────────────────────────────────────────────────────────────

export default function ResidentEditPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const access = useModuleAccess('residents');
  const readOnly = access === 'read';
  const isAdmin = useEffectiveRole() === 'admin';
  const queryClient = useQueryClient();

  const [form, setForm] = useState<Partial<Resident>>({});
  const [roomUnlocked, setRoomUnlocked] = useState(false);
  const [showRoomPwdDlg, setShowRoomPwdDlg] = useState(false);
  const [roomPwd, setRoomPwd] = useState('');
  const [roomPwdError, setRoomPwdError] = useState(false);

  const { data: resident, isLoading, error } = useQuery({
    queryKey: ['residents', id],
    queryFn: () => fetchResident(id),
    enabled: !!id,
  });

  const { data: tuteurs = DEFAULT_TUTEURS } = useQuery({
    queryKey: ['settings', 'tuteurs_curators'],
    queryFn: fetchTuteurs,
  });

  const [kineInfo, setKineInfo] = useState<{
    kine_nom: string; types_kine: string[]; notes: string; actif: boolean;
  } | null>(null);

  useEffect(() => {
    if (resident) {
      setForm({ ...resident });
      createClient()
        .from('kine_assignations')
        .select('kine_nom, types_kine, notes, actif')
        .eq('resident_id', resident.id)
        .limit(1)
        .then((res: { data: { kine_nom: string; types_kine: string[]; notes: string; actif: boolean }[] | null; error: { message: string } | null }) => {
          if (!res.error) setKineInfo(res.data?.[0] ?? null);
        });
    }
  }, [resident]);

  /* ── Mutations ── */
  const saveMutation = useMutation({
    mutationFn: saveResident,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      toast.success('Modifications sauvegardées ✓');
      router.push('/residents');
    },
    onError: (err: Error) => toast.error(`Erreur : ${err.message}`),
  });

  const archiveMutation = useMutation({
    mutationFn: async (dateSortie: string) => {
      const sb = createClient();
      const r = resident!;
      if (r.room) {
        await sb.from('prise_en_charge')
          .update({ nom: '', matin: '', apres_midi: '', protection: '', updated_at: new Date().toISOString() })
          .eq('chambre', r.room);
      }
      const { error: rErr } = await sb.from('residents')
        .update({ archived: true, date_sortie: dateSortie })
        .eq('id', id);
      if (rErr) throw new Error(rErr.message);
      await sb.from('vaccination').update({ archived: true }).eq('resident_id', id);
      if (r.room) {
        const newId = crypto.randomUUID();
        const { error: insErr } = await sb.from('residents').insert({
          id: newId, room: r.room, floor: r.floor, section: r.section, sort_order: r.sort_order,
          title: 'Mme', first_name: '', last_name: '', archived: false,
        });
        if (insErr) throw new Error(insErr.message);
        await sb.from('planning_bilan_cell').update({ resident_id: newId }).eq('resident_id', id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['vaccinations'] });
      queryClient.invalidateQueries({ queryKey: ['planning_bilan_cell'] });
      toast.success('Résident archivé — chambre libérée et conservée dans les listes');
      router.push('/residents');
    },
    onError: (err: Error) => toast.error(`Erreur : ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const sb = createClient();
      const { error } = await sb.from('residents').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      toast.success('Résident supprimé définitivement');
      router.push('/residents');
    },
    onError: (err: Error) => toast.error(`Erreur : ${err.message}`),
  });

  function patch(updates: Partial<Resident>) {
    setForm(prev => {
      const next = { ...prev, ...updates };
      if ('room' in updates) next.floor = inferFloor(updates.room ?? '');
      return next;
    });
  }

  function handleSave() {
    if (!form.room?.trim()) { toast.error('Le numéro de chambre est obligatoire'); return; }
    const payload = {
      ...form,
      id,
      date_naissance: form.date_naissance?.trim() || null,
      date_entree:    form.date_entree?.trim()    || null,
      date_sortie:    form.date_sortie?.trim()    || null,
    } as Partial<Resident> & { id: string };
    saveMutation.mutate(payload);
  }

  const isSaving = saveMutation.isPending || archiveMutation.isPending || deleteMutation.isPending;
  const nomPrenom = `${form.title ?? ''} ${(form.last_name ?? '').toUpperCase()} ${form.first_name ?? ''}`.trim();

  /* ── DSI helpers ── */
  const dsi = form.dsi ?? {};
  const pp   = dsi.personne_prevenir ?? {};
  const autres = dsi.autres_personnes ?? [];
  const resp = dsi.respiration ?? {};
  const comp = dsi.comportement ?? {};
  const tc   = dsi.tutelle_curatelle ?? {};

  const setDsi = (next: Partial<DSI>) => patch({ dsi: { ...dsi, ...next } });
  const setPP  = (next: Partial<PersonneAPrevenir>) => setDsi({ personne_prevenir: { ...pp, ...next } });
  const setResp = (next: Partial<Respiration>) => setDsi({ respiration: { ...resp, ...next } });
  const setComp = (next: Partial<Comportement>) => setDsi({ comportement: { ...comp, ...next } });
  const setTC   = (next: Partial<TutelleCuratelle>) => setDsi({ tutelle_curatelle: { ...tc, ...next } });
  const updateAutre = (i: number, next: Partial<AutrePersonne>) => {
    const copy = [...autres]; copy[i] = { ...copy[i], ...next };
    setDsi({ autres_personnes: copy });
  };
  const addAutre = () => setDsi({ autres_personnes: [...autres, {}] });
  const removeAutre = (i: number) => setDsi({ autres_personnes: autres.filter((_, j) => j !== i) });

  const sitFeminin = (() => {
    const t = (form.title ?? '').toLowerCase().replace(/\./g, '').trim();
    return t === 'mme' || t === 'me' || t === 'mlle' || t === 'madame' || t === 'mademoiselle';
  })();
  const sit = form.situation_familiale ?? '';
  const setSit = (v: typeof sit) => patch({ situation_familiale: sit === v ? '' : v });

  /* ── Render ── */
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#dde4ee' }}>
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Chargement du dossier…</span>
        </div>
      </div>
    );
  }

  if (error || !resident) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#dde4ee' }}>
        <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-sm text-center shadow-lg">
          <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-slate-800 mb-1">Résident introuvable</p>
          <p className="text-sm text-slate-500 mb-4">{(error as Error)?.message ?? 'Aucune donnée.'}</p>
          <Link href="/residents" className="text-sm text-blue-600 hover:underline">← Retour à la liste</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <header style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}>
        <div className="max-w-3xl mx-auto px-6 py-5">
          <div className="flex items-center gap-2 text-white/50 text-xs mb-3">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <span>›</span>
            <Link href="/residents" className="hover:text-white/80 transition-colors">Résidents</Link>
            <span>›</span>
            <span className="text-white/75">Édition</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-extrabold text-white leading-tight">
                {nomPrenom || 'Édition résident'}
              </h1>
              <p className="text-sm text-white/50 mt-0.5">
                Ch. {form.room || '—'} · {form.floor} · {form.section}
              </p>
            </div>
            <Link
              href="/residents"
              className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Retour
            </Link>
          </div>
        </div>
      </header>

      {/* ══ CONTENU ══════════════════════════════════════════════ */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-16">

        {readOnly && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700 font-medium">
            Vous consultez ce dossier en lecture seule.
          </div>
        )}

        {/* ── 1. IDENTITÉ ──────────────────────────────────────── */}
        <SectionCard icon={<User className="h-4 w-4" />} title="Identité" color="#1d4ed8">
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

              {/* Chambre — protégée */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Chambre *</Label>
                <div className="relative">
                  <Input
                    value={form.room ?? ''}
                    onChange={e => patch({ room: e.target.value })}
                    disabled={!roomUnlocked}
                    placeholder="Ex : 12"
                    className={cn('h-9 text-sm pr-9', !roomUnlocked && 'bg-slate-100 cursor-not-allowed text-slate-400')}
                  />
                  <button
                    type="button"
                    onClick={!roomUnlocked ? () => { setRoomPwd(''); setRoomPwdError(false); setShowRoomPwdDlg(true); } : undefined}
                    className={cn(
                      'absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors',
                      roomUnlocked ? 'text-emerald-500 cursor-default' : 'text-slate-400 hover:text-blue-600 cursor-pointer'
                    )}
                    title={roomUnlocked ? 'Chambre déverrouillée' : 'Cliquer pour déverrouiller — mot de passe admin requis'}
                  >
                    {roomUnlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  {roomUnlocked
                    ? (form.room ? `Étage détecté : ${inferFloor(form.room)}` : 'Saisir le numéro')
                    : '🔒 Cliquer sur le cadenas pour modifier'}
                </p>
              </div>

              {/* Section */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Section</Label>
                <Select value={form.section ?? 'Mapad'} onValueChange={v => patch({ section: v })} disabled={!roomUnlocked}>
                  <SelectTrigger className={cn('h-9 text-sm', !roomUnlocked && 'bg-slate-100 cursor-not-allowed text-slate-400')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Mapad">MAPAD</SelectItem>
                    <SelectItem value="Long Séjour">Long Séjour</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-400 leading-tight">
                  {roomUnlocked ? 'Partie sur la feuille de consignes' : '🔒 Déverrouiller la chambre'}
                </p>
              </div>

              {/* Titre */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Titre</Label>
                <Select value={form.title ?? 'Mme'} onValueChange={v => patch({ title: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TITLES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Prénom */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Prénom</Label>
                <Input value={form.first_name ?? ''} onChange={e => patch({ first_name: e.target.value })} placeholder="Prénom" className="h-9 text-sm" />
              </div>

              {/* Nom */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Nom *</Label>
                <Input value={form.last_name ?? ''} onChange={e => patch({ last_name: e.target.value })} placeholder="NOM DE FAMILLE" className="h-9 text-sm uppercase" />
              </div>

              {/* Nom de jeune fille */}
              <div className="space-y-1 col-span-2">
                <Label className="text-xs font-semibold text-slate-600">Nom de jeune fille</Label>
                <Input value={form.maiden_name ?? ''} onChange={e => patch({ maiden_name: e.target.value })} placeholder="NOM DE JEUNE FILLE" className="h-9 text-sm uppercase" />
              </div>
            </div>

            {/* Situation familiale */}
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1.5 block">Situation familiale</Label>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <CheckField id="e_sit_marie"      label={sitFeminin ? 'Mariée'    : 'Marié'}    checked={sit === 'marie'}      onChange={() => setSit('marie')} />
                <CheckField id="e_sit_celibataire" label="Célibataire"                           checked={sit === 'celibataire'} onChange={() => setSit('celibataire')} />
                <CheckField id="e_sit_divorce"     label={sitFeminin ? 'Divorcée' : 'Divorcé'}  checked={sit === 'divorce'}    onChange={() => setSit('divorce')} />
                <CheckField id="e_sit_veuf"        label={sitFeminin ? 'Veuve'    : 'Veuf'}     checked={sit === 'veuf'}       onChange={() => setSit('veuf')} />
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ── 2. INFORMATIONS MÉDICALES ────────────────────────── */}
        <SectionCard icon={<Stethoscope className="h-4 w-4" />} title="Informations médicales" color="#0f766e">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-600">Date de naissance</Label>
              <Input type="date" value={form.date_naissance ?? ''} onChange={e => patch({ date_naissance: e.target.value })} className="h-9 text-sm" />
              {form.date_naissance && <p className="text-[10px] text-slate-400">→ {calcAge(form.date_naissance)}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-600">Date d&apos;entrée</Label>
              <Input type="date" value={form.date_entree ?? ''} onChange={e => patch({ date_entree: e.target.value })} className="h-9 text-sm" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs font-semibold text-slate-600">Médecin traitant</Label>
              <Select value={form.medecin || '_none'} onValueChange={v => patch({ medecin: v === '_none' ? '' : v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="— Choisir —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Aucun —</SelectItem>
                  {MEDECINS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SectionCard>

        {/* ── 3. ANTÉCÉDENTS ───────────────────────────────────── */}
        <SectionCard icon={<FileText className="h-4 w-4" />} title="Antécédents" color="#b45309">
          <div className="space-y-3">
            <Textarea
              value={form.antecedents ?? ''}
              onChange={e => patch({ antecedents: e.target.value })}
              rows={4}
              placeholder="Antécédents médicaux, chirurgicaux, allergies, traitements lourds…"
              className="text-sm resize-y"
            />
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">Allergie médicamenteuse</Label>
              <Input
                value={form.allergie_medicamenteuse ?? ''}
                onChange={e => patch({ allergie_medicamenteuse: e.target.value })}
                placeholder="Ex : pénicilline, codéine, AINS…"
                className="text-sm"
              />
            </div>
          </div>
        </SectionCard>

        {/* ── 4. RÉGIMES ALIMENTAIRES ──────────────────────────── */}
        <SectionCard icon={<Utensils className="h-4 w-4" />} title="Régimes alimentaires" color="#c2410c">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <CheckField id="e_regime_diabetique"   label="Régime diabétique"  checked={form.regime_diabetique   ?? false} onChange={v => patch({ regime_diabetique: v })} />
              <CheckField id="e_epargne_intestinale" label="Épargne intestinale" checked={form.epargne_intestinale ?? false} onChange={v => patch({ epargne_intestinale: v })} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">⚠ Autre allergie alimentaire</Label>
              <Input
                value={form.allergie_autre ?? ''}
                onChange={e => patch({ allergie_autre: e.target.value })}
                placeholder="Ex : arachides, lactose, gluten, fraises…"
                className="text-sm"
              />
              <p className="text-[10px] text-slate-400 mt-1">Apparaîtra sur la fiche résident et les étiquettes repas.</p>
            </div>
          </div>
        </SectionCard>

        {/* ── 5. TRAITEMENTS PARTICULIERS ──────────────────────── */}
        <SectionCard icon={<Pill className="h-4 w-4" />} title="Traitements particuliers" color="#6d28d9">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <CheckField id="e_traitement_ecrase"         label="Traitement écrasé"          checked={form.traitement_ecrase         ?? false} onChange={v => patch({ traitement_ecrase: v })} />
              <CheckField id="e_insuline_matin"            label="Insuline matin ☀"           checked={form.insuline_matin            ?? false} onChange={v => patch({ insuline_matin: v })} />
              <CheckField id="e_insuline_soir"             label="Insuline soir 🌙"           checked={form.insuline_soir             ?? false} onChange={v => patch({ insuline_soir: v })} />
              <CheckField id="e_anticoagulants"            label="Anticoagulants"              checked={form.anticoagulants            ?? false} onChange={v => patch({ anticoagulants: v })} />
              <CheckField id="e_chaussettes_de_contention" label="Chaussettes de contention"  checked={form.chaussettes_de_contention ?? false} onChange={v => patch({ chaussettes_de_contention: v })} />
              <CheckField id="e_bas_de_contention"         label="Bas de contention"           checked={form.bas_de_contention         ?? false} onChange={v => patch({ bas_de_contention: v })} />
              <CheckField id="e_bande_de_contention"       label="Bande de contention"         checked={form.bande_de_contention       ?? false} onChange={v => patch({ bande_de_contention: v })} />
              {/* Appel nuit — lecture seule, géré via GIR */}
              <div className="flex items-center gap-2 opacity-60 cursor-not-allowed select-none" title="Modifiable uniquement depuis la page GIR / Niveau de soin">
                <div className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${form.appel_nuit ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 bg-white'}`}>
                  {form.appel_nuit && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </div>
                <span className="text-sm text-slate-500 font-normal leading-snug">Appel nuit <span className="text-[10px] text-slate-400">(via GIR)</span></span>
              </div>
            </div>

            {/* Respiration */}
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Respiration</p>
              <div className="flex flex-wrap gap-4">
                <CheckField id="e_resp_normale" label="Normale" checked={resp.normale ?? false} onChange={v => setResp({ normale: v, dyspnee: v ? false : resp.dyspnee })} />
                <CheckField id="e_resp_dyspnee" label="Dyspnée" checked={resp.dyspnee ?? false} onChange={v => setResp({ dyspnee: v, normale: v ? false : resp.normale })} />
              </div>
              <div className="flex flex-wrap gap-4 items-center">
                <span className="text-sm font-semibold text-slate-700">O2 :</span>
                <CheckField id="e_o2_oui" label="Oui" checked={resp.o2 === true}  onChange={v => setResp({ o2: v ? true  : undefined })} />
                <CheckField id="e_o2_non" label="Non" checked={resp.o2 === false} onChange={v => setResp({ o2: v ? false : undefined })} />
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-slate-600">Débit :</Label>
                  <Input value={resp.o2Debit ?? ''} onChange={e => setResp({ o2Debit: e.target.value })} placeholder="ex : 2L/min" className="h-8 w-28 text-sm" />
                </div>
                <CheckField id="e_o2_jour" label="Jour" checked={resp.o2Jour ?? false} onChange={v => setResp({ o2Jour: v })} />
                <CheckField id="e_o2_nuit" label="Nuit" checked={resp.o2Nuit ?? false} onChange={v => setResp({ o2Nuit: v })} />
              </div>
              <div className="flex flex-wrap gap-4 items-center">
                <span className="text-sm font-semibold text-slate-700">VNI :</span>
                <CheckField id="e_vni_oui" label="Oui" checked={resp.vni === true}  onChange={v => setResp({ vni: v ? true  : undefined })} />
                <CheckField id="e_vni_non" label="Non" checked={resp.vni === false} onChange={v => setResp({ vni: v ? false : undefined })} />
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-slate-600">Débit :</Label>
                  <Input value={resp.vniDebit ?? ''} onChange={e => setResp({ vniDebit: e.target.value })} placeholder="ex : réglages…" className="h-8 w-36 text-sm" />
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ── 6. COMPORTEMENT ──────────────────────────────────── */}
        <SectionCard icon={<Brain className="h-4 w-4" />} title="Comportement" color="#475569">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">Cohérent :</span>
              <CheckField id="e_coherent_oui" label="Oui" checked={comp.coherent === true}  onChange={v => setComp({ coherent: v ? true  : undefined })} />
              <CheckField id="e_coherent_non" label="Non" checked={comp.coherent === false} onChange={v => setComp({ coherent: v ? false : undefined })} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">Communique :</span>
              <CheckField id="e_communique_oui" label="Oui" checked={comp.communique === true}  onChange={v => setComp({ communique: v ? true  : undefined })} />
              <CheckField id="e_communique_non" label="Non" checked={comp.communique === false} onChange={v => setComp({ communique: v ? false : undefined })} />
            </div>
          </div>
        </SectionCard>

        {/* ── 7. DSI — DOSSIER DE SOINS INFIRMIERS ─────────────── */}
        <SectionCard icon={<ClipboardList className="h-4 w-4" />} title="Dossier de Soins Infirmiers" color="#0e7490">
          <div className="space-y-6">

            {/* Kinésithérapie — lecture seule */}
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-2 block">Suivi médical — Kinésithérapie</Label>
              {kineInfo ? (
                <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${kineInfo.actif ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {kineInfo.actif ? 'Actif' : 'Inactif'}
                    </span>
                    {kineInfo.kine_nom && <span className="text-xs text-slate-600 font-medium">{kineInfo.kine_nom}</span>}
                  </div>
                  {kineInfo.types_kine.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {kineInfo.types_kine.map(t => (
                        <span key={t} className="text-[11px] bg-teal-100 text-teal-700 border border-teal-200 rounded-full px-2 py-0.5 font-medium">{t}</span>
                      ))}
                    </div>
                  )}
                  {kineInfo.notes && <p className="text-xs text-slate-500 mt-1 italic">{kineInfo.notes}</p>}
                  <p className="text-[10px] text-teal-600 mt-1">
                    Gérez les détails dans le <a href="/kine" className="underline font-medium">module Kinésithérapie</a>.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400 italic">
                  Aucune assignation kiné. <a href="/kine" className="underline text-teal-600">Ajouter dans le module Kinésithérapie</a>.
                </div>
              )}
            </div>

            {/* Motif d'entrée */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-semibold text-slate-700">Motif d&apos;entrée</Label>
                <Textarea
                  value={dsi.motif_entree ?? ''}
                  onChange={e => setDsi({ motif_entree: e.target.value })}
                  rows={2}
                  className="text-sm resize-y"
                  placeholder="Raison de l'admission en EHPAD…"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Date d&apos;entrée</Label>
                <Input type="date" value={form.date_entree ?? ''} onChange={e => patch({ date_entree: e.target.value })} className="h-9 text-sm" />
              </div>
            </div>

            {/* Mesure de protection judiciaire */}
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-2 block">Mesure de protection judiciaire</Label>
              <div className="flex flex-wrap gap-3 mb-3">
                <CheckField id="e_dsi_tutelle"        label="Tutelle"                 checked={tc.type === 'tutelle'}        onChange={v => setTC({ type: v ? 'tutelle'        : undefined })} />
                <CheckField id="e_dsi_curatelle"      label="Curatelle"               checked={tc.type === 'curatelle'}      onChange={v => setTC({ type: v ? 'curatelle'      : undefined })} />
                <CheckField id="e_dsi_sauvegarde"     label="Sauvegarde de justice"   checked={tc.type === 'sauvegarde'}    onChange={v => setTC({ type: v ? 'sauvegarde'     : undefined })} />
                <CheckField id="e_dsi_habilitation"   label="Habilitation familiale"  checked={tc.type === 'habilitation'}  onChange={v => setTC({ type: v ? 'habilitation'   : undefined })} />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">Nom du responsable</Label>
                  <Input value={tc.nom ?? ''} onChange={e => setTC({ nom: e.target.value })} placeholder="Ex : Me Dupont…" className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">Téléphone</Label>
                  <Input value={tc.tel ?? ''} onChange={e => setTC({ tel: e.target.value })} className="h-9 text-sm" />
                </div>
              </div>
              {tuteurs.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-400 mb-1.5">Sélection rapide :</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tuteurs.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTC({ nom: t.nom, tel: t.tel })}
                        className={cn(
                          'px-2 py-1 rounded-full text-xs border transition-colors',
                          tc.nom === t.nom && tc.tel === t.tel
                            ? 'bg-purple-100 border-purple-400 text-purple-800 font-semibold'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-purple-300 hover:text-purple-700'
                        )}
                      >
                        {t.nom}{t.tel ? ` · ${t.tel}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Personne à prévenir */}
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-2 block">Personne à prévenir / informer prioritairement</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">Nom</Label>
                  <Input value={pp.nom ?? ''} onChange={e => setPP({ nom: e.target.value })} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">Prénom</Label>
                  <Input value={pp.prenom ?? ''} onChange={e => setPP({ prenom: e.target.value })} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">Lien de parenté</Label>
                  <Input value={pp.lien ?? ''} onChange={e => setPP({ lien: e.target.value })} placeholder="Ex : fils, épouse…" className="h-9 text-sm" />
                </div>
                <div className="space-y-1 col-span-2 sm:col-span-3">
                  <Label className="text-[10px] text-slate-500">Adresse</Label>
                  <Input value={pp.adresse ?? ''} onChange={e => setPP({ adresse: e.target.value })} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">Téléphone fixe</Label>
                  <Input value={pp.tel ?? ''} onChange={e => setPP({ tel: e.target.value })} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">Téléphone portable</Label>
                  <Input value={pp.mobile ?? ''} onChange={e => setPP({ mobile: e.target.value })} className="h-9 text-sm" />
                </div>
                <div className="flex items-end pb-1">
                  <CheckField id="e_personne_confiance" label="Personne de confiance" checked={pp.personne_confiance ?? false} onChange={v => setPP({ personne_confiance: v })} />
                </div>
              </div>
            </div>

            {/* Autres personnes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-semibold text-slate-700">Autres personnes pouvant être informées</Label>
                <Button type="button" variant="outline" size="sm" onClick={addAutre} className="h-7 text-xs gap-1">
                  + Ajouter une personne
                </Button>
              </div>
              {autres.length === 0 && <p className="text-xs text-slate-400 italic">Aucune autre personne renseignée.</p>}
              <div className="space-y-3">
                {autres.map((a, i) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold text-slate-500">Personne #{i + 1}</span>
                      <button type="button" onClick={() => removeAutre(i)} className="text-[11px] text-red-500 hover:text-red-700">Supprimer</button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500">Nom</Label>
                        <Input value={a.nom ?? ''} onChange={e => updateAutre(i, { nom: e.target.value })} className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500">Prénom</Label>
                        <Input value={a.prenom ?? ''} onChange={e => updateAutre(i, { prenom: e.target.value })} className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500">Lien</Label>
                        <Input value={a.lien ?? ''} onChange={e => updateAutre(i, { lien: e.target.value })} className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <Label className="text-[10px] text-slate-500">Adresse</Label>
                        <Input value={a.adresse ?? ''} onChange={e => updateAutre(i, { adresse: e.target.value })} className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500">Téléphone</Label>
                        <Input value={a.tel ?? ''} onChange={e => updateAutre(i, { tel: e.target.value })} className="h-9 text-sm" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ── 8. ANNOTATIONS ───────────────────────────────────── */}
        <SectionCard icon={<StickyNote className="h-4 w-4" />} title="Annotations / Consignes spéciales" color="#64748b">
          <Textarea
            value={form.annotations ?? ''}
            onChange={e => patch({ annotations: e.target.value })}
            placeholder="Notes médicales, consignes particulières, informations utiles pour l'équipe soignante…"
            rows={4}
            className="text-sm resize-none"
          />
        </SectionCard>

        {/* ── ACTIONS ───────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mb-4">
            <span className="text-amber-500 text-base leading-none mt-0.5">💾</span>
            <p className="text-xs text-amber-700 leading-snug">
              <span className="font-semibold">N&apos;oubliez pas d&apos;enregistrer !</span>
              {' '}Cliquez sur « Sauvegarder les modifications » pour confirmer vos changements.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSave} disabled={isSaving || readOnly} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              {isSaving
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Sauvegarde en cours…</>
                : <><Save className="h-4 w-4" /> Sauvegarder les modifications</>}
            </Button>
            <Button variant="outline" onClick={() => router.push('/residents')} disabled={isSaving} className="gap-1.5">
              <X className="h-4 w-4" /> Annuler
            </Button>
            <span className="text-xs text-slate-300">* Champs requis</span>
          </div>

          {/* Sortie du résident */}
          <SortieSection
            nomPrenom={nomPrenom}
            onConfirm={dateSortie => archiveMutation.mutate(dateSortie)}
            disabled={isSaving}
          />

          {/* Suppression définitive — admin uniquement */}
          {isAdmin && (
            <div className="pt-3 mt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  if (confirm('Supprimer définitivement ce résident ? Cette action est irréversible.')) {
                    deleteMutation.mutate();
                  }
                }}
                className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" /> Supprimer définitivement ce résident
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Dialog déverrouillage chambre */}
      <Dialog open={showRoomPwdDlg} onOpenChange={v => { setShowRoomPwdDlg(v); setRoomPwdError(false); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4 text-slate-500" /> Déverrouiller chambre &amp; section
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">Saisissez le mot de passe administrateur pour modifier le numéro de chambre et la section.</p>
          <form
            onSubmit={e => {
              e.preventDefault();
              if (roomPwd === 'mapad2022') {
                setRoomUnlocked(true);
                setShowRoomPwdDlg(false);
                setRoomPwdError(false);
              } else {
                setRoomPwdError(true);
              }
            }}
            className="space-y-3 pt-1"
          >
            <Input
              type="password"
              placeholder="Mot de passe"
              value={roomPwd}
              onChange={e => { setRoomPwd(e.target.value); setRoomPwdError(false); }}
              autoFocus
              className={roomPwdError ? 'border-red-400 focus-visible:ring-red-300' : ''}
            />
            {roomPwdError && <p className="text-xs text-red-600">Mot de passe incorrect.</p>}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">Déverrouiller</Button>
              <Button type="button" variant="outline" onClick={() => setShowRoomPwdDlg(false)}>Annuler</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
