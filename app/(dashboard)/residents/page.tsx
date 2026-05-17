'use client';

/**
 * Gestion des Résidents — Next.js 15 + Supabase
 * Prérequis shadcn : npx shadcn@latest add checkbox textarea select
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Pencil, Save, X, Lock, Unlock,
  Loader2, UserPlus, Users, AlertTriangle,
  Stethoscope, Key, LogOut, ChevronDown, ChevronUp, Camera, Trash2, Home, Eye,
} from 'lucide-react';
import { useModuleAccess } from '@/lib/use-module-access';
import { useAuth } from '@/lib/auth-context';
import { useEffectiveRole } from '@/lib/use-effective-role';
import Link from 'next/link';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

import { createClient }        from '@/lib/supabase/client';
import { Button }              from '@/components/ui/button';
import { Input }               from '@/components/ui/input';
import { Checkbox }            from '@/components/ui/checkbox';
import { Label }               from '@/components/ui/label';
import { Textarea }            from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
}                              from '@/components/ui/select';
import { cn }                  from '@/lib/utils';
import { AdminUnlockDialog }   from '@/components/dashboard/admin-unlock-dialog';

// ─────────────────────────────────────────────────────────────
// HEADER COMPONENTS
// ─────────────────────────────────────────────────────────────

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

function CaduceusIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="19" cy="19" r="18" fill="white" fillOpacity="0.15" />
      <line x1="19" y1="5" x2="19" y2="33" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <path d="M13 9.5 Q10 5 14 4 Q17 3 19 6 Q21 3 24 4 Q28 5 25 9.5" stroke="white" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      <path d="M19 10 Q13 13.5 15 17 Q17 20 19 19 Q21 18 23 21 Q25 24.5 19 28" stroke="white" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
      <path d="M19 10 Q25 13.5 23 17 Q21 20 19 19 Q17 18 15 21 Q13 24.5 19 28" stroke="white" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface Resident {
  id: string;
  room: string;
  title: string;
  first_name: string;
  last_name: string;
  date_naissance: string | null;
  date_entree: string | null;
  floor: 'RDC' | '1ER';
  section: string;
  sort_order: number;
  annotations: string;
  medecin: string;
  referent: string;
  // Régimes alimentaires
  regime_mixe: boolean;
  viande_mixee: boolean;
  regime_diabetique: boolean;
  epargne_intestinale: boolean;
  allergie_poisson: boolean;
  allergie_autre?: string;
  // Traitements
  traitement_ecrase: boolean;
  insuline_matin: boolean;
  insuline_soir: boolean;
  anticoagulants: boolean;
  appel_nuit: boolean;
  chaussettes_de_contention: boolean;
  bas_de_contention: boolean;
  bande_de_contention: boolean;
  // Sortie
  archived?: boolean;
  date_sortie?: string | null;
  // Photo
  photo_url?: string;
}

type FloorFilter = 'TOUS' | 'RDC' | '1ER';

interface DoctorConfig { name: string; color: string; }
interface FloorCodes { digicode_porte: string; digicode_entree: string; mdp_ordi: string; }

const DEFAULT_DOCTORS: DoctorConfig[] = [
  { name: 'Dr Carrat',   color: '#ef4444' },
  { name: 'Dr Benazet',  color: '#f9a8d4' },
  { name: 'Dr Barreau',  color: '#22c55e' },
  { name: 'Dr Sahraoui', color: '#cbd5e1' },
];
const DEFAULT_CODES: Record<string, FloorCodes> = {
  RDC:  { digicode_porte: '', digicode_entree: '', mdp_ordi: '' },
  '1ER': { digicode_porte: '', digicode_entree: '', mdp_ordi: '' },
};
// ─────────────────────────────────────────────────────────────
// SETTINGS SUPABASE
// ─────────────────────────────────────────────────────────────

async function fetchSetting<T>(key: string, fallback: T): Promise<T> {
  const sb = createClient();
  const { data } = await sb.from('settings').select('value').eq('key', key).maybeSingle();
  return data ? (data.value as T) : fallback;
}

async function saveSetting(key: string, value: unknown): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────

const MEDECINS = ['Dr Carrat', 'Dr Benazet', 'Dr Barreau', 'Dr Sahraoui'];
const TITLES   = ['Mme', 'Mr', 'Me', 'Dr'];

const REGIME_BADGES = [
  { key: 'regime_mixe'         as keyof Resident, label: 'Mixé',             cls: 'bg-orange-100 text-orange-700 border-orange-300' },
  { key: 'viande_mixee'        as keyof Resident, label: 'Viande mixée',     cls: 'bg-amber-100  text-amber-700  border-amber-300'  },
  { key: 'regime_diabetique'   as keyof Resident, label: 'Diabétique',       cls: 'bg-blue-100   text-blue-700   border-blue-300'   },
  { key: 'epargne_intestinale' as keyof Resident, label: 'Épargne int.',     cls: 'bg-green-100  text-green-700  border-green-300'  },
  { key: 'allergie_poisson'    as keyof Resident, label: '⚠ Poisson',        cls: 'bg-red-100    text-red-700    border-red-300'    },
  { key: 'allergie_autre'      as keyof Resident, label: '⚠ Allergie',       cls: 'bg-red-100    text-red-700    border-red-300'    },
];

const TRAITEMENT_BADGES = [
  { key: 'traitement_ecrase' as keyof Resident, label: 'Écrasé',      cls: 'bg-purple-100 text-purple-700 border-purple-300' },
  { key: 'insuline_matin'    as keyof Resident, label: 'Insuline ☀',  cls: 'bg-cyan-100   text-cyan-700   border-cyan-300'   },
  { key: 'insuline_soir'     as keyof Resident, label: 'Insuline 🌙', cls: 'bg-cyan-100   text-cyan-700   border-cyan-300'   },
  { key: 'anticoagulants'    as keyof Resident, label: 'Anticoag.',   cls: 'bg-rose-100   text-rose-700   border-rose-300'   },
  { key: 'appel_nuit'              as keyof Resident, label: 'Appel nuit',             cls: 'bg-indigo-100 text-indigo-700 border-indigo-300' },
  { key: 'chaussettes_de_contention' as keyof Resident, label: 'Chaussettes de contention', cls: 'bg-sky-100    text-sky-700    border-sky-300'    },
  { key: 'bas_de_contention'       as keyof Resident, label: 'Bas de contention',      cls: 'bg-slate-200  text-slate-800  border-slate-400'  },
  { key: 'bande_de_contention'     as keyof Resident, label: 'Bande de contention',    cls: 'bg-amber-100  text-amber-700  border-amber-300'  },
];

const EMPTY_FORM: Omit<Resident, 'id'> = {
  room: '', title: 'Mme', first_name: '', last_name: '',
  date_naissance: '', date_entree: '',
  floor: 'RDC', section: 'MAPAD', sort_order: 999,
  annotations: '', medecin: '', referent: '',
  regime_mixe: false, viande_mixee: false, regime_diabetique: false,
  epargne_intestinale: false, allergie_poisson: false, allergie_autre: '',
  traitement_ecrase: false, insuline_matin: false, insuline_soir: false,
  anticoagulants: false, appel_nuit: false,
  chaussettes_de_contention: false, bas_de_contention: false, bande_de_contention: false,
  archived: false, date_sortie: '',
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

// ─────────────────────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────────────────────

async function fetchResidents(): Promise<Resident[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('residents')
    .select('*')
    .order('floor',      { ascending: true })
    .order('sort_order', { ascending: true })
    .order('room',       { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Resident[];
}

async function saveResident(
  payload: Partial<Resident> & { id?: string }
): Promise<void> {
  const sb = createClient();
  if (payload.id) {
    const { id, ...updates } = payload;
    const { error } = await sb.from('residents').update(updates).eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb.from('residents').insert(payload);
    if (error) throw new Error(error.message);
  }
}

// ─────────────────────────────────────────────────────────────
// COMPOSANTS UTILITAIRES
// ─────────────────────────────────────────────────────────────

function FloorBadge({ floor }: { floor: string }) {
  return (
    <span className={cn(
      'inline-block text-[9px] font-bold px-1.5 py-0.5 rounded leading-none',
      floor === 'RDC' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'
    )}>
      {floor}
    </span>
  );
}

function AllBadges({ r }: { r: Resident }) {
  const active = [
    ...REGIME_BADGES.filter(b => {
      const v = r[b.key];
      return typeof v === 'string' ? v.trim().length > 0 : !!v;
    }),
    ...TRAITEMENT_BADGES.filter(b => r[b.key]),
  ];
  if (!active.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {active.map(b => {
        const v = r[b.key];
        const text = b.key === 'allergie_autre' && typeof v === 'string'
          ? `⚠ ${v}`
          : b.label;
        return (
          <span
            key={String(b.key)}
            className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded border leading-none', b.cls)}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}

function CheckField({
  id, label, checked, onChange,
}: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={v => onChange(Boolean(v))}
        className="h-4 w-4 flex-shrink-0"
      />
      <Label htmlFor={id} className="text-sm text-slate-700 cursor-pointer font-normal leading-snug">
        {label}
      </Label>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BOUTON UPLOAD PHOTO
// ─────────────────────────────────────────────────────────────

function ResidentPhotoButton({ resident, onUploaded }: {
  resident: Resident;
  onUploaded: (path: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const sb = createClient();
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${resident.id}.${ext}`;
      const { error: upErr } = await sb.storage
        .from('resident-photos')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw new Error(upErr.message);
      const { error: updErr } = await sb
        .from('residents').update({ photo_url: path }).eq('id', resident.id);
      if (updErr) throw new Error(updErr.message);
      onUploaded(path);
      toast.success('Photo enregistrée');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title={resident.photo_url ? 'Changer la photo' : 'Ajouter une photo'}
        className={cn(
          'h-8 gap-1.5 text-xs',
          resident.photo_url
            ? 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'
            : 'text-slate-300 hover:text-blue-500 hover:bg-blue-50'
        )}
      >
        {uploading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Camera className="h-3.5 w-3.5" />
        }
        <span className="hidden sm:inline">
          {resident.photo_url ? 'Photo ✓' : 'Photo'}
        </span>
      </Button>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// LIGNE RÉSIDENT (mode lecture)
// ─────────────────────────────────────────────────────────────

function ResidentRow({
  r, onEdit, onPhotoUploaded, dimmed, readOnly,
}: { r: Resident; onEdit: () => void; onPhotoUploaded: (path: string) => void; dimmed: boolean; readOnly?: boolean }) {
  return (
    <div className={cn(
      'flex items-start gap-3 px-4 py-3.5 border-b border-slate-100 last:border-0',
      'hover:bg-blue-50/30 transition-colors',
      dimmed && 'opacity-20 pointer-events-none select-none',
    )}>
      {/* Chambre + étage */}
      <div className="flex-shrink-0 w-14 text-center pt-0.5">
        <div className="text-base font-bold text-slate-800 tabular-nums leading-none">
          {r.room || '—'}
        </div>
        <div className="mt-1.5"><FloorBadge floor={r.floor} /></div>
      </div>

      {/* Identité, badges, annotations */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 leading-tight">
          {r.title}{' '}
          <span className="uppercase">{r.last_name}</span>{' '}
          {r.first_name}
          {r.date_naissance && (
            <span className="ml-2 text-xs font-normal text-slate-400">
              {calcAge(r.date_naissance)}
            </span>
          )}
        </p>
        {r.medecin && (
          <p className="text-xs text-slate-400 mt-0.5">{r.medecin}</p>
        )}
        <AllBadges r={r} />
        {r.annotations && (
          <p className="text-[11px] text-slate-400 mt-1 italic line-clamp-2 max-w-2xl">
            {r.annotations}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 pt-0.5 flex items-center gap-1">
        <ResidentPhotoButton resident={r} onUploaded={onPhotoUploaded} />
        {!readOnly && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-8 gap-1.5 text-xs text-slate-400 hover:text-blue-600 hover:bg-blue-100"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Éditer</span>
          </Button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION SORTIE / DÉCÈS
// ─────────────────────────────────────────────────────────────

function SortieSection({ nomPrenom, onConfirm, disabled }: {
  nomPrenom: string;
  onConfirm: (dateSortie: string) => void;
  disabled: boolean;
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
          <p className="text-sm font-semibold text-red-800">
            Enregistrer la sortie de {nomPrenom}
          </p>
          <p className="text-xs text-red-600 leading-relaxed">
            Le résident sera retiré des listes actives. Son historique de vaccination sera conservé dans la section &laquo;&nbsp;Résidents sortis&nbsp;&raquo;.
          </p>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-red-700">Date de sortie</Label>
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="h-9 text-sm border-red-300 w-44"
              />
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
// FORMULAIRE D'ÉDITION INLINE
// ─────────────────────────────────────────────────────────────

function EditForm({
  form, patch,
  roomUnlocked, onUnlockRoom,
  onSave, onCancel,
  saving, isNew,
  onArchive,
  onDelete,
  isAdmin,
}: {
  form: Partial<Resident>;
  patch: (u: Partial<Resident>) => void;
  roomUnlocked: boolean;
  onUnlockRoom: () => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
  onArchive?: (dateSortie: string) => void;
  onDelete?: () => void;
  isAdmin?: boolean;
}) {
  const headerTitle = isNew
    ? 'Nouveau résident'
    : `Édition — ${form.title ?? ''} ${(form.last_name ?? '').toUpperCase()} ${form.first_name ?? ''}`.trim();

  return (
    <div className="rounded-xl border-2 border-blue-400 bg-white shadow-xl overflow-hidden">

      {/* En-tête bleu */}
      <div className="flex items-center justify-between bg-blue-600 px-4 py-3">
        <span className="text-sm font-semibold text-white truncate">{headerTitle}</span>
        <Button
          variant="ghost" size="icon"
          onClick={onCancel}
          className="h-7 w-7 flex-shrink-0 ml-2 text-blue-200 hover:text-white hover:bg-blue-700"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 sm:p-5 space-y-6">

        {/* ══ 1. IDENTITÉ ══════════════════════════════════════ */}
        <section>
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 pb-1.5 border-b border-slate-100">
            Identité
          </h3>
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
                  className={cn(
                    'h-9 text-sm pr-9',
                    !roomUnlocked && 'bg-slate-100 cursor-not-allowed text-slate-400'
                  )}
                />
                <button
                  type="button"
                  onClick={!roomUnlocked ? onUnlockRoom : undefined}
                  className={cn(
                    'absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors',
                    roomUnlocked
                      ? 'text-emerald-500 cursor-default'
                      : 'text-slate-400 hover:text-blue-600 cursor-pointer'
                  )}
                  title={
                    roomUnlocked
                      ? 'Chambre déverrouillée'
                      : 'Cliquer pour déverrouiller — mot de passe admin requis'
                  }
                >
                  {roomUnlocked
                    ? <Unlock className="h-3.5 w-3.5" />
                    : <Lock   className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                {roomUnlocked
                  ? (form.room ? `Étage détecté : ${inferFloor(form.room)}` : 'Saisir le numéro')
                  : '🔒 Cliquer sur le cadenas pour modifier'}
              </p>
            </div>

            {/* Titre */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-600">Titre</Label>
              <Select value={form.title ?? 'Mme'} onValueChange={v => patch({ title: v })}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TITLES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Prénom */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-600">Prénom</Label>
              <Input
                value={form.first_name ?? ''}
                onChange={e => patch({ first_name: e.target.value })}
                placeholder="Prénom"
                className="h-9 text-sm"
              />
            </div>

            {/* Nom */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-600">Nom *</Label>
              <Input
                value={form.last_name ?? ''}
                onChange={e => patch({ last_name: e.target.value })}
                placeholder="NOM DE FAMILLE"
                className="h-9 text-sm uppercase"
              />
            </div>
          </div>
        </section>

        {/* ══ 2. INFORMATIONS MÉDICALES ════════════════════════ */}
        <section>
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 pb-1.5 border-b border-slate-100">
            Informations médicales
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-600">Date de naissance</Label>
              <Input
                type="date"
                value={form.date_naissance ?? ''}
                onChange={e => patch({ date_naissance: e.target.value })}
                className="h-9 text-sm"
              />
              {form.date_naissance && (
                <p className="text-[10px] text-slate-400">→ {calcAge(form.date_naissance)}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-600">Date d'entrée</Label>
              <Input
                type="date"
                value={form.date_entree ?? ''}
                onChange={e => patch({ date_entree: e.target.value })}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1 col-span-2">
              <Label className="text-xs font-semibold text-slate-600">Médecin traitant</Label>
              <Select
                value={form.medecin || '_none'}
                onValueChange={v => patch({ medecin: v === '_none' ? '' : v })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="— Choisir un médecin —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Aucun —</SelectItem>
                  {MEDECINS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* ══ 3. RÉGIMES ALIMENTAIRES ══════════════════════════ */}
        <section>
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 pb-1.5 border-b border-slate-100">
            Régimes alimentaires
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-y-3 gap-x-6">
            <CheckField
              id="f_regime_diabetique"
              label="Régime diabétique"
              checked={form.regime_diabetique ?? false}
              onChange={v => patch({ regime_diabetique: v })}
            />
            <CheckField
              id="f_epargne_intestinale"
              label="Épargne intestinale"
              checked={form.epargne_intestinale ?? false}
              onChange={v => patch({ epargne_intestinale: v })}
            />
          </div>
          <div className="mt-3">
            <label htmlFor="f_allergie_autre" className="block text-xs font-semibold text-slate-700 mb-1">
              ⚠ Autre allergie alimentaire (saisie libre)
            </label>
            <Input
              id="f_allergie_autre"
              value={form.allergie_autre ?? ''}
              onChange={e => patch({ allergie_autre: e.target.value })}
              placeholder="Ex : arachides, lactose, gluten, fraises…"
              className="text-sm"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Apparaîtra automatiquement sur la fiche résident et les étiquettes repas.
            </p>
          </div>
        </section>

        {/* ══ 4. TRAITEMENTS PARTICULIERS ══════════════════════ */}
        <section>
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 pb-1.5 border-b border-slate-100">
            Traitements particuliers
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-y-3 gap-x-6">
            <CheckField
              id="f_traitement_ecrase"
              label="Traitement écrasé"
              checked={form.traitement_ecrase ?? false}
              onChange={v => patch({ traitement_ecrase: v })}
            />
            <CheckField
              id="f_insuline_matin"
              label="Insuline matin ☀"
              checked={form.insuline_matin ?? false}
              onChange={v => patch({ insuline_matin: v })}
            />
            <CheckField
              id="f_insuline_soir"
              label="Insuline soir 🌙"
              checked={form.insuline_soir ?? false}
              onChange={v => patch({ insuline_soir: v })}
            />
            <CheckField
              id="f_anticoagulants"
              label="Anticoagulants"
              checked={form.anticoagulants ?? false}
              onChange={v => patch({ anticoagulants: v })}
            />
            <CheckField
              id="f_chaussettes_de_contention"
              label="Chaussettes de contention"
              checked={form.chaussettes_de_contention ?? false}
              onChange={v => patch({ chaussettes_de_contention: v })}
            />
            <CheckField
              id="f_bas_de_contention"
              label="Bas de contention"
              checked={form.bas_de_contention ?? false}
              onChange={v => patch({ bas_de_contention: v })}
            />
            <CheckField
              id="f_bande_de_contention"
              label="Bande de contention"
              checked={form.bande_de_contention ?? false}
              onChange={v => patch({ bande_de_contention: v })}
            />
            {/* appel_nuit : lecture seule — géré uniquement via GIR / Niveau de soin */}
            <div className="flex items-center gap-2 opacity-60 cursor-not-allowed select-none" title="Modifiable uniquement depuis la page GIR / Niveau de soin">
              <div className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${form.appel_nuit ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 bg-white'}`}>
                {form.appel_nuit && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </div>
              <span className="text-sm text-slate-500 font-normal leading-snug">
                Appel nuit <span className="text-[10px] text-slate-400">(via GIR)</span>
              </span>
            </div>
          </div>
        </section>

        {/* ══ 5. ANNOTATIONS ═══════════════════════════════════ */}
        <section>
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 pb-1.5 border-b border-slate-100">
            Annotations / Consignes spéciales
          </h3>
          <Textarea
            value={form.annotations ?? ''}
            onChange={e => patch({ annotations: e.target.value })}
            placeholder="Notes médicales, consignes particulières, informations utiles pour l'équipe soignante…"
            rows={3}
            className="text-sm resize-none"
          />
        </section>

        {/* ══ ACTIONS ══════════════════════════════════════════ */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <Button
            onClick={onSave}
            disabled={saving}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Sauvegarde en cours…</>
            ) : (
              <><Save className="h-4 w-4" /> {isNew ? 'Créer le résident' : 'Sauvegarder les modifications'}</>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={onCancel}
            className="gap-1.5"
          >
            <X className="h-4 w-4" /> Annuler
          </Button>
          <span className="text-xs text-slate-300">* Champs requis</span>
        </div>

        {/* ══ SORTIE DU RÉSIDENT ══════════════════════════════ */}
        {!isNew && onArchive && (
          <SortieSection
            nomPrenom={`${form.title ?? ''} ${(form.last_name ?? '').toUpperCase()} ${form.first_name ?? ''}`.trim()}
            onConfirm={onArchive}
            disabled={saving}
          />
        )}

        {/* Suppression définitive — admin uniquement */}
        {!isNew && onDelete && isAdmin && (
          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={() => {
                if (confirm('Supprimer définitivement ce résident ? Cette action est irréversible.')) {
                  onDelete();
                }
              }}
              className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors"
            >
              🗑 Supprimer définitivement ce résident
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CARTE MÉDECINS
// ─────────────────────────────────────────────────────────────

function DoctorsCard({
  doctors, onEdit,
}: { doctors: DoctorConfig[]; onEdit: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-4">
      <Stethoscope className="h-4 w-4 text-slate-400 flex-shrink-0" />
      <span className="text-sm font-semibold text-slate-700 flex-shrink-0">Médecins traitants</span>
      <div className="flex flex-wrap gap-2 flex-1">
        {doctors.map((d, i) => (
          <span key={i} className="flex items-center gap-1.5 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            {d.name}
          </span>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={onEdit} className="gap-1.5 text-xs text-slate-400 hover:text-blue-600 flex-shrink-0">
        <Pencil className="h-3.5 w-3.5" /> Modifier
      </Button>
    </div>
  );
}

function DoctorsEditDialog({
  open, onOpenChange, doctors, onSave,
}: { open: boolean; onOpenChange: (v: boolean) => void; doctors: DoctorConfig[]; onSave: (d: DoctorConfig[]) => void }) {
  const [form, setForm] = useState<DoctorConfig[]>(doctors);
  const patch = (i: number, field: keyof DoctorConfig, val: string) =>
    setForm(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: val } : d));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-4 w-4 text-slate-500" /> Médecins traitants
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          {form.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="color" value={d.color} onChange={e => patch(i, 'color', e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-slate-200 p-0.5" />
              <Input value={d.name} onChange={e => patch(i, 'name', e.target.value)} className="h-8 text-sm flex-1" />
            </div>
          ))}
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <Button onClick={() => { onSave(form); onOpenChange(false); }} className="flex-1 gap-1.5">
              <Save className="h-4 w-4" /> Sauvegarder
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// CARTE CODES D'ACCÈS
// ─────────────────────────────────────────────────────────────

function AccessCodesCard({
  floor, codes, onEdit,
}: { floor: string; codes: FloorCodes; onEdit: () => void }) {
  const hasData = codes.digicode_porte || codes.digicode_entree || codes.mdp_ordi;
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-4">
      <Key className="h-4 w-4 text-slate-400 flex-shrink-0" />
      <span className="text-sm font-semibold text-slate-700 flex-shrink-0">Codes d'accès — {floor}</span>
      <div className="flex flex-wrap gap-4 flex-1 text-sm text-slate-600">
        {codes.digicode_porte   && <span>Digicode porte : <strong>{codes.digicode_porte}</strong></span>}
        {codes.digicode_entree  && <span>Digicode entrée : <strong>{codes.digicode_entree}</strong></span>}
        {codes.mdp_ordi         && <span>MDP ordi : <strong>{codes.mdp_ordi}</strong></span>}
        {!hasData && <span className="text-slate-300 italic text-xs">Aucun code renseigné</span>}
      </div>
      <Button variant="ghost" size="sm" onClick={onEdit} className="gap-1.5 text-xs text-slate-400 hover:text-blue-600 flex-shrink-0">
        <Pencil className="h-3.5 w-3.5" /> Modifier
      </Button>
    </div>
  );
}

function AccessCodesEditDialog({
  open, onOpenChange, floor, codes, onSave,
}: { open: boolean; onOpenChange: (v: boolean) => void; floor: string; codes: FloorCodes; onSave: (c: FloorCodes) => void }) {
  const [form, setForm] = useState<FloorCodes>(codes);
  const p = (field: keyof FloorCodes, val: string) => setForm(prev => ({ ...prev, [field]: val }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4 text-slate-500" /> Codes d'accès — {floor}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          {([
            ['digicode_porte',  'Digicode porte'],
            ['digicode_entree', 'Digicode entrée'],
            ['mdp_ordi',        'Mot de passe ordinateur'],
          ] as [keyof FloorCodes, string][]).map(([field, label]) => (
            <div key={field} className="space-y-1">
              <Label className="text-xs font-medium text-slate-600">{label}</Label>
              <Input value={form[field]} onChange={e => p(field, e.target.value)} className="h-9 text-sm font-mono" />
            </div>
          ))}
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <Button onClick={() => { onSave(form); onOpenChange(false); }} className="flex-1 gap-1.5">
              <Save className="h-4 w-4" /> Sauvegarder
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE PRINCIPALE
// ─────────────────────────────────────────────────────────────

export default function ResidentsPage() {
  const queryClient = useQueryClient();
  const access = useModuleAccess('residents');
  const readOnly = access === 'read';
  const { profile } = useAuth();
  const isAdmin = useEffectiveRole() === 'admin';

  const [floorFilter, setFloorFilter]   = useState<FloorFilter>('TOUS');
  const [search, setSearch]             = useState('');
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editForm, setEditForm]         = useState<Partial<Resident>>({});
  const [roomUnlocked, setRoomUnlocked] = useState(false);
  const [showAdminDlg, setShowAdminDlg] = useState(false);

  const { data: doctors = DEFAULT_DOCTORS, refetch: refetchDoctors } = useQuery({
    queryKey: ['settings', 'doctors'],
    queryFn: () => fetchSetting('doctors', DEFAULT_DOCTORS),
  });
  const { data: floorCodes = DEFAULT_CODES, refetch: refetchCodes } = useQuery({
    queryKey: ['settings', 'floor_codes'],
    queryFn: () => fetchSetting('floor_codes', DEFAULT_CODES),
  });
  const [showDoctorsEdit, setShowDoctorsEdit] = useState(false);
  const [editingFloor, setEditingFloor] = useState<string | null>(null);

  /* ── Data ── */
  const { data: residents = [], isLoading, error } = useQuery({
    queryKey: ['residents'],
    queryFn: fetchResidents,
  });

  /* ── Mutation ── */
  const saveMutation = useMutation({
    mutationFn: saveResident,
    onSuccess: () => {
      // Uniquement invalidation des données — la fermeture du form est gérée dans mutate()
      queryClient.invalidateQueries({ queryKey: ['residents'] });
    },
    onError: (err: Error) => toast.error(`Erreur : ${err.message}`),
  });

  /* ── Mutation sortie/archivage ── */
  const archiveMutation = useMutation({
    mutationFn: async ({ id, dateSortie }: { id: string; dateSortie: string }) => {
      const sb = createClient();
      // Récupérer les infos du résident avant archivage
      const { data: res } = await sb.from('residents').select('room, floor, section, sort_order').eq('id', id).single();
      const room       = res?.room       ?? '';
      const floor      = res?.floor      ?? 'RDC';
      const section    = res?.section    ?? 'Mapad';
      const sort_order = res?.sort_order ?? 999;
      // Vider la ligne prise_en_charge correspondante
      if (room) {
        await sb.from('prise_en_charge')
          .update({ nom: '', matin: '', apres_midi: '', protection: '', updated_at: new Date().toISOString() })
          .eq('chambre', room);
      }
      // Archiver le résident — conserver toutes ses données pour l'historique
      const { error: rErr } = await sb.from('residents')
        .update({ archived: true, date_sortie: dateSortie })
        .eq('id', id);
      if (rErr) throw new Error(rErr.message);
      // Marquer ses vaccinations comme archivées
      await sb.from('vaccination')
        .update({ archived: true })
        .eq('resident_id', id);
      // Recréer une ligne vide pour la chambre afin qu'elle reste visible dans les listes
      if (room) {
        const newId = crypto.randomUUID();
        const { error: insErr } = await sb.from('residents').insert({
          id: newId,
          room, floor, section, sort_order,
          title: 'Mme', first_name: '', last_name: '',
          archived: false,
        });
        if (insErr) throw new Error(insErr.message);
        // Transférer les bilans planifiés au nouveau résident pour conserver
        // la rangée du planning (l'utilisateur les ajustera manuellement)
        await sb.from('planning_bilan_cell')
          .update({ resident_id: newId })
          .eq('resident_id', id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['vaccinations'] });
      queryClient.invalidateQueries({ queryKey: ['planning_bilan_cell'] });
    },
    onError: (err: Error) => toast.error(`Erreur : ${err.message}`),
  });

  /* ── Mutation suppression définitive (admin uniquement) ── */
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const sb = createClient();
      const { error } = await sb.from('residents').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      setEditingId(null);
      setEditForm({});
      toast.success('Résident supprimé définitivement');
    },
    onError: (err: Error) => toast.error(`Erreur : ${err.message}`),
  });

  /* ── Mutation libération chambre (résidents déjà archivés) ── */
  const releaseRoomMutation = useMutation({
    mutationFn: async (id: string) => {
      const sb = createClient();
      const { error } = await sb.from('residents').update({ room: '' }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      toast.success('Chambre libérée — elle réapparaît dans les listes');
    },
    onError: (err: Error) => toast.error(`Erreur : ${err.message}`),
  });

  /* ── Mutation suppression définitive résident archivé ── */
  const deleteArchivedMutation = useMutation({
    mutationFn: async (id: string) => {
      const sb = createClient();
      await sb.from('vaccination').delete().eq('resident_id', id);
      const { error } = await sb.from('residents').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['vaccinations'] });
      toast.success('Résident supprimé définitivement');
    },
    onError: (err: Error) => toast.error(`Erreur : ${err.message}`),
  });

  const [deleteArchivedTarget, setDeleteArchivedTarget] = useState<{ id: string; nom: string } | null>(null);
  const [deleteArchivedPwd, setDeleteArchivedPwd] = useState('');
  const [deleteArchivedPwdError, setDeleteArchivedPwdError] = useState(false);

  const openDeleteArchived = (id: string, nom: string) => {
    setDeleteArchivedPwd('');
    setDeleteArchivedPwdError(false);
    setDeleteArchivedTarget({ id, nom });
  };

  const handleDeleteArchivedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteArchivedPwd === 'mapad2022') {
      deleteArchivedMutation.mutate(deleteArchivedTarget!.id);
      setDeleteArchivedTarget(null);
    } else {
      setDeleteArchivedPwdError(true);
      setDeleteArchivedPwd('');
    }
  };

  const [showArchived, setShowArchived] = useState(false);
  const archivedResidents = useMemo(() =>
    residents.filter(r => r.archived).sort((a, b) => (a.last_name || '').localeCompare(b.last_name || '', 'fr')),
    [residents]
  );

  /* ── Liste filtrée ── */
  const filtered = useMemo(() => {
    return residents
      .filter(r => {
        if (r.archived) return false; // exclure les résidents sortis
        if (floorFilter !== 'TOUS' && r.floor !== floorFilter) return false;
        if (search.trim()) {
          const q = search.toLowerCase().trim();
          const name = `${r.last_name} ${r.first_name}`.toLowerCase();
          if (!name.includes(q) && !r.room.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const parse = (room: string) => {
          const withDot = room.match(/^(\d+)\.([A-Za-z]+)$/);
          if (withDot) return { num: parseInt(withDot[1], 10), suffix: withDot[2].toUpperCase(), dot: true };
          const noDot = room.match(/^(\d+)([A-Za-z]*)$/);
          if (noDot)   return { num: parseInt(noDot[1],   10), suffix: noDot[2].toUpperCase(),   dot: false };
          return { num: 9999, suffix: '', dot: false };
        };
        const ra = parse(a.room);
        const rb = parse(b.room);
        // 1. Tri par numéro
        if (ra.num !== rb.num) return ra.num - rb.num;
        // 2. Même numéro : avec point AVANT sans point
        if (ra.dot !== rb.dot) return ra.dot ? -1 : 1;
        // 3. Les deux avec point → G avant D
        if (ra.dot && rb.dot) {
          const o: Record<string, number> = { G: 0, D: 1 };
          return (o[ra.suffix] ?? 99) - (o[rb.suffix] ?? 99);
        }
        // 4. Les deux sans point → ordre alphabétique (D avant G)
        return ra.suffix.localeCompare(rb.suffix);
      });
  }, [residents, floorFilter, search]);

  /* ── Helpers édition ── */
  function startEdit(r: Resident) {
    if (readOnly) return;
    setEditingId(r.id);
    setEditForm({ ...r });
    setRoomUnlocked(false);
  }

  function startCreate() {
    if (readOnly) return;
    setEditingId('NEW');
    setEditForm({ ...EMPTY_FORM });
    setRoomUnlocked(true);
  }

  function cancelEdit() {
    flushSync(() => {
      setEditingId(null);
      setEditForm({});
      setRoomUnlocked(false);
    });
  }

  // Fermer avec Échap
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editingId !== null) cancelEdit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  function patch(updates: Partial<Resident>) {
    setEditForm(prev => {
      const next = { ...prev, ...updates };
      if ('room' in updates) next.floor = inferFloor(updates.room ?? '');
      return next;
    });
  }

  function handleSave() {
    if (!editForm.room?.trim()) { toast.error('Le numéro de chambre est obligatoire'); return; }
    const isNew = editingId === 'NEW';
    // Convertir les dates vides en null pour éviter l'erreur Supabase "invalid input syntax for type date"
    const payload = {
      ...(isNew ? editForm : { ...editForm, id: editingId! }),
      date_naissance: editForm.date_naissance?.trim() || null,
      date_entree:    editForm.date_entree?.trim()    || null,
      date_sortie:    editForm.date_sortie?.trim()    || null,
    };
    // Pattern React Query v5 : les mises à jour UI dans le callback de mutate()
    // garantissent l'exécution dans le bon contexte React, contrairement à onSuccess de useMutation
    saveMutation.mutate(payload, {
      onSuccess: () => {
        flushSync(() => {
          setEditingId(null);
          setEditForm({});
          setRoomUnlocked(false);
        });
        toast.success(isNew ? 'Résident créé ✓' : 'Modifications sauvegardées ✓');
      },
    });
  }

  const isSaving = saveMutation.isPending;
  const rdcCount = residents.filter(r => r.floor === 'RDC').length;
  const erCount  = residents.filter(r => r.floor === '1ER').length;

  /* ── Render ── */
  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <header className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}>
        <div className="absolute inset-0 pointer-events-none"><NetworkBackground /></div>
        <div className="relative z-10 max-w-5xl mx-auto px-6 py-5">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <span>›</span>
            <span className="text-white/75">Gestion des Résidents</span>
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <CaduceusIcon />
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight leading-none">
                  Gestion des Résidents
                  <span className="ml-2 text-base font-normal text-white/50">({residents.length})</span>
                </h1>
                <p className="text-sm text-white/60 mt-0.5">Résidence La Fourrier</p>
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={startCreate}
                disabled={editingId !== null || readOnly}
                className="flex items-center gap-1.5 bg-white text-slate-800 hover:bg-white/90 rounded-xl px-4 py-2 text-sm font-semibold shadow-md transition-colors disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Nouveau résident</span>
                <span className="sm:hidden">+</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ══ BARRE DE FILTRES ════════════════════════════════════ */}
      <div className="bg-white border-b border-slate-200/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row gap-2.5 items-start sm:items-center">

          {/* Filtres étage */}
          <div className="flex gap-1 flex-shrink-0">
            {([
              ['TOUS', `Tous · ${residents.length}`],
              ['RDC',  `RDC · ${rdcCount}`],
              ['1ER',  `1er étage · ${erCount}`],
            ] as [FloorFilter, string][]).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFloorFilter(val)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
                  floorFilter === val
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Recherche */}
          <div className="relative w-full sm:ml-auto sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Rechercher par nom ou chambre…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm bg-slate-50 border-slate-200"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ══ CONTENU PRINCIPAL ═══════════════════════════════════ */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-4 space-y-3 pb-12">

        {readOnly && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-blue-700 font-medium">
            <Eye className="h-4 w-4 flex-shrink-0" />
            Vous consultez cette page en lecture seule.
          </div>
        )}

        {/* Cartes infos */}
        <DoctorsCard doctors={doctors} onEdit={() => setShowDoctorsEdit(true)} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <AccessCodesCard floor="RDC"  codes={floorCodes['RDC']}  onEdit={() => setEditingFloor('RDC')} />
          <AccessCodesCard floor="1ER"  codes={floorCodes['1ER']}  onEdit={() => setEditingFloor('1ER')} />
        </div>

        {/* Chargement */}
        {isLoading && (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Chargement des résidents…</span>
          </div>
        )}

        {/* Erreur */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{(error as Error).message}</span>
          </div>
        )}

        {/* Formulaire nouveau résident — apparaît en haut de liste */}
        {editingId === 'NEW' && !readOnly && (
          <EditForm
            form={editForm}   patch={patch}
            roomUnlocked      onUnlockRoom={() => {}}
            onSave={handleSave} onCancel={cancelEdit}
            saving={isSaving} isNew isAdmin={isAdmin}
          />
        )}

        {/* Liste des résidents */}
        {!isLoading && !error && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

            {/* En-tête colonnes (desktop) */}
            <div className="hidden sm:flex items-center px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest gap-3">
              <div className="w-14">Ch.</div>
              <div className="flex-1">Résident</div>
              <div className="w-16 text-right">Action</div>
            </div>

            {/* Aucun résultat */}
            {filtered.length === 0 && (
              <div className="py-16 text-center">
                <Users className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">
                  {search
                    ? `Aucun résident trouvé pour « ${search} »`
                    : 'Aucun résident enregistré.'}
                </p>
              </div>
            )}

            {/* Lignes */}
            {filtered.map((r, idx) => {
              const prevFloor    = idx > 0 ? filtered[idx - 1].floor : null;
              const showFloorSep = floorFilter === 'TOUS' &&
                (idx === 0 || (prevFloor !== null && prevFloor !== r.floor));

              return (
                <div key={r.id}>

                  {/* Séparateur d'étage */}
                  {showFloorSep && (
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-50 border-y border-slate-200">
                      <div className={cn(
                        'h-1.5 w-1.5 rounded-full flex-shrink-0',
                        r.floor === 'RDC' ? 'bg-sky-400' : 'bg-violet-400'
                      )} />
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        {r.floor === 'RDC' ? 'Rez-de-chaussée' : '1er Étage'}
                      </span>
                    </div>
                  )}

                  {/* Formulaire inline si ce résident est en édition */}
                  {editingId === r.id && !readOnly ? (
                    <div className="p-3 border-b border-slate-100 last:border-0 bg-slate-50/50">
                      <EditForm
                        form={editForm}   patch={patch}
                        roomUnlocked={roomUnlocked}
                        onUnlockRoom={() => setShowAdminDlg(true)}
                        onSave={handleSave} onCancel={cancelEdit}
                        saving={isSaving}   isNew={false}
                        onArchive={(dateSortie) => archiveMutation.mutate({ id: r.id, dateSortie }, {
                          onSuccess: () => {
                            toast.success('Résident archivé — chambre libérée et conservée dans les listes');
                            flushSync(() => { setEditingId(null); setEditForm({}); });
                          },
                        })}
                        onDelete={() => deleteMutation.mutate(r.id)}
                        isAdmin={isAdmin}
                      />
                    </div>
                  ) : (
                    <ResidentRow
                      r={r}
                      onEdit={() => startEdit(r)}
                      onPhotoUploaded={(path) => {
                        queryClient.setQueryData(['residents'], (prev: Resident[] = []) =>
                          prev.map(p => p.id === r.id ? { ...p, photo_url: path } : p)
                        );
                      }}
                      dimmed={editingId !== null && editingId !== r.id}
                      readOnly={readOnly}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Compteur résultats */}
        {!isLoading && filtered.length > 0 && (
          <p className="text-center text-xs text-slate-300 pb-2">
            {filtered.length} résident{filtered.length > 1 ? 's' : ''} affiché
            {filtered.length > 1 ? 's' : ''}
          </p>
        )}

        {/* ── Résidents sortis ── */}
        {!isLoading && archivedResidents.length > 0 && (
          <div>
            <button
              onClick={() => setShowArchived(v => !v)}
              className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Résidents sortis / décédés
              <span className="ml-1 bg-amber-200 text-amber-800 rounded-full px-2 py-0.5 text-[10px]">
                {archivedResidents.length}
              </span>
              <span className="ml-auto">
                {showArchived ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </span>
            </button>

            {showArchived && (
              <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden mt-2">
                <div className="hidden sm:flex items-center px-4 py-2 bg-amber-50 border-b border-amber-100 text-[10px] font-bold text-amber-500 uppercase tracking-widest gap-3">
                  <div className="w-14">Ch.</div>
                  <div className="flex-1">Résident</div>
                  <div className="w-32">Date de sortie</div>
                </div>
                {archivedResidents.map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0 text-slate-500">
                    <div className="w-14 text-sm font-bold text-slate-400">{r.room || '—'}</div>
                    <div className="flex-1 text-sm">
                      <span className="font-medium">{r.title} {r.last_name?.toUpperCase()} {r.first_name}</span>
                    </div>
                    <div className="text-xs text-slate-400 w-32">
                      {r.date_sortie
                        ? `Sorti le ${new Date(r.date_sortie + 'T12:00:00').toLocaleDateString('fr-FR')}`
                        : 'Date inconnue'}
                    </div>
                    {r.room && (
                      <button
                        onClick={() => {
                          if (confirm(`Libérer la chambre ${r.room} de ${r.last_name} ${r.first_name} ?\nLa chambre réapparaîtra comme disponible.`))
                            releaseRoomMutation.mutate(r.id);
                        }}
                        className="text-xs text-amber-600 hover:text-amber-800 hover:bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 transition-colors flex-shrink-0"
                        title="Libérer la chambre pour la rendre disponible"
                      >
                        Libérer ch. {r.room}
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => openDeleteArchived(r.id, `${r.title ?? ''} ${r.last_name?.toUpperCase() ?? ''} ${r.first_name ?? ''}`.trim())}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                        title="Supprimer définitivement"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Dialog déverrouillage numéro de chambre */}
      <AdminUnlockDialog
        open={showAdminDlg}
        onOpenChange={setShowAdminDlg}
        onUnlock={() => setRoomUnlocked(true)}
      />

      {/* ── Modale suppression résident archivé ── */}
      {deleteArchivedTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-7 w-full max-w-sm">
            <div className="flex flex-col items-center gap-2 mb-5">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 className="h-6 w-6 text-red-500" />
              </div>
              <h2 className="text-base font-bold text-slate-900">Supprimer définitivement</h2>
              <p className="text-sm text-slate-600 text-center font-medium">{deleteArchivedTarget.nom}</p>
              <p className="text-xs text-red-500 text-center">Cette action est irréversible. Toutes les données seront effacées.</p>
            </div>
            <form onSubmit={handleDeleteArchivedSubmit} className="flex flex-col gap-3">
              <input
                type="password"
                value={deleteArchivedPwd}
                onChange={e => { setDeleteArchivedPwd(e.target.value); setDeleteArchivedPwdError(false); }}
                placeholder="Mot de passe administrateur"
                autoFocus
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-slate-400 transition-colors ${
                  deleteArchivedPwdError ? 'border-red-400 bg-red-50' : 'border-slate-300'
                }`}
              />
              {deleteArchivedPwdError && <p className="text-xs text-red-500">Mot de passe incorrect</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                >
                  Supprimer
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteArchivedTarget(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dialog médecins */}
      <DoctorsEditDialog
        open={showDoctorsEdit}
        onOpenChange={setShowDoctorsEdit}
        doctors={doctors}
        onSave={async d => { await saveSetting('doctors', d); refetchDoctors(); }}
      />

      {/* Dialogs codes d'accès */}
      {(['RDC', '1ER'] as const).map(fl => (
        <AccessCodesEditDialog
          key={fl}
          open={editingFloor === fl}
          onOpenChange={v => { if (!v) setEditingFloor(null); }}
          floor={fl}
          codes={floorCodes[fl]}
          onSave={async c => {
            const updated = { ...floorCodes, [fl]: c };
            await saveSetting('floor_codes', updated);
            refetchCodes();
          }}
        />
      ))}
    </div>
  );
}