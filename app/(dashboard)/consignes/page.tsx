'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Pencil, Check, X, Heart, Pill, Syringe, Sun, Moon,
  AlertTriangle, Printer, Loader2, Lock, Unlock, Eye,
} from 'lucide-react';
import { useModuleAccess } from '@/lib/use-module-access';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { fetchColorOverrides, darkenHex } from '@/lib/module-colors';
import { MODULES } from '@/components/dashboard/module-config';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

// ─────────────────────────────────────────────────────────────
// BACKGROUND & ICÔNE (style page d'accueil)
// ─────────────────────────────────────────────────────────────

// Réseau header (clairsemé, style page d'accueil)
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

// Réseau page (dense, fond clair)
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
  date_naissance: string;
  floor: 'RDC' | '1ER';
  section: string;
  sort_order: number;
  annotations: string;
  consignes: string;
  traitement_ecrase: boolean;
  insuline_matin: boolean;
  insuline_soir: boolean;
  anticoagulants: boolean;
  appel_nuit: boolean;
  chaussettes_de_contention: boolean;
  bas_de_contention: boolean;
  bande_de_contention: boolean;
}

interface ContentionFiche {
  id: string;
  nom: string;
  traitement: string;
  dotation_nominative: boolean | null;
}

// Emojis sous forme de SVG Twemoji servis localement pour garantir
// le rendu à l'impression (sans dépendance à un CDN externe).
const EMOJI_SOCK = '/twemoji/1f9e6.svg'; // 🧦
const EMOJI_LEG  = '/twemoji/1f9b5.svg'; // 🦵
const EMOJI_ROLL = '/twemoji/1f9fb.svg'; // 🧻

function EmojiImg({ src, alt, size = 14 }: { src: string; alt: string; size?: number }) {
  return (
    <img
      src={src}
      alt={alt}
      title={alt}
      width={size}
      height={size}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    />
  );
}

// Couleurs / labels pour les pastilles lit / fauteuil / barrières
const CONTENTION_PALETTE: Record<string, { bg: string; border: string; label: string }> = {
  lit:               { bg: '#dbeafe', border: '#93c5fd', label: 'L'  },
  fauteuil:          { bg: '#f3e8ff', border: '#c4b5fd', label: 'F'  },
  'barrière gauche': { bg: '#fef3c7', border: '#d97706', label: 'BG' },
  'barrière droite': { bg: '#fef3c7', border: '#d97706', label: 'BD' },
  'barrière x2':     { bg: '#fef3c7', border: '#d97706', label: 'B2' },
};

interface NiveauSoinRecord {
  id: string;
  resident_id: string;
  gir: string;
  niveau_soin: string;
}

interface PrintSettings {
  printScale: number;
  rowHeight: number;
  fontSize: number;
  spacingRDC: number;
  spacing1ER: number;
}

interface FloorCodes {
  digicode_porte: string;
  digicode_entree: string;
  mdp_ordi: string;
}

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────

const DEFAULT_PRINT: PrintSettings = {
  printScale: 110,
  rowHeight: 20,
  fontSize: 11,
  spacingRDC: 16,
  spacing1ER: 16,
};

const GIR_ROMAN: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' };

function calcAge(dateStr: string): number | null {
  if (!dateStr) return null;
  try {
    const birth = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  } catch { return null; }
}

function measureTextWidth(text: string, fontSize: number, fontWeight = 'normal'): number {
  if (typeof window === 'undefined') return 100;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 100;
  ctx.font = `${fontWeight} ${fontSize}px system-ui, -apple-system, sans-serif`;
  return ctx.measureText(text).width;
}

// ─────────────────────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────────────────────

async function fetchResidents(): Promise<Resident[]> {
  const sb = createClient();
  const { data, error } = await sb.from('residents').select('*').eq('archived', false).order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Resident[];
}

async function fetchNiveaux(): Promise<NiveauSoinRecord[]> {
  const sb = createClient();
  const { data } = await sb.from('niveau_soin').select('id,resident_id,gir,niveau_soin');
  return (data ?? []) as NiveauSoinRecord[];
}

async function fetchContentions(): Promise<ContentionFiche[]> {
  const sb = createClient();
  const { data } = await sb
    .from('contentions')
    .select('id,nom,traitement,dotation_nominative')
    .eq('type_suivi', 'contention');
  return (data ?? []) as ContentionFiche[];
}

async function fetchPrintSettings(): Promise<PrintSettings> {
  const sb = createClient();
  const { data } = await sb.from('settings').select('value').eq('key', 'consignes_print').maybeSingle();
  return data ? (data.value as PrintSettings) : DEFAULT_PRINT;
}

async function savePrintSettings(s: PrintSettings): Promise<void> {
  const sb = createClient();
  await sb.from('settings').upsert({ key: 'consignes_print', value: s, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

async function fetchFloorCodes(): Promise<Record<string, FloorCodes>> {
  const sb = createClient();
  const { data } = await sb.from('settings').select('value').eq('key', 'floor_codes').maybeSingle();
  return data ? (data.value as Record<string, FloorCodes>) : { RDC: { digicode_porte: '', digicode_entree: '', mdp_ordi: '' }, '1ER': { digicode_porte: '', digicode_entree: '', mdp_ordi: '' } };
}

async function updateConsignes(id: string, consignes: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from('residents').update({ consignes }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────
// COMPOSANT : LIGNE RÉSIDENT
// ─────────────────────────────────────────────────────────────

function ResidentRow({
  resident, niveauSoin, taDay, isEditing, onStartEdit, onSave, onCancel,
  maxNameWidth, maxInfosWidth, fontSize, readOnly, contentionItems,
}: {
  resident: Resident;
  niveauSoin: NiveauSoinRecord | undefined;
  taDay: number;
  isEditing: boolean;
  onStartEdit: () => void;
  onSave: (consignes: string) => void;
  onCancel: () => void;
  maxNameWidth: number;
  maxInfosWidth: number;
  fontSize: number;
  readOnly: boolean;
  contentionItems: Array<{ type: string; siBesoin: boolean }>;
}) {
  const [draft, setDraft] = useState(resident.consignes ?? '');

  useEffect(() => {
    if (isEditing) setDraft(resident.consignes ?? '');
  }, [isEditing, resident.consignes]);

  const gir = niveauSoin?.gir;
  const niveau = niveauSoin?.niveau_soin;
  const age = calcAge(resident.date_naissance);

  const annotationLines = (resident.annotations ?? '')
    .split('\n')
    .filter(l => !l.startsWith('---SUPPL:') && l.trim())
    .slice(0, 3);

  return (
    <tr
      className="hover:bg-slate-50/60 transition-colors group"
      style={{ borderBottom: '1px solid #cbd5e1', breakInside: 'avoid', pageBreakInside: 'avoid' }}
    >
      {/* ── Chambre ── */}
      <td className="px-1 py-1 font-semibold text-slate-700 text-[11px] align-top" style={{ border: '1px solid #475569' }}>
        <div className="flex flex-col gap-0.5">
          {/* Room + GIR + niveau */}
          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span>{resident.room}</span>
            {(gir || niveau) && (
              <span style={{ fontSize: '10px', marginLeft: '4px' }}>
                {gir && gir !== 'N/A' && (
                  <span style={{ fontWeight: 900, color: '#1e293b' }}>
                    {GIR_ROMAN[gir] ?? gir}
                  </span>
                )}
                {gir && gir !== 'N/A' && niveau ? '\u00A0' : ''}
                {niveau && (
                  <span style={{
                    fontWeight: 900, color: '#1e293b',
                    border: '2px solid #1e293b', borderRadius: '50%',
                    padding: '0px 3px', display: 'inline-block',
                    lineHeight: '1.3', minWidth: '16px', textAlign: 'center',
                  }}>{niveau}</span>
                )}
              </span>
            )}
          </span>
          {/* Badges TA + traitement écrasé */}
          <div className="flex items-center gap-0.5">
            <span
              className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded-full leading-none bg-blue-100 text-blue-700"
              title={`TA jour ${taDay} du mois`}
            >
              <Heart className="h-2 w-2" />{taDay}
            </span>
            {resident.traitement_ecrase && (
              <span
                className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded-full leading-none bg-yellow-100 text-yellow-700"
                title="Traitement à écraser"
              >
                <Pill className="h-2 w-2" />
              </span>
            )}
          </div>
        </div>
      </td>

      {/* ── Nom ── */}
      <td className="px-0 py-1 align-top" style={{ border: '1px solid #475569', width: `${maxNameWidth}px`, overflow: 'hidden' }}>
        <div className="font-semibold text-slate-800 uppercase text-[12px] leading-tight whitespace-nowrap overflow-hidden">{resident.last_name}</div>
        {(resident.first_name || resident.date_naissance) && (
          <div className="text-slate-500 text-[11px] whitespace-nowrap overflow-hidden">
            {resident.first_name}
            {age !== null && (
              <span className="ml-1 text-slate-400">({age})</span>
            )}
          </div>
        )}
      </td>

      {/* ── Infos (annotations, rouge) ── */}
      <td className="px-1.5 py-1 align-top" style={{ border: '1px solid #475569', width: `${maxInfosWidth}px` }}>
        {annotationLines.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {annotationLines.map((line, i) => (
              <span key={i} className="text-red-600 font-semibold text-[11px] leading-tight">{line}</span>
            ))}
          </div>
        )}
      </td>

      {/* ── Consignes (éditables) ── */}
      <td className="px-2 py-1 align-top" style={{ border: '1px solid #475569' }}>
        {isEditing ? (
          <Textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="text-sm min-h-[40px] resize-none"
            rows={2}
          />
        ) : (
          <span className="whitespace-pre-line text-black" style={{ fontSize: `${fontSize}px` }}>
            {resident.consignes ?? ''}
          </span>
        )}
      </td>

      {/* ── Icônes insuline / anticoagulants ── */}
      <td className="px-1 py-1 align-top" style={{ border: '1px solid #475569', width: '50px' }}>
        {!isEditing && (
          <div className="flex flex-col gap-0.5">
            {resident.insuline_matin && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700">
                <Syringe className="h-2.5 w-2.5" /><Sun className="h-2.5 w-2.5" />
              </span>
            )}
            {resident.insuline_soir && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-700">
                <Syringe className="h-2.5 w-2.5" /><Moon className="h-2.5 w-2.5" />
              </span>
            )}
            {resident.anticoagulants && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-700">
                <AlertTriangle className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
        )}
      </td>

      {/* ── Contentions (lit/fauteuil/barrières + chaussettes/bas/bande) ── */}
      <td className="px-1 py-1 align-top" style={{ border: '1px solid #475569', width: '52px' }}>
        {!isEditing && (
          <div className="flex flex-wrap gap-0.5 justify-center items-center">
            {contentionItems.map(({ type, siBesoin }, idx) => {
              const p = CONTENTION_PALETTE[type];
              if (!p) return null;
              return (
                <span
                  key={idx}
                  title={`${type}${siBesoin ? ' (si besoin)' : ' (continu)'}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 14, height: 14, borderRadius: '50%',
                    border: siBesoin ? `1.5px dashed ${p.border}` : `1.5px solid ${p.border}`,
                    background: siBesoin ? '#ffffff' : p.bg,
                    fontSize: 7, fontWeight: 700, color: '#1e293b', lineHeight: 1,
                  }}
                >
                  {p.label}
                </span>
              );
            })}
            {resident.chaussettes_de_contention && <EmojiImg src={EMOJI_SOCK} alt="Chaussettes de contention" />}
            {resident.bas_de_contention         && <EmojiImg src={EMOJI_LEG}  alt="Bas de contention" />}
            {resident.bande_de_contention       && <EmojiImg src={EMOJI_ROLL} alt="Bande de contention" />}
          </div>
        )}
      </td>

      {/* ── Actions ── */}
      <td className="px-1 py-1 print:hidden align-top" style={{ border: '1px solid #475569' }}>
        {isEditing ? (
          <div className="flex gap-1 justify-center">
            <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => onSave(draft)} disabled={readOnly}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          !readOnly && (
            <Button
              size="icon" variant="ghost"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={onStartEdit}
            >
              <Pencil className="h-3.5 w-3.5 text-slate-400" />
            </Button>
          )
        )}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPOSANT : TABLEAU DE SECTION
// ─────────────────────────────────────────────────────────────

function SectionTable({
  title, residents, niveauSoinMap, contentionMap, taOffset, fontSize, onUpdate, readOnly,
}: {
  title: string;
  residents: Resident[];
  niveauSoinMap: Record<string, NiveauSoinRecord>;
  contentionMap: Record<string, Array<{ type: string; siBesoin: boolean }>>;
  taOffset: number;
  fontSize: number;
  onUpdate: (id: string, consignes: string) => Promise<void>;
  readOnly: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...residents].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [residents]
  );

  const maxNameWidth = useMemo(() => {
    if (sorted.length === 0) return 80;
    const widths = sorted.map(r => {
      const w1 = measureTextWidth((r.last_name ?? '').toUpperCase(), 12, '600');
      const w2 = measureTextWidth(r.first_name ?? '', 11, '600');
      return Math.max(w1, w2);
    });
    return Math.max(...widths) - 4;
  }, [sorted]);

  const maxInfosWidth = useMemo(() => {
    if (sorted.length === 0) return 60;
    const widths = sorted.map(r => {
      const lines = (r.annotations ?? '')
        .split('\n')
        .filter(l => !l.startsWith('---SUPPL:'));
      const lw = lines.map(l => measureTextWidth(l, 11, '600'));
      return lw.length > 0 ? Math.max(...lw) : 0;
    });
    return Math.max(...widths) + 8;
  }, [sorted]);

  const handleSave = async (id: string, consignes: string) => {
    await onUpdate(id, consignes);
    setEditingId(null);
  };

  return (
    <div className="mb-4">
      <table className="w-full" style={{ borderCollapse: 'collapse', border: '1px solid #475569' }}>
        <thead>
          <tr className="bg-slate-100/80">
            <th style={{ border: '1px solid #475569' }} className="px-1 py-1 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-10">Ch.</th>
            <th style={{ border: '1px solid #475569', width: `${maxNameWidth}px` }} className="px-1 py-1 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Nom</th>
            <th style={{ border: '1px solid #475569', width: `${maxInfosWidth}px` }} className="px-1 py-1 text-left text-[10px] font-semibold text-red-600 uppercase tracking-wider">Infos</th>
            <th style={{ border: '1px solid #475569', width: '75%' }} className="px-2 py-1 text-left text-[10px] font-semibold text-slate-800 uppercase tracking-wider">{title} — Consignes</th>
            <th style={{ border: '1px solid #475569' }} className="px-1 py-1 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider w-8"></th>
            <th style={{ border: '1px solid #475569', width: '52px' }} className="px-1 py-1 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Cont.</th>
            <th style={{ border: '1px solid #475569' }} className="px-1 py-1 w-8 print:hidden"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, idx) => (
            <ResidentRow
              key={r.id}
              resident={r}
              niveauSoin={niveauSoinMap[r.id]}
              contentionItems={contentionMap[r.id] ?? []}
              taDay={Math.ceil((taOffset + idx + 1) / 2)}
              isEditing={editingId === r.id}
              onStartEdit={() => !readOnly && setEditingId(r.id)}
              onSave={c => handleSave(r.id, c)}
              onCancel={() => setEditingId(null)}
              maxNameWidth={maxNameWidth}
              maxInfosWidth={maxInfosWidth}
              fontSize={fontSize}
              readOnly={readOnly}
            />
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={7} className="py-6 text-center text-xs text-slate-300 italic" style={{ border: '1px solid #475569' }}>
                Aucun résident dans cette section
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE PRINCIPALE
// ─────────────────────────────────────────────────────────────

export default function ConsignesPage() {
  const queryClient = useQueryClient();
  const access = useModuleAccess('consignes');
  const readOnly = access === 'read';

  const { data: colorOverrides = {} } = useQuery({
    queryKey: ['settings', 'module_colors'],
    queryFn: fetchColorOverrides,
    staleTime: 30000,
  });

  const consignesModule = MODULES.find(m => m.id === 'consignes');
  const colorFrom = colorOverrides['consignes']?.from ?? consignesModule?.cardFrom ?? '#3b72d8';
  const colorTo = colorOverrides['consignes']?.to ?? consignesModule?.cardTo ?? '#1a4db5';

  const [activeFloor, setActiveFloor] = useState<'RDC' | '1ER'>('RDC');
  const [settingsLocked, setSettingsLocked] = useState(true);
  const [showPwdDialog, setShowPwdDialog] = useState(false);
  const [pwdInput, setPwdInput] = useState('');
  const [pwdError, setPwdError] = useState(false);
  const [showPwdText, setShowPwdText] = useState(false);
  const [localPrint, setLocalPrint] = useState<PrintSettings>(DEFAULT_PRINT);

  // ── Data ──
  const { data: residents = [], isLoading } = useQuery({
    queryKey: ['residents'],
    queryFn: fetchResidents,
  });

  const { data: niveaux = [] } = useQuery({
    queryKey: ['niveau_soin'],
    queryFn: fetchNiveaux,
  });

  const { data: contentionFiches = [] } = useQuery({
    queryKey: ['contentions'],
    queryFn: fetchContentions,
  });

  const { data: printSettings } = useQuery({
    queryKey: ['settings', 'consignes_print'],
    queryFn: fetchPrintSettings,
  });

  const { data: floorCodes } = useQuery({
    queryKey: ['settings', 'floor_codes'],
    queryFn: fetchFloorCodes,
  });

  // Sync local state when Supabase settings load
  useEffect(() => {
    if (printSettings) setLocalPrint(printSettings);
  }, [printSettings]);

  // Inject print CSS
  useEffect(() => {
    let style = document.getElementById('print-scale-style') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'print-scale-style';
      document.head.appendChild(style);
    }
    const pad = Math.max(1, Math.round((localPrint.rowHeight - 16) / 2));
    style.textContent = `@page { size: A4 portrait; margin: 5mm 3mm; } @media print { .print-scale-wrapper tr { min-height: ${localPrint.rowHeight}px !important; height: ${localPrint.rowHeight}px !important; page-break-inside: avoid !important; } .print-scale-wrapper td { padding-top: ${pad}px !important; padding-bottom: ${pad}px !important; } .print-page-break { page-break-before: always !important; break-before: page !important; } }`;
  }, [localPrint.rowHeight]);

  // ── Mutations ──
  const updateMutation = useMutation({
    mutationFn: ({ id, consignes }: { id: string; consignes: string }) => updateConsignes(id, consignes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['residents'] }),
  });

  const handleUpdate = useCallback(async (id: string, consignes: string) => {
    await updateMutation.mutateAsync({ id, consignes });
  }, [updateMutation]);

  // ── Print settings ──
  const updatePrintSetting = (patch: Partial<PrintSettings>) => {
    const next = { ...localPrint, ...patch };
    setLocalPrint(next);
    savePrintSettings(next);
  };

  // ── Derived data ──
  const niveauSoinMap = useMemo(() => {
    const map: Record<string, NiveauSoinRecord> = {};
    niveaux.forEach(n => { map[n.resident_id] = n; });
    return map;
  }, [niveaux]);

  // Map resident_id → contentions (lit / fauteuil / barrières)
  // Le rapprochement se fait sur le nom complet "Prénom NOM" comme dans
  // la page Consignes de nuit.
  const contentionMap = useMemo(() => {
    const map: Record<string, Array<{ type: string; siBesoin: boolean }>> = {};
    residents.forEach(r => {
      const nom = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();
      const seen = new Set<string>();
      const items: Array<{ type: string; siBesoin: boolean }> = [];
      contentionFiches.filter(f => f.nom === nom).forEach(f => {
        const key = `${f.traitement}-${!!f.dotation_nominative}`;
        if (seen.has(key)) return;
        seen.add(key);
        items.push({ type: f.traitement, siBesoin: !!f.dotation_nominative });
      });
      map[r.id] = items;
    });
    return map;
  }, [residents, contentionFiches]);

  const floorResidents = useMemo(
    () => residents.filter(r => r.floor === activeFloor),
    [residents, activeFloor]
  );
  const mapadResidents = useMemo(
    () => floorResidents.filter(r => r.section === 'Mapad').sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [floorResidents]
  );
  const longSejourResidents = useMemo(
    () => floorResidents.filter(r => r.section === 'Long Séjour').sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [floorResidents]
  );
  const longSejourOffset = mapadResidents.length;
  const currentSpacing = activeFloor === 'RDC' ? localPrint.spacingRDC : localPrint.spacing1ER;
  const codes = floorCodes?.[activeFloor];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const handleSettingsClick = () => {
    if (!settingsLocked) {
      // Already open → close it
      setSettingsLocked(true);
    } else {
      // Locked → ask for password
      setPwdInput('');
      setPwdError(false);
      setShowPwdDialog(true);
    }
  };

  const handlePwdSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdInput === 'mapad2022') {
      setSettingsLocked(false);
      setShowPwdDialog(false);
      setPwdInput('');
      setPwdError(false);
    } else {
      setPwdError(true);
      setPwdInput('');
    }
  };

  return (
    <div className="min-h-screen relative" style={{ background: '#dde4ee' }}>

      {/* ── Fond réseau clair — z-index 0, sous tout le contenu ── */}
      <div className="print:hidden" style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5 }}
          viewBox="0 0 1500 1000"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          {PG_EDGES.map(([i, j], idx) => (
            <line key={idx} x1={PG_NODES[i][0]} y1={PG_NODES[i][1]} x2={PG_NODES[j][0]} y2={PG_NODES[j][1]}
              stroke={darkenHex(colorFrom, 30)} strokeWidth="0.8" />
          ))}
          {PG_NODES.map(([x, y], idx) => (
            <circle key={idx} cx={x} cy={y} r="3" fill={darkenHex(colorFrom, 20)} />
          ))}
        </svg>
      </div>

      {/* Tout le contenu au-dessus du SVG */}
      <div className="relative" style={{ zIndex: 1 }}>

      {/* ══ HEADER (masqué à l'impression) ══════════════════════ */}
      <div className="print:hidden relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${colorFrom} 0%, ${colorTo} 100%)` }}>
        {/* Fond réseau */}
        <div className="absolute inset-0 pointer-events-none">
          <NetworkBackground />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-6 py-5">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <span>›</span>
            <span className="text-white/75">Feuilles de Consignes</span>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Titre + icône */}
            <div className="flex items-center gap-4">
              <CaduceusIcon />
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight leading-none">
                  Feuilles de Consignes
                </h1>
                <p className="text-sm text-white/60 mt-0.5">Résidence La Fourrier</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Onglets étage */}
              <div className="flex gap-1 bg-white/10 rounded-xl p-1">
                {(['RDC', '1ER'] as const).map(f => (
                  <button key={f} onClick={() => setActiveFloor(f)}
                    className={cn(
                      'px-4 py-1.5 rounded-lg text-sm font-semibold transition-all',
                      activeFloor === f
                        ? 'bg-white text-slate-800 shadow-md'
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                    )}>
                    {f === 'RDC' ? 'RDC' : '1er Étage'}
                  </button>
                ))}
              </div>

              {/* Paramètres */}
              <button onClick={handleSettingsClick}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium border transition-colors',
                  settingsLocked
                    ? 'bg-white/10 border-white/20 text-white/75 hover:bg-white/20 hover:text-white'
                    : 'bg-emerald-400/20 border-emerald-300/40 text-emerald-200 hover:bg-emerald-400/30'
                )}>
                {settingsLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                Paramètres impression
              </button>

              {/* Imprimer */}
              <button onClick={() => window.print()}
                className="flex items-center gap-1.5 bg-white text-slate-800 hover:bg-white/90 rounded-xl px-4 py-2 text-sm font-semibold shadow-md transition-colors">
                <Printer className="h-4 w-4" />
                Imprimer
              </button>
            </div>
          </div>

          {/* Sliders paramètres */}
          {!settingsLocked && (
            <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-white/20">
              {([
                { label: 'Espace sections', min: 0,  max: 120, step: 4,  value: currentSpacing,        onChange: (v: number) => activeFloor === 'RDC' ? updatePrintSetting({ spacingRDC: v }) : updatePrintSetting({ spacing1ER: v }) },
                { label: 'Hauteur lignes',  min: 16, max: 60,  step: 2,  value: localPrint.rowHeight,  onChange: (v: number) => updatePrintSetting({ rowHeight: v }) },
                { label: 'Police consignes',min: 7,  max: 18,  step: 1,  value: localPrint.fontSize,   onChange: (v: number) => updatePrintSetting({ fontSize: v }) },
                { label: 'Zoom impression', min: 50, max: 200, step: 2,  value: localPrint.printScale, onChange: (v: number) => updatePrintSetting({ printScale: v }) },
              ] as { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }[]).map(s => (
                <div key={s.label} className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-white/70 font-medium whitespace-nowrap">{s.label}</span>
                  <input type="range" min={s.min} max={s.max} step={s.step} value={s.value}
                    onChange={e => s.onChange(Number(e.target.value))}
                    className="w-28 accent-white" />
                  <span className="text-xs font-semibold text-white w-10 text-right">
                    {s.value}{s.label === 'Zoom impression' ? '%' : 'px'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══ CONTENU (affiché + imprimé) ══════════════════════════ */}
      <div
        className="print-scale-wrapper max-w-6xl mx-auto px-4 py-6 print:px-2 print:py-2 print:max-w-none"
        style={{ zoom: `${localPrint.printScale}%` }}
      >
        {readOnly && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-blue-700 font-medium print:hidden">
            <Eye className="h-4 w-4 flex-shrink-0" />
            Vous consultez cette page en lecture seule.
          </div>
        )}
        {/* Card écran */}
        <div className="bg-white rounded-2xl shadow-md border border-white/60 px-5 py-5 print:shadow-none print:rounded-none print:border-none print:px-0 print:py-0">

        {/* En-tête date / IDE */}
        <div className="mb-6 print:mb-4">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4 print:mb-2">
            <div className="text-sm text-slate-500">
              <span className="font-semibold text-slate-700">DATE :</span>{' '}
              <span className="text-slate-600">_______________</span>
            </div>
            <div className="text-sm text-slate-500">
              <span className="font-semibold text-slate-700">IDE ASTREINTE :</span>{' '}
              <span className="text-slate-600">_______________</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">

          {/* ── MAPAD ── */}
          <div>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-2 print:hidden">
              Mapad
            </h2>
            <SectionTable
              title={`${activeFloor} Mapad`}
              residents={mapadResidents}
              niveauSoinMap={niveauSoinMap}
              contentionMap={contentionMap}
              taOffset={0}
              fontSize={localPrint.fontSize}
              onUpdate={handleUpdate}
              readOnly={readOnly}
            />
          </div>

          {/* ── LONG SÉJOUR ── */}
          <div className="print-page-break" style={{ marginTop: `${currentSpacing}px` }}>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-2 print:hidden">
              Long Séjour
            </h2>
            <SectionTable
              title={`${activeFloor} Long Séjour`}
              residents={longSejourResidents}
              niveauSoinMap={niveauSoinMap}
              contentionMap={contentionMap}
              taOffset={longSejourOffset}
              fontSize={localPrint.fontSize}
              onUpdate={handleUpdate}
              readOnly={readOnly}
            />

            {/* Footer codes d'accès (impression uniquement) */}
            {codes && (codes.digicode_porte || codes.digicode_entree || codes.mdp_ordi) && (
              <div className="hidden print:block mt-3 text-[9px] text-slate-600 border border-slate-400 p-2 rounded">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="font-semibold text-slate-700 uppercase tracking-wide">Codes d'accès :</span>
                  {codes.digicode_porte   && <span>Digicode porte : <strong>{codes.digicode_porte}</strong></span>}
                  {codes.digicode_entree  && <span>Digicode entrée : <strong>{codes.digicode_entree}</strong></span>}
                  {codes.mdp_ordi         && <span>MDP ordi {activeFloor} : <strong>{codes.mdp_ordi}</strong></span>}
                </div>
              </div>
            )}

            {/* Légende */}
            <div className="mt-4 border border-slate-300 rounded p-3 text-[11px] text-slate-600 print:mt-3 print:text-[9px] print:border-slate-400">
              <div className="font-semibold mb-2 text-slate-700 uppercase tracking-wide text-[10px] print:text-[8px]">Légende</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span className="flex items-center gap-1">
                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-blue-100 text-blue-700 text-[9px] font-bold">
                    <Heart className="h-2.5 w-2.5" />1
                  </span>
                  Jour TA du mois
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-yellow-100 text-yellow-700 text-[9px] font-bold">
                    <Pill className="h-2.5 w-2.5" />
                  </span>
                  Traitement à écraser
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-bold">
                    <Syringe className="h-2.5 w-2.5" /><Sun className="h-2.5 w-2.5" />
                  </span>
                  Insuline matin
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-blue-100 text-blue-700 text-[9px] font-bold">
                    <Syringe className="h-2.5 w-2.5" /><Moon className="h-2.5 w-2.5" />
                  </span>
                  Insuline soir
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-red-100 text-red-700 text-[9px] font-bold">
                    <AlertTriangle className="h-2.5 w-2.5" />
                  </span>
                  Anticoagulants
                </span>
                <span className="flex items-center gap-1">
                  <span style={{ fontWeight: 900, color: '#1e293b', fontSize: '11px' }}>I</span>
                  GIR
                </span>
                <span className="flex items-center gap-1">
                  <span style={{
                    fontWeight: 900, color: '#1e293b',
                    border: '2px solid #1e293b', borderRadius: '50%',
                    padding: '0px 3px', display: 'inline-block',
                    lineHeight: '1.3', fontSize: '11px',
                    minWidth: '16px', textAlign: 'center',
                  }}>A</span>
                  Niveau de soins (A à D)
                </span>
                <span className="flex items-center gap-1">
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #93c5fd', background: '#dbeafe', fontSize: 7, fontWeight: 700, color: '#1e293b' }}>L</span>
                  Lit
                </span>
                <span className="flex items-center gap-1">
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #c4b5fd', background: '#f3e8ff', fontSize: 7, fontWeight: 700, color: '#1e293b' }}>F</span>
                  Fauteuil
                </span>
                <span className="flex items-center gap-1">
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #d97706', background: '#fef3c7', fontSize: 7, fontWeight: 700, color: '#1e293b' }}>BG</span>
                  Barrière G
                </span>
                <span className="flex items-center gap-1">
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #d97706', background: '#fef3c7', fontSize: 7, fontWeight: 700, color: '#1e293b' }}>BD</span>
                  Barrière D
                </span>
                <span className="flex items-center gap-1">
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', border: '1.5px solid #d97706', background: '#fef3c7', fontSize: 7, fontWeight: 700, color: '#1e293b' }}>B2</span>
                  Barrière x2
                </span>
                <span className="flex items-center gap-1">
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: '50%', border: '1.5px dashed #94a3b8', background: 'white', fontSize: 7, fontWeight: 700, color: '#1e293b' }}>L</span>
                  Si besoin
                </span>
                <span className="flex items-center gap-1">
                  <EmojiImg src={EMOJI_SOCK} alt="Chaussettes" />
                  Chaussettes
                </span>
                <span className="flex items-center gap-1">
                  <EmojiImg src={EMOJI_LEG} alt="Bas" />
                  Bas
                </span>
                <span className="flex items-center gap-1">
                  <EmojiImg src={EMOJI_ROLL} alt="Bande" />
                  Bande
                </span>
              </div>
            </div>
          </div>
        </div>
        </div>{/* fin card écran */}
      </div>

      {/* ══ Modale mot de passe Paramètres impression ══ */}
      {showPwdDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-7 w-full max-w-xs">
            <div className="flex flex-col items-center gap-2 mb-5">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                <Lock className="h-6 w-6 text-slate-500" />
              </div>
              <h2 className="text-base font-bold text-slate-900">Paramètres impression</h2>
              <p className="text-xs text-slate-500 text-center">Entrez le mot de passe administrateur</p>
            </div>
            <form onSubmit={handlePwdSubmit} className="flex flex-col gap-3">
              <div className="relative">
                <input
                  type={showPwdText ? 'text' : 'password'}
                  value={pwdInput}
                  onChange={e => { setPwdInput(e.target.value); setPwdError(false); }}
                  placeholder="Mot de passe"
                  autoFocus
                  className={`w-full border rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-slate-400 transition-colors ${
                    pwdError ? 'border-red-400 bg-red-50' : 'border-slate-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPwdText(v => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPwdText ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                </button>
              </div>
              {pwdError && <p className="text-xs text-red-500">Mot de passe incorrect</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                >
                  Déverrouiller
                </button>
                <button
                  type="button"
                  onClick={() => setShowPwdDialog(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>{/* fin z-index: 1 */}
    </div>
  );
}
