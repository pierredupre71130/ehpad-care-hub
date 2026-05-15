'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { fetchColorOverrides, darkenHex, type ColorOverrides } from '@/lib/module-colors';
import { MODULES } from '@/components/dashboard/module-config';
import { useAuth } from '@/lib/auth-context';
import { useEffectiveRole } from '@/lib/use-effective-role';
import {
  Lock, FolderOpen, Printer, Loader2, ChevronDown, X,
  AlertTriangle, PhoneCall, Pill, Moon, Eye,
} from 'lucide-react';
import { useModuleAccess } from '@/lib/use-module-access';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────────

interface IdeConfig {
  nom: string;
  email: string;
}

interface AstreinteSettings {
  ides: IdeConfig[];
  cadreEmail: string;
}

interface Resident {
  id: string;
  first_name?: string;
  last_name: string;
  room?: string;
  floor?: string;
  section?: string;
  sort_order?: number;
  annotations?: string;
  traitement_ecrase?: boolean;
  anticoagulants?: boolean;
  appel_nuit?: boolean;
  chaussettes_de_contention?: boolean;
  bas_de_contention?: boolean;
  bande_de_contention?: boolean;
  date_naissance?: string;
  medecin?: string;
}

interface NiveauSoin {
  id: string;
  resident_id: string;
  gir?: string;
  niveau_soin?: string;
}

// Emojis sous forme de SVG Twemoji servis localement (sans CDN externe)
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
      className="emoji-icon-print"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    />
  );
}

interface ContentionFiche {
  id: string;
  nom: string;
  traitement: string;
  dotation_nominative?: boolean;
}

interface ConsigneNuit {
  id: string;
  date: string;
  resident_id: string;
  floor: string;
  contenu: string;
  ide_astreinte?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CONTENTION_COLORS: Record<string, string> = {
  lit: 'bg-blue-100 border-blue-300',
  fauteuil: 'bg-purple-100 border-purple-300',
  'barrière gauche': 'bg-amber-100 border-amber-300',
  'barrière droite': 'bg-amber-100 border-amber-300',
  'barrière x2': 'bg-amber-100 border-amber-300',
};

const CONTENTION_BORDER_DASHED: Record<string, string> = {
  lit: 'border-blue-400',
  fauteuil: 'border-purple-400',
  'barrière gauche': 'border-amber-400',
  'barrière droite': 'border-amber-400',
  'barrière x2': 'border-amber-400',
};

function ContentionIconSmall({ label, bg, border }: { label: string; bg: string; border: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 10, height: 10, borderRadius: '50%', background: bg,
      border: `1px solid ${border}`, fontWeight: 'bold', fontSize: 6, color: '#000', flexShrink: 0,
    }}>{label}</span>
  );
}

const CONTENTION_ICONS: Record<string, React.ReactNode> = {
  lit: <ContentionIconSmall label="L" bg="#dbeafe" border="#93c5fd" />,
  fauteuil: <ContentionIconSmall label="F" bg="#f3e8ff" border="#c4b5fd" />,
  'barrière gauche': <ContentionIconSmall label="BG" bg="#fef3c7" border="#d97706" />,
  'barrière droite': <ContentionIconSmall label="BD" bg="#fef3c7" border="#d97706" />,
  'barrière x2': <ContentionIconSmall label="B2" bg="#fef3c7" border="#d97706" />,
};

// ── Network background (style page d'accueil) ────────────────────────────────

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

// ── Supabase helpers ─────────────────────────────────────────────────────────

async function fetchResidents(): Promise<Resident[]> {
  const sb = createClient();
  const { data, error } = await sb.from('residents').select('*').eq('archived', false).order('last_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Resident[];
}

async function fetchNiveauSoin(): Promise<NiveauSoin[]> {
  const sb = createClient();
  const { data, error } = await sb.from('niveau_soin').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as NiveauSoin[];
}

async function fetchContentions(): Promise<ContentionFiche[]> {
  const sb = createClient();
  const { data, error } = await sb.from('contentions').select('id,nom,traitement,dotation_nominative').eq('type_suivi', 'contention');
  if (error) throw new Error(error.message);
  return (data ?? []) as ContentionFiche[];
}

async function fetchConsignesNuit(date: string, floor: string): Promise<ConsigneNuit[]> {
  const sb = createClient();
  const { data, error } = await sb.from('consigne_nuit').select('*').eq('date', date).eq('floor', floor);
  if (error) throw new Error(error.message);
  return (data ?? []) as ConsigneNuit[];
}

async function fetchAstreinteSettings(): Promise<AstreinteSettings> {
  const sb = createClient();
  const { data } = await sb.from('astreinte_settings').select('key,value');
  const rows = (data ?? []) as { key: string; value: unknown }[];
  const byKey = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    ides: (byKey['ides'] as IdeConfig[]) ?? [
      { nom: 'Pierre', email: '' },
      { nom: 'Florence', email: '' },
      { nom: 'Mandy', email: '' },
    ],
    cadreEmail: (byKey['cadre_email'] as string) ?? '',
  };
}

async function fetchCadreMailUnlocked(): Promise<boolean> {
  const sb = createClient();
  const { data } = await sb.from('settings').select('value').eq('key', 'cadre_mail_unlocked').maybeSingle();
  return (data?.value as boolean) ?? false;
}

async function fetchArchivedDates(): Promise<string[]> {
  const sb = createClient();
  const { data } = await sb.from('consigne_nuit').select('date').order('date', { ascending: false });
  const unique = [...new Set((data ?? []).map((r: { date: string }) => r.date))];
  return unique as string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toRoman(num: string | number | undefined): string {
  if (!num) return '';
  const map: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV' };
  return map[String(num).trim()] ?? '';
}

function calcAge(dateNaissance: string): number | null {
  if (!dateNaissance) return null;
  return Math.floor((Date.now() - new Date(dateNaissance).getTime()) / (365.25 * 24 * 3600 * 1000));
}

function isAfterLockTime(selectedDate: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return selectedDate < today;
}

// ── ArchivesPanel ────────────────────────────────────────────────────────────

function ArchivesPanel({ archivedDates, currentDate, onSelectDate, onDeleteDate, onClean, readOnly }: {
  archivedDates: string[];
  currentDate: string;
  onSelectDate: (d: string) => void;
  onDeleteDate: (d: string) => void;
  onClean: () => void;
  readOnly: boolean;
}) {
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  const groupedByMonth: Record<string, string[]> = {};
  archivedDates.forEach(d => {
    const date = new Date(d + 'T12:00:00');
    const monthKey = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
    if (!groupedByMonth[monthKey]) groupedByMonth[monthKey] = [];
    groupedByMonth[monthKey].push(d);
  });
  const sortedMonths = Object.keys(groupedByMonth).sort().reverse();

  const formatMonth = (mk: string) => {
    const [year, month] = mk.split('-');
    return new Date(Number(year), Number(month), 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Archives — {archivedDates.length} date{archivedDates.length > 1 ? 's' : ''}
        </h3>
        {!readOnly && (
          <button onClick={onClean} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100">
            Nettoyer archives vides
          </button>
        )}
      </div>
      {archivedDates.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune archive.</p>
      ) : (
        <div className="space-y-2">
          {sortedMonths.map(monthKey => {
            const isExpanded = expandedMonths[monthKey];
            const dates = groupedByMonth[monthKey];
            return (
              <div key={monthKey} className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }))}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    <span className="text-sm font-medium text-slate-700 capitalize">{formatMonth(monthKey)}</span>
                    <span className="text-xs text-slate-500">({dates.length})</span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {[...dates].sort().reverse().map(d => (
                      <div key={d} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50">
                        <button
                          onClick={() => onSelectDate(d)}
                          className={`flex items-center gap-2 flex-1 text-left px-2 py-1.5 rounded text-sm transition-colors ${d === currentDate ? 'bg-slate-800 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                        >
                          <Lock className="h-3 w-3 text-amber-500 flex-shrink-0" />
                          <span>{new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</span>
                        </button>
                        {!readOnly && (
                          <button
                            onClick={() => onDeleteDate(d)}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors flex-shrink-0"
                            title="Supprimer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── NuitRow ──────────────────────────────────────────────────────────────────

function NuitRow({ resident, note, onChangeNote, locked, girData, contentionItems }: {
  resident: Resident;
  note: string;
  onChangeNote: (id: string, value: string) => void;
  locked: boolean;
  girData: NiveauSoin[];
  contentionItems: Array<{ type: string; siBesoin: boolean }>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(note);
  useEffect(() => { setEditValue(note); }, [note]);

  const girInfo = girData.find(g => g.resident_id === resident.id);
  const girLevel = toRoman(girInfo?.gir);
  const soinLevel = girInfo?.niveau_soin ? String(girInfo.niveau_soin).toUpperCase() : '';

  const age = resident.date_naissance ? calcAge(resident.date_naissance) : null;

  const annotationsText = resident.annotations
    ? resident.annotations.split('\n').filter(l => !l.startsWith('---SUPPL:')).join('\n')
    : '';

  return (
    <tr>
      {/* Chambre */}
      <td style={{ border: '1px solid #475569', padding: '2px 4px' }} className="text-[9px] font-medium text-slate-700">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <span>{resident.room}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            {girLevel && <span style={{ fontWeight: 'bold', fontSize: 8, whiteSpace: 'nowrap' }}>{girLevel}</span>}
            {soinLevel && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 14, height: 14, borderRadius: '50%', border: '1px solid #1e293b',
                fontWeight: 'bold', fontSize: 6, flexShrink: 0,
              }}>{soinLevel}</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 1, marginTop: 2 }}>
          <div style={{ width: 11, height: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {resident.traitement_ecrase && <span style={{ fontSize: 9, lineHeight: 1 }}>💊</span>}
          </div>
          <div style={{ width: 11, height: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {resident.anticoagulants && <AlertTriangle style={{ width: 10, height: 10, color: '#ef4444' }} />}
          </div>
          <div style={{ width: 11, height: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {resident.appel_nuit && <PhoneCall style={{ width: 10, height: 10, color: '#6366f1' }} />}
          </div>
        </div>
      </td>
      {/* Nom */}
      <td style={{ border: '1px solid #475569', padding: '2px 4px' }} className="text-[10px] font-medium text-slate-700">
        <div className="font-semibold whitespace-nowrap">{resident.last_name}</div>
        <div className="whitespace-nowrap text-slate-500">
          {resident.first_name}
          {age !== null && <span className="ml-1 text-slate-400 text-[9px]">({age})</span>}
        </div>
      </td>
      {/* Infos */}
      <td style={{ border: '1px solid #475569', padding: '2px 4px', width: 90, maxWidth: 90 }} className="text-[8px] text-slate-600">
        {annotationsText && (
          <div className="whitespace-normal break-words">{annotationsText}</div>
        )}
      </td>
      {/* Consigne de nuit (éditable) */}
      <td style={{ border: '1px solid #475569', padding: '2px 4px' }} className="text-[9px]">
        {isEditing ? (
          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
            <textarea
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="flex-1 border border-slate-300 rounded px-1 py-0.5 text-xs"
              rows={2}
              autoFocus
            />
            <button
              onClick={() => { onChangeNote(resident.id, editValue); setIsEditing(false); }}
              className="px-1 py-0.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700"
            >✓</button>
            <button
              onClick={() => { setEditValue(note); setIsEditing(false); }}
              className="px-1 py-0.5 bg-slate-300 text-slate-700 rounded text-xs font-medium hover:bg-slate-400"
            >✕</button>
          </div>
        ) : (
          <div
            onClick={() => !locked && setIsEditing(true)}
            className={`min-h-[14px] whitespace-pre-wrap break-words ${locked ? 'cursor-default' : 'cursor-text hover:bg-slate-100'}`}
          >
            {editValue || (locked ? '' : <span className="text-slate-300">—</span>)}
          </div>
        )}
      </td>
      {/* Contentions */}
      <td style={{ border: '1px solid #475569', padding: '2px 4px', width: 44, minWidth: 44 }}>
        <div className="flex flex-wrap gap-0.5 justify-center">
          {contentionItems.map(({ type, siBesoin }, idx) => (
            <span
              key={idx}
              title={`${type}${siBesoin ? ' (si besoin)' : ' (continu)'}`}
              className={`inline-flex items-center justify-center w-4 h-4 rounded-full border ${
                siBesoin
                  ? `bg-white border-dashed ${CONTENTION_BORDER_DASHED[type] ?? 'border-gray-400'}`
                  : `${CONTENTION_COLORS[type] ?? 'bg-gray-100'} border`
              }`}
            >
              {CONTENTION_ICONS[type]}
            </span>
          ))}
          {resident.chaussettes_de_contention && <EmojiImg src={EMOJI_SOCK} alt="Chaussettes de contention" />}
          {resident.bas_de_contention         && <EmojiImg src={EMOJI_LEG}  alt="Bas de contention" />}
          {resident.bande_de_contention       && <EmojiImg src={EMOJI_ROLL} alt="Bande de contention" />}
        </div>
      </td>
    </tr>
  );
}

// ── NuitTable ────────────────────────────────────────────────────────────────

function NuitTable({ residents, notes, onChangeNote, locked, girData, contentionMap }: {
  residents: Resident[];
  notes: Record<string, string>;
  onChangeNote: (id: string, value: string) => void;
  locked: boolean;
  girData: NiveauSoin[];
  contentionMap: Record<string, Array<{ type: string; siBesoin: boolean }>>;
}) {
  const sorted = [...residents].sort((a, b) => {
    const na = parseInt(a.room ?? '0', 10);
    const nb = parseInt(b.room ?? '0', 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return (a.room ?? '').localeCompare(b.room ?? '', 'fr', { numeric: true });
  });

  return (
    <table style={{ borderCollapse: 'collapse', border: '1px solid #475569', width: '100%' }}>
      <colgroup>
        <col style={{ width: 52 }} />
        <col style={{ width: 110 }} />
        <col style={{ width: 90 }} />
        <col />
        <col style={{ width: 44 }} />
      </colgroup>
      <thead>
        <tr style={{ backgroundColor: '#f1f5f9' }}>
          <th style={{ border: '1px solid #475569', padding: '3px 4px', fontSize: 8, textAlign: 'left', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chbre</th>
          <th style={{ border: '1px solid #475569', padding: '3px 4px', fontSize: 8, textAlign: 'left', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nom</th>
          <th style={{ border: '1px solid #475569', padding: '3px 4px', fontSize: 8, textAlign: 'left', fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Infos</th>
          <th style={{ border: '1px solid #475569', padding: '3px 4px', fontSize: 8, textAlign: 'left', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Consignes de nuit</th>
          <th style={{ border: '1px solid #475569', padding: '3px 4px', fontSize: 8, textAlign: 'center', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', width: 44 }}>Cont.</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(r => (
          <NuitRow
            key={r.id}
            resident={r}
            note={notes[r.id] ?? ''}
            onChangeNote={onChangeNote}
            locked={locked}
            girData={girData}
            contentionItems={contentionMap[r.id] ?? []}
          />
        ))}
      </tbody>
    </table>
  );
}

// ── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const circleStyle = (bg: string, border: string, size = 20, fs = 10) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: size, height: size, borderRadius: '50%', background: bg,
    border: `1.5px solid ${border}`, fontWeight: 'bold', fontSize: fs, color: '#000',
  } as React.CSSProperties);

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">Légende</h3>
      <div className="flex gap-3 text-sm text-slate-600 flex-wrap items-center">
        <div className="flex items-center gap-1"><Pill className="h-4 w-4" /><span>TTT écrasés</span></div>
        <div className="flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-red-500" /><span>Anticoag</span></div>
        <div className="flex items-center gap-1"><PhoneCall className="h-4 w-4 text-indigo-500" /><span>Famille nuit</span></div>
        <div className="flex items-center gap-1"><span style={{ fontWeight: 'bold', fontSize: 13 }}>I</span><span>GIR</span></div>
        <div className="flex items-center gap-1">
          <div style={circleStyle('white', '#1e293b', 18, 11)}>A</div><span>Niveau soins</span>
        </div>
        <div className="flex items-center gap-1"><span style={circleStyle('#dbeafe', '#93c5fd')}>L</span><span>Lit</span></div>
        <div className="flex items-center gap-1"><span style={circleStyle('#f3e8ff', '#c4b5fd')}>F</span><span>Fauteuil</span></div>
        <div className="flex items-center gap-1"><span style={circleStyle('#fef3c7', '#d97706', 20, 9)}>BG</span><span>Barrière G</span></div>
        <div className="flex items-center gap-1"><span style={circleStyle('#fef3c7', '#d97706', 20, 9)}>BD</span><span>Barrière D</span></div>
        <div className="flex items-center gap-1"><span style={circleStyle('#fef3c7', '#d97706', 20, 9)}>B2</span><span>BarX2</span></div>
        <div className="flex items-center gap-1"><EmojiImg src={EMOJI_SOCK} alt="Chaussettes" size={16} /><span>Chaussettes</span></div>
        <div className="flex items-center gap-1"><EmojiImg src={EMOJI_LEG}  alt="Bas"         size={16} /><span>Bas</span></div>
        <div className="flex items-center gap-1"><EmojiImg src={EMOJI_ROLL} alt="Bande"       size={16} /><span>Bande</span></div>
        <div className="flex items-center gap-1">
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: 'white', border: '2px dashed #000', fontWeight: 'bold', fontSize: 10 }}>L</span><span>Si besoin</span>
        </div>
      </div>
    </div>
  );
}

// Stable empty arrays
const EMPTY_CONSIGNES: ConsigneNuit[] = [];

// ── Main page ────────────────────────────────────────────────────────────────

export default function ConsignesNuitPage() {
  const queryClient = useQueryClient();
  const access = useModuleAccess('consignesNuit');
  const readOnly = access === 'read';
  const { profile } = useAuth();
  const isAdmin = useEffectiveRole() === 'admin';
  const [activeFloor, setActiveFloor] = useState('RDC');
  const [notesByFloor, setNotesByFloor] = useState<Record<string, Record<string, string>>>({ RDC: {}, '1ER': {} });
  const [infosByFloor, setInfosByFloor] = useState<Record<string, string>>({ RDC: '', '1ER': '' });
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [ideAstreinte, setIdeAstreinte] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showArchives, setShowArchives] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ date: string } | null>(null);
  const [sendCadre, setSendCadre] = useState(false); // désactivé par défaut
  const [showInfoPopup, setShowInfoPopup] = useState(false);

  // Afficher la popup d'info une fois par session
  useEffect(() => {
    const dismissed = sessionStorage.getItem('consignes_nuit_info_dismissed');
    if (!dismissed) setShowInfoPopup(true);
  }, []);

  const dismissInfoPopup = () => {
    sessionStorage.setItem('consignes_nuit_info_dismissed', '1');
    setShowInfoPopup(false);
  };

  // Module color system
  const { data: colorOverrides = {} } = useQuery<ColorOverrides>({
    queryKey: ['settings', 'module_colors'],
    queryFn: fetchColorOverrides,
    staleTime: 30000,
  });
  const nuitModule = MODULES.find(m => m.id === 'consignesNuit');
  const colorFrom = colorOverrides['consignesNuit']?.from ?? nuitModule?.cardFrom ?? '#0f7e8e';
  const colorTo   = colorOverrides['consignesNuit']?.to   ?? nuitModule?.cardTo   ?? '#074f5c';

  // Queries
  const { data: astreinteSettings } = useQuery({ queryKey: ['astreinte_settings'], queryFn: fetchAstreinteSettings });
  const { data: cadreMailUnlocked = false } = useQuery({ queryKey: ['settings', 'cadre_mail_unlocked'], queryFn: fetchCadreMailUnlocked });
  const ides = astreinteSettings?.ides ?? [{ nom: 'Pierre', email: '' }, { nom: 'Florence', email: '' }, { nom: 'Mandy', email: '' }];
  const { data: residents = [], isLoading } = useQuery({ queryKey: ['residents'], queryFn: fetchResidents });
  const { data: girData = [] } = useQuery({ queryKey: ['niveau_soin'], queryFn: fetchNiveauSoin });
  const { data: contentionFiches = [] } = useQuery({ queryKey: ['contentions'], queryFn: fetchContentions });
  const { data: savedRDC = EMPTY_CONSIGNES, isLoading: loadingRDC, status: rdcStatus } = useQuery({ queryKey: ['consignes_nuit', date, 'RDC'], queryFn: () => fetchConsignesNuit(date, 'RDC'), enabled: !!date });
  const { data: saved1ER = EMPTY_CONSIGNES, isLoading: loading1ER, status: erStatus } = useQuery({ queryKey: ['consignes_nuit', date, '1ER'], queryFn: () => fetchConsignesNuit(date, '1ER'), enabled: !!date });
  const { data: archivedDates = [] } = useQuery({ queryKey: ['consignes_nuit_dates'], queryFn: fetchArchivedDates });

  useEffect(() => {
    if (rdcStatus !== 'success') return;
    const notesMap: Record<string, string> = {};
    let infos = '';
    savedRDC.forEach(n => {
      if (n.resident_id === '__infos__') infos = n.contenu;
      else notesMap[n.resident_id] = n.contenu;
    });
    setNotesByFloor(prev => ({ ...prev, RDC: notesMap }));
    setInfosByFloor(prev => ({ ...prev, RDC: infos }));
    if (savedRDC[0]?.ide_astreinte) setIdeAstreinte(savedRDC[0].ide_astreinte);
  }, [savedRDC, rdcStatus]);

  useEffect(() => {
    if (erStatus !== 'success') return;
    const notesMap: Record<string, string> = {};
    let infos = '';
    saved1ER.forEach(n => {
      if (n.resident_id === '__infos__') infos = n.contenu;
      else notesMap[n.resident_id] = n.contenu;
    });
    setNotesByFloor(prev => ({ ...prev, '1ER': notesMap }));
    setInfosByFloor(prev => ({ ...prev, '1ER': infos }));
    if (saved1ER[0]?.ide_astreinte) setIdeAstreinte(saved1ER[0].ide_astreinte);
  }, [saved1ER, erStatus]);

  // Build contention map
  const contentionMap = useMemo(() => {
    const map: Record<string, Array<{ type: string; siBesoin: boolean }>> = {};
    residents.forEach(r => {
      const nom = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();
      const seen = new Set<string>();
      const items: Array<{ type: string; siBesoin: boolean }> = [];
      contentionFiches.filter(f => f.nom === nom).forEach(f => {
        const key = `${f.traitement}-${!!f.dotation_nominative}`;
        if (!seen.has(key)) { seen.add(key); items.push({ type: f.traitement, siBesoin: !!f.dotation_nominative }); }
      });
      map[r.id] = items;
    });
    return map;
  }, [residents, contentionFiches]);

  // Auto-save debounce
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesByFloorRef = useRef(notesByFloor);
  useEffect(() => { notesByFloorRef.current = notesByFloor; }, [notesByFloor]);

  const isLockedRDC = isAfterLockTime(date);
  const isLocked1ER = isAfterLockTime(date);
  const isCurrentLocked = activeFloor === 'RDC' ? isLockedRDC : isLocked1ER;
  const areBothLocked = isLockedRDC && isLocked1ER;

  const saveFloor = async (floor: string, savedNotes: ConsigneNuit[], notes: Record<string, string>, infos?: string) => {
    if (isAfterLockTime(date)) return;
    const sb = createClient();
    const ops: Array<() => Promise<unknown>> = [];
    const savedIds = new Set(savedNotes.map(n => n.resident_id));

    for (const [residentId, contenu] of Object.entries(notes)) {
      const trimmed = contenu?.trim() ?? '';
      if (!trimmed) {
        if (savedIds.has(residentId)) {
          ops.push(async () =>
            sb.from('consigne_nuit')
              .delete()
              .eq('date', date)
              .eq('resident_id', residentId)
              .eq('floor', floor)
          );
        }
        continue;
      }
      const id = residentId;
      const c = contenu;
      ops.push(async () =>
        sb.from('consigne_nuit').upsert(
          { date, resident_id: id, floor, contenu: c, ide_astreinte: ideAstreinte, updated_at: new Date().toISOString() },
          { onConflict: 'date,resident_id,floor' }
        )
      );
    }

    if (infos !== undefined) {
      if (infos.trim()) {
        ops.push(async () =>
          sb.from('consigne_nuit').upsert(
            { date, resident_id: '__infos__', floor, contenu: infos, ide_astreinte: ideAstreinte, updated_at: new Date().toISOString() },
            { onConflict: 'date,resident_id,floor' }
          )
        );
      } else if (savedIds.has('__infos__')) {
        ops.push(async () =>
          sb.from('consigne_nuit')
            .delete()
            .eq('date', date)
            .eq('resident_id', '__infos__')
            .eq('floor', floor)
        );
      }
    }

    await Promise.all(ops.map(fn => fn()));
  };

  const handleChangeNote = (id: string, value: string) => {
    if (isCurrentLocked) return;
    setNotesByFloor(prev => ({ ...prev, [activeFloor]: { ...prev[activeFloor], [id]: value } }));

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const floorAtSave = activeFloor;
    const savedNotesAtSave = floorAtSave === 'RDC' ? savedRDC : saved1ER;
    saveTimerRef.current = setTimeout(async () => {
      const latestNotes = { ...notesByFloorRef.current[floorAtSave], [id]: value };
      await saveFloor(floorAtSave, savedNotesAtSave, latestNotes);
      queryClient.invalidateQueries({ queryKey: ['consignes_nuit', date, floorAtSave] });
      queryClient.invalidateQueries({ queryKey: ['consignes_nuit_dates'] });
    }, 2000);
  };

  const handleSaveAndLock = async () => {
    if (!date) return;
    setIsSaving(true);
    try {
      await Promise.all([
        saveFloor('RDC', savedRDC, notesByFloor['RDC'], infosByFloor['RDC']),
        saveFloor('1ER', saved1ER, notesByFloor['1ER'], infosByFloor['1ER']),
      ]);
      queryClient.invalidateQueries({ queryKey: ['consignes_nuit', date, 'RDC'] });
      queryClient.invalidateQueries({ queryKey: ['consignes_nuit', date, '1ER'] });
      queryClient.invalidateQueries({ queryKey: ['consignes_nuit_dates'] });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteArchive = async () => {
    if (!deleteConfirm) return;
    const sb = createClient();
    await sb.from('consigne_nuit').delete().eq('date', deleteConfirm.date);
    queryClient.invalidateQueries({ queryKey: ['consignes_nuit', deleteConfirm.date, 'RDC'] });
    queryClient.invalidateQueries({ queryKey: ['consignes_nuit', deleteConfirm.date, '1ER'] });
    queryClient.invalidateQueries({ queryKey: ['consignes_nuit_dates'] });
    if (date === deleteConfirm.date) setDate(new Date().toISOString().split('T')[0]);
    setDeleteConfirm(null);
    toast.success('Archive supprimée');
  };

  const cleanEmptyArchives = async () => {
    try {
      const sb = createClient();
      const { data: allRecords } = await sb.from('consigne_nuit').select('*');
      if (!allRecords) return;
      const byDate: Record<string, typeof allRecords> = {};
      allRecords.forEach((r: ConsigneNuit) => { if (!byDate[r.date]) byDate[r.date] = []; byDate[r.date].push(r); });
      const toDelete: string[] = [];
      for (const [, records] of Object.entries(byDate)) {
        const residentRecords = records.filter((r: ConsigneNuit) => r.resident_id !== '__infos__');
        if (residentRecords.length > 0 && !residentRecords.some((r: ConsigneNuit) => r.contenu?.trim())) {
          toDelete.push(...records.map((r: ConsigneNuit) => r.id));
        }
      }
      if (toDelete.length > 0) {
        await sb.from('consigne_nuit').delete().in('id', toDelete);
        queryClient.invalidateQueries({ queryKey: ['consignes_nuit_dates'] });
        toast.success(`${toDelete.length} enregistrement(s) supprimé(s)`);
      } else {
        toast.success('Aucune archive vide');
      }
    } catch (err: unknown) {
      toast.error('Erreur : ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // ── Print ──────────────────────────────────────────────────────────────────

  const buildTableHTML = (residents: Resident[], notes: Record<string, string>) => {
    const sorted = [...residents].sort((a, b) => {
      const na = parseInt(a.room ?? '0', 10);
      const nb = parseInt(b.room ?? '0', 10);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return (a.room ?? '').localeCompare(b.room ?? '', 'fr', { numeric: true });
    });
    const rows = sorted.map(r => {
      const note = notes[r.id] ?? '';
      const age = r.date_naissance ? calcAge(r.date_naissance) : null;
      const svgAnticoag = `<svg style='width:10px;height:10px;color:#ef4444' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z'/><line x1='12' y1='9' x2='12' y2='13'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg>`;
      const svgPhone = `<svg style='width:10px;height:10px;color:#6366f1' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'/></svg>`;
      const slotStyle = `display:inline-flex;align-items:center;justify-content:center;width:11px;height:11px;flex-shrink:0`;
      const iconsHtml = `<div style='display:flex;align-items:center;gap:1px;margin-top:2px'>
        <div style='${slotStyle}'>${r.traitement_ecrase ? `<span style='font-size:9px;line-height:1'>💊</span>` : ''}</div>
        <div style='${slotStyle}'>${r.anticoagulants ? svgAnticoag : ''}</div>
        <div style='${slotStyle}'>${r.appel_nuit ? svgPhone : ''}</div>
      </div>`;

      const girInfo = girData.find(g => g.resident_id === r.id);
      const girLevel = toRoman(girInfo?.gir);
      const soinLevel = girInfo?.niveau_soin ? String(girInfo.niveau_soin).toUpperCase() : '';
      const girSoinHtml = (girLevel || soinLevel) ? `<div style='display:flex;align-items:center;gap:2px;flex-shrink:0'>${girLevel ? `<div style='font-weight:bold;font-size:8px;white-space:nowrap'>${girLevel}</div>` : ''}${soinLevel ? `<div style='display:flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;border:1px solid #1e293b;font-weight:bold;font-size:6px;flex-shrink:0'>${soinLevel}</div>` : ''}</div>` : '';

      const nom = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();
      const contentions = contentionFiches.filter(f => f.nom === nom);
      const seen = new Set<string>();
      const contentionBadges = contentions.filter(f => {
        const k = `${f.traitement}-${!!f.dotation_nominative}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).map(f => {
        const colorMap: Record<string, string> = { lit: '#dbeafe', fauteuil: '#f3e8ff', 'barrière gauche': '#fef3c7', 'barrière droite': '#fef3c7', 'barrière x2': '#fef3c7' };
        const borderMap: Record<string, string> = { lit: '#93c5fd', fauteuil: '#c4b5fd', 'barrière gauche': '#d97706', 'barrière droite': '#d97706', 'barrière x2': '#d97706' };
        const labelMap: Record<string, string> = { lit: 'L', fauteuil: 'F', 'barrière gauche': 'BG', 'barrière droite': 'BD', 'barrière x2': 'B2' };
        const bg = f.dotation_nominative ? 'white' : (colorMap[f.traitement] ?? '#f1f5f9');
        const border = borderMap[f.traitement] ?? '#94a3b8';
        const style = f.dotation_nominative
          ? `display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;border:1.5px dashed ${border};background:white;font-size:6px;font-weight:bold`
          : `display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;border:1.5px solid ${border};background:${bg};font-size:6px;font-weight:bold`;
        return `<span style="${style}" title="${f.traitement}">${labelMap[f.traitement] ?? '?'}</span>`;
      }).join(' ');

      const emojiImg = (src: string, alt: string) =>
        `<img src="${src}" alt="${alt}" title="${alt}" width="14" height="14" class="emoji-icon-print" style="display:inline-block;vertical-align:middle;filter:drop-shadow(0 0 0.18mm #000) drop-shadow(0 0 0.18mm #000)"/>`;
      const contentionEmojis = [
        r.chaussettes_de_contention ? emojiImg(EMOJI_SOCK, 'Chaussettes de contention') : '',
        r.bas_de_contention         ? emojiImg(EMOJI_LEG,  'Bas de contention')         : '',
        r.bande_de_contention       ? emojiImg(EMOJI_ROLL, 'Bande de contention')       : '',
      ].filter(Boolean).join(' ');

      const annotationsText = (r.annotations ?? '').split('\n').filter((l: string) => !l.startsWith('---SUPPL:')).join('<br/>');

      return `<tr>
        <td style="border:1px solid #475569;padding:2px 4px;font-size:9px;font-weight:500;color:#334155">
          <div style='display:flex;align-items:center;justify-content:space-between;gap:2px'>
            <span>${r.room ?? ''}</span>${girSoinHtml}
          </div>${iconsHtml}
        </td>
        <td style="border:1px solid #475569;padding:2px 4px;font-size:10px">
          <strong>${r.last_name}</strong><br/>
          <span style='color:#64748b'>${r.first_name ?? ''}${age !== null ? ` <span style='font-size:8px;color:#94a3b8'>(${age})</span>` : ''}</span>
        </td>
        <td style="border:1px solid #475569;padding:2px 4px;font-size:9px;width:90px;max-width:90px;word-break:break-word">${annotationsText}</td>
        <td style="border:1px solid #475569;padding:2px 4px;font-size:11px;white-space:pre-wrap;word-break:break-word">${note}</td>
        <td style="border:1px solid #475569;padding:2px 4px;font-size:8px;text-align:center"><div style="display:flex;flex-wrap:wrap;gap:1px;justify-content:center;align-items:center">${contentionBadges}${contentionEmojis ? ' ' + contentionEmojis : ''}</div></td>
      </tr>`;
    }).join('');

    return `<table style="border-collapse:collapse;border:1px solid #475569;width:100%;flex:1;height:1px">
      <colgroup><col style='width:52px'/><col style='width:110px'/><col style='width:90px'/><col/><col style='width:44px'/></colgroup>
      <thead><tr style='background:#f1f5f9'>
        <th style='border:1px solid #475569;padding:3px 4px;font-size:8px;text-align:left;color:#64748b;text-transform:uppercase'>Chbre</th>
        <th style='border:1px solid #475569;padding:3px 4px;font-size:8px;text-align:left;color:#64748b;text-transform:uppercase'>Nom</th>
        <th style='border:1px solid #475569;padding:3px 4px;font-size:8px;text-align:left;color:#dc2626;text-transform:uppercase'>Infos</th>
        <th style='border:1px solid #475569;padding:3px 4px;font-size:8px;text-align:left;color:#64748b;text-transform:uppercase'>Consignes de nuit</th>
        <th style='border:1px solid #475569;padding:3px 4px;font-size:8px;text-align:center;color:#64748b;text-transform:uppercase;width:44px'>Cont.</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  };

  const buildPageHTML = (section: string, residentsList: Resident[], notes: Record<string, string>, zoom = 1, infosGenerales = '', floorLabel = activeFloor) => {
    const dateStr = date ? new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const header = `<div style='border-bottom:2px solid #1e293b;margin-bottom:8px;padding-bottom:4px;display:flex;justify-content:space-between;align-items:baseline'>
      <div style='font-size:14px;font-weight:bold;color:#1e293b'>Consignes de Nuit — ${floorLabel} · ${section}</div>
      <div style='font-size:9px;color:#475569'><strong>Date :</strong> ${dateStr} &nbsp;|&nbsp; <strong>IDE d'astreinte :</strong> ${ideAstreinte || '—'}</div>
    </div>`;

    const infosBox = infosGenerales ? `<div style='border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;background:#fffbeb;margin-top:8px'>
      <div style='font-size:8px;font-weight:600;color:#92400e;margin-bottom:4px;text-transform:uppercase'>INFOS</div>
      <div style='font-size:9px;color:#78350f;white-space:pre-wrap'>${infosGenerales}</div>
    </div>` : '';

    const legende = section === 'Long Séjour' ? `<div style='border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;background:#f8fafc'>
      <div style='font-size:8px;font-weight:600;color:#475569;margin-bottom:4px;text-transform:uppercase'>Légende</div>
      <div style='display:flex;gap:6px;font-size:9px;color:#475569;flex-wrap:wrap;align-items:center'>
        <div>💊 <span>TTT écrasés</span></div>
        <div><svg style='display:inline-block;width:11px;height:11px;vertical-align:middle;color:#ef4444' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z'/><line x1='12' y1='9' x2='12' y2='13'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg> <span>Anticoag</span></div>
        <div><svg style='display:inline-block;width:11px;height:11px;vertical-align:middle;color:#6366f1' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'/></svg> <span>Famille nuit</span></div>
        <div><span style='font-weight:bold;font-size:8px'>I</span> <span>GIR</span></div>
        <div><span style='border:1.5px solid #1e293b;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-weight:bold;font-size:7px'>A</span> <span>Niveau soins</span></div>
        <div><span style='display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#dbeafe;border:1.5px solid #93c5fd;font-weight:bold;font-size:9px'>L</span> <span>Lit</span></div>
        <div><span style='display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#f3e8ff;border:1.5px solid #c4b5fd;font-weight:bold;font-size:9px'>F</span> <span>Fauteuil</span></div>
        <div><span style='display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#fef3c7;border:1.5px solid #d97706;font-weight:bold;font-size:8px'>BG</span> <span>BG</span></div>
        <div><span style='display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#fef3c7;border:1.5px solid #d97706;font-weight:bold;font-size:8px'>BD</span> <span>BD</span></div>
        <div><span style='display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#fef3c7;border:1.5px solid #d97706;font-weight:bold;font-size:8px'>B2</span> <span>BarX2</span></div>
        <div><img src='${EMOJI_SOCK}' alt='Chaussettes' width='14' height='14' style='display:inline-block;vertical-align:middle'/> <span>Chaussettes</span></div>
        <div><img src='${EMOJI_LEG}'  alt='Bas'         width='14' height='14' style='display:inline-block;vertical-align:middle'/> <span>Bas</span></div>
        <div><img src='${EMOJI_ROLL}' alt='Bande'       width='14' height='14' style='display:inline-block;vertical-align:middle'/> <span>Bande</span></div>
        <div><span style='display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:white;border:1.5px dashed #000;font-weight:bold;font-size:9px'>L</span> <span>Si besoin</span></div>
      </div></div>${infosBox}` : '';

    const pageContentH = 1083;
    const divH = Math.round(pageContentH / zoom);
    return `<div style='font-family:Arial,sans-serif;background:white;display:flex;flex-direction:column;height:${divH}px;gap:8px;zoom:${zoom}'>${header}${buildTableHTML(residentsList, notes)}${legende}</div>`;
  };

  const measureNaturalHeight = (section: string, residentsList: Resident[], notes: Record<string, string>) => {
    const dateStr = date ? new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const header = `<div style='border-bottom:2px solid #1e293b;margin-bottom:8px;padding-bottom:4px'><div style='font-size:14px;font-weight:bold'>Consignes de Nuit</div><div style='font-size:9px'>${dateStr}</div></div>`;
    const legende = section === 'Long Séjour' ? `<div style='border:1px solid #e2e8f0;padding:8px 12px'><div style='font-size:8px'>Légende</div></div>` : '';
    const tableHTML = buildTableHTML(residentsList, notes).replace('flex:1;height:1px', '');
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:-9999px;left:0;width:746px;visibility:hidden';
    div.innerHTML = `<div style='font-family:Arial,sans-serif;background:white;gap:8px'>${header}${tableHTML}${legende}</div>`;
    document.body.appendChild(div);
    const h = div.scrollHeight;
    document.body.removeChild(div);
    return h;
  };

  // Tri par numéro de chambre (numérique, puis alphabétique en fallback)
  const sortByRoom = (a: Resident, b: Resident) => {
    const na = parseInt(a.room ?? '0', 10);
    const nb = parseInt(b.room ?? '0', 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    return (a.room ?? '').localeCompare(b.room ?? '', 'fr', { numeric: true });
  };

  const sendEmail = async (): Promise<boolean> => {
    const allConsignes: Array<{ room: string; nom: string; floor: string; note: string }> = [];
    const rdcResidents = residents.filter(r => r.floor === 'RDC');
    const erResidents = residents.filter(r => r.floor === '1ER');
    [...rdcResidents].sort(sortByRoom).forEach(r => {
      const note = (notesByFloor['RDC'] ?? {})[r.id] ?? '';
      if (note.trim()) allConsignes.push({ room: r.room ?? '', nom: `${r.last_name} ${r.first_name ?? ''}`.trim(), floor: 'RDC', note });
    });
    [...erResidents].sort(sortByRoom).forEach(r => {
      const note = (notesByFloor['1ER'] ?? {})[r.id] ?? '';
      if (note.trim()) allConsignes.push({ room: r.room ?? '', nom: `${r.last_name} ${r.first_name ?? ''}`.trim(), floor: '1ER', note });
    });

    const ideConfig = ides.find(i => i.nom === ideAstreinte);
    const ideEmail = ideConfig?.email ?? '';
    // Si toggle déverrouillé (admin ou réglage activé) : selon le toggle ; sinon toujours ON
    const effectiveSendCadre = (isAdmin || cadreMailUnlocked) ? sendCadre : true;
    const cadreEmail = effectiveSendCadre ? (astreinteSettings?.cadreEmail ?? '') : '';

    // Vérification avant envoi : au moins un destinataire doit avoir un email
    const hasIdeEmail = ideEmail.trim().length > 0;
    const hasCadreEmail = cadreEmail.trim().length > 0;
    if (!hasIdeEmail && !hasCadreEmail) {
      const lignes: string[] = [];
      if (!hasIdeEmail) lignes.push(`• IDE "${ideAstreinte}" : aucun email configuré`);
      if (effectiveSendCadre && !hasCadreEmail) lignes.push('• Cadre de nuit : aucun email configuré');
      toast.warning(
        `⚠️ Email non envoyé — aucun destinataire :\n${lignes.join('\n')}\n\nRenseignez les emails dans Paramètres Astreintes.`,
        {
          duration: 12000,
          style: { whiteSpace: 'pre-line', fontSize: '13px', lineHeight: '1.6' },
        }
      );
      return false;
    }
    if (!hasIdeEmail) {
      toast.warning(
        `⚠️ Pas d'email pour l'IDE "${ideAstreinte}" — email envoyé au cadre uniquement.\n\nRenseignez l'email IDE dans Paramètres Astreintes.`,
        {
          duration: 10000,
          style: { whiteSpace: 'pre-line', fontSize: '13px', lineHeight: '1.6' },
        }
      );
    }

    try {
      const res = await fetch('/api/send-consignes-nuit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, ideNom: ideAstreinte || 'Non renseigné', ideEmail, cadreEmail, consignes: allConsignes }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error('Email non envoyé : ' + (json.error ?? 'Erreur inconnue'), { duration: 8000 });
        return false;
      } else {
        const recipients = json.recipients as string[];
        toast.success(
          `📧 Email${recipients.length > 1 ? 's' : ''} envoyé${recipients.length > 1 ? 's' : ''} :\n${recipients.join('\n')}`,
          {
            duration: 12000,
            style: { whiteSpace: 'pre-line', fontSize: '13px', lineHeight: '1.6' },
          }
        );
        return true;
      }
    } catch {
      toast.error('Erreur réseau lors de l\'envoi de l\'email', { duration: 8000 });
      return false;
    }
  };

  const handleQuickPrint = () => {
    try {
      const notes = notesByFloor[activeFloor] ?? {};
      const currentInfos = infosByFloor[activeFloor] ?? '';
      const pageContentH = 1083;
      const rectoH = measureNaturalHeight('Mapad', mapadResidents, notes);
      const versoH = measureNaturalHeight('Long Séjour', longSejourResidents, notes);
      const rectoZoom = rectoH > pageContentH ? pageContentH / rectoH : 1;
      const versoZoom = versoH > pageContentH ? pageContentH / versoH : 1;
      const rectoHTML = buildPageHTML('Mapad', mapadResidents, notes, rectoZoom, currentInfos);
      const versoHTML = buildPageHTML('Long Séjour', longSejourResidents, notes, versoZoom, currentInfos);
      const html = `<!DOCTYPE html><html><head><meta charset='utf-8'/>
        <style>
          @page { size: A4 portrait; margin: 0; }
          html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page { width: 794px; height: 1123px; overflow: hidden; box-sizing: border-box; padding: 20px 24px; page-break-after: always; break-after: page; }
          .page:last-child { page-break-after: avoid; break-after: avoid; }
        </style>
      </head><body>
        <div class="page">${rectoHTML}</div>
        <div class="page">${versoHTML}</div>
      </body></html>`;
      const existing = document.getElementById('nuit-print-iframe');
      if (existing) existing.remove();
      const iframe = document.createElement('iframe');
      iframe.id = 'nuit-print-iframe';
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;opacity:0;border:none;z-index:-1;';
      iframe.srcdoc = html;
      document.body.appendChild(iframe);
      iframe.onload = () => setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }, 300);
    } catch (err: unknown) {
      toast.error('Erreur : ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handlePrint = async () => {
    if (!ideAstreinte) {
      toast.error('Veuillez choisir une IDE d\'astreinte avant d\'imprimer');
      return;
    }
    try {
      if (!areBothLocked) {
        await handleSaveAndLock();
        toast.success('Consignes sauvegardées', { duration: 3000 });
      }
      await sendEmail();
      // Petit délai pour laisser la notification s'afficher avant l'impression
      await new Promise(resolve => setTimeout(resolve, 800));

      const pageContentH = 1083;

      // ── RDC ──────────────────────────────────────────────────
      const rdcNotes = notesByFloor['RDC'] ?? {};
      const rdcInfos = infosByFloor['RDC'] ?? '';
      const rdcMapad = residents.filter(r => r.floor === 'RDC' && r.section === 'Mapad');
      const rdcLS    = residents.filter(r => r.floor === 'RDC' && r.section === 'Long Séjour');
      const rdcMapadZoom = (() => { const h = measureNaturalHeight('Mapad', rdcMapad, rdcNotes); return h > pageContentH ? pageContentH / h : 1; })();
      const rdcLSZoom    = (() => { const h = measureNaturalHeight('Long Séjour', rdcLS, rdcNotes); return h > pageContentH ? pageContentH / h : 1; })();

      // ── 1ER ──────────────────────────────────────────────────
      const erNotes = notesByFloor['1ER'] ?? {};
      const erInfos = infosByFloor['1ER'] ?? '';
      const erMapad = residents.filter(r => r.floor === '1ER' && r.section === 'Mapad');
      const erLS    = residents.filter(r => r.floor === '1ER' && r.section === 'Long Séjour');
      const erMapadZoom = (() => { const h = measureNaturalHeight('Mapad', erMapad, erNotes); return h > pageContentH ? pageContentH / h : 1; })();
      const erLSZoom    = (() => { const h = measureNaturalHeight('Long Séjour', erLS, erNotes); return h > pageContentH ? pageContentH / h : 1; })();

      const pages = [
        buildPageHTML('Mapad',       rdcMapad, rdcNotes, rdcMapadZoom, rdcInfos, 'RDC'),
        buildPageHTML('Long Séjour', rdcLS,    rdcNotes, rdcLSZoom,    rdcInfos, 'RDC'),
        buildPageHTML('Mapad',       erMapad,  erNotes,  erMapadZoom,  erInfos,  '1ER'),
        buildPageHTML('Long Séjour', erLS,     erNotes,  erLSZoom,     erInfos,  '1ER'),
      ];

      const html = `<!DOCTYPE html><html><head><meta charset='utf-8'/>
        <style>
          @page { size: A4 portrait; margin: 0; }
          html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page { width: 794px; height: 1123px; overflow: hidden; box-sizing: border-box; padding: 20px 24px; page-break-after: always; break-after: page; }
          .page:last-child { page-break-after: avoid; break-after: avoid; }
        </style>
      </head><body>
        ${pages.map(p => `<div class="page">${p}</div>`).join('')}
      </body></html>`;

      const existing = document.getElementById('nuit-print-iframe');
      if (existing) existing.remove();
      const iframe = document.createElement('iframe');
      iframe.id = 'nuit-print-iframe';
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;opacity:0;border:none;z-index:-1;';
      iframe.srcdoc = html;
      document.body.appendChild(iframe);
      iframe.onload = () => setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }, 300);
    } catch (err: unknown) {
      toast.error('Erreur : ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Derived data
  const floorResidents = residents.filter(r => r.floor === activeFloor);
  const mapadResidents = floorResidents.filter(r => r.section === 'Mapad');
  const longSejourResidents = floorResidents.filter(r => r.section === 'Long Séjour');
  const currentNotes = notesByFloor[activeFloor] ?? {};
  const notesLoading = loadingRDC || loading1ER;

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="min-h-screen relative" style={{ background: '#dde4ee' }}>

      {/* ── Popup d'information ─────────────────────────────────────────────── */}
      {showInfoPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={dismissInfoPopup} />

          {/* Card */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #0f7e8e 0%, #074f5c 100%)' }}>
                <Moon className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Consignes de nuit</h2>
                <p className="text-xs text-slate-500 mt-0.5">Information importante avant de commencer</p>
              </div>
              <button onClick={dismissInfoPopup}
                className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 flex-shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 pb-6 space-y-3">
              {/* Bloc 0 : valider avec ✓ */}
              <div className="flex gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full bg-green-600 flex items-center justify-center text-white text-[11px] font-bold">✓</span>
                <p className="text-sm text-slate-700 leading-snug">
                  Après avoir saisi une consigne, validez-la avec le <span className="font-semibold text-green-700">bouton ✓</span> en fin de ligne.
                  La consigne est alors <span className="font-semibold">sauvegardée automatiquement</span> — vous la retrouverez même sans cliquer sur Imprimer &amp; Sauvegarder.
                </p>
              </div>

              {/* Bloc 1 : deux étages */}
              <div className="flex gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 leading-snug">
                  Remplissez les consignes des <span className="font-semibold">deux étages</span> (RDC et 1ER)
                  avant d'utiliser le bouton <span className="font-semibold">Imprimer &amp; Sauvegarder</span>.
                </p>
              </div>

              {/* Bloc 2 : impression */}
              <div className="flex gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <Printer className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800 leading-snug">
                  L'impression génère automatiquement les <span className="font-semibold">4 pages</span> des
                  deux étages en une seule fois.
                </p>
              </div>

              {/* Bloc 3 : envoi automatique */}
              <div className="flex gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <PhoneCall className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-800 leading-snug">
                  Un résumé sera automatiquement envoyé au <span className="font-semibold">soignant d'astreinte</span> ainsi
                  qu'au <span className="font-semibold">cadre du service</span>.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-5">
              <button onClick={dismissInfoPopup}
                className="w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #0f7e8e 0%, #074f5c 100%)' }}>
                J'ai compris, commencer
              </button>
            </div>
          </div>
        </div>
      )}

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
            <span className="text-white/75">Consignes de Nuit</span>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Title */}
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Moon className="h-6 w-6 text-white" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">Consignes de Nuit</h1>
                <p className="text-sm text-white/60 mt-0.5">Résidence La Fourrier</p>
              </div>
            </div>

            {/* Right side: floor tabs + action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Tabs value={activeFloor} onValueChange={setActiveFloor}>
                <TabsList className="bg-white/15 border border-white/25 h-9">
                  <TabsTrigger
                    value="RDC"
                    className="text-white/70 data-[state=active]:bg-white/25 data-[state=active]:text-white text-sm font-medium px-4"
                  >
                    RDC {isLockedRDC && <Lock className="h-3 w-3 ml-1 text-amber-300" />}
                  </TabsTrigger>
                  <TabsTrigger
                    value="1ER"
                    className="text-white/70 data-[state=active]:bg-white/25 data-[state=active]:text-white text-sm font-medium px-4"
                  >
                    1er Étage {isLocked1ER && <Lock className="h-3 w-3 ml-1 text-amber-300" />}
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowArchives(v => !v)}
                className="bg-white/15 hover:bg-white/25 text-white border border-white/25 gap-1.5"
              >
                <FolderOpen className="h-4 w-4" /> Archives
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleQuickPrint}
                className="bg-white/10 hover:bg-white/20 text-white/80 border border-white/20 border-dashed gap-1.5"
              >
                <Printer className="h-4 w-4" /> Imprimer (test)
              </Button>

              {/* Toggle cadre en copie */}
              {(isAdmin || cadreMailUnlocked) ? (
                /* Admin OU réglage déverrouillé : toggle interactif */
                <button
                  type="button"
                  onClick={() => setSendCadre(v => !v)}
                  title={sendCadre ? 'Cadre en copie — cliquer pour désactiver' : 'Cadre non inclus — cliquer pour activer'}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs font-medium"
                  style={sendCadre
                    ? { background: 'rgba(255,255,255,0.22)', borderColor: 'rgba(255,255,255,0.35)', color: 'white' }
                    : { background: 'rgba(0,0,0,0.2)', borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.45)' }
                  }
                >
                  <span className="relative inline-flex items-center flex-shrink-0" style={{ width: 28, height: 16 }}>
                    <span className="absolute inset-0 rounded-full transition-colors"
                      style={{ background: sendCadre ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)' }} />
                    <span className="absolute w-3 h-3 rounded-full bg-white shadow transition-transform"
                      style={{ transform: sendCadre ? 'translateX(14px)' : 'translateX(2px)', top: 2 }} />
                  </span>
                  <span>Mail au cadre</span>
                </button>
              ) : (
                /* Réglage verrouillé : toujours ON, non modifiable */
                <span
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-default"
                  style={{ background: 'rgba(255,255,255,0.22)', borderColor: 'rgba(255,255,255,0.35)', color: 'white' }}
                  title="Le mail est toujours envoyé au cadre"
                >
                  <span className="relative inline-flex items-center flex-shrink-0" style={{ width: 28, height: 16 }}>
                    <span className="absolute inset-0 rounded-full" style={{ background: 'rgba(255,255,255,0.5)' }} />
                    <span className="absolute w-3 h-3 rounded-full bg-white shadow" style={{ transform: 'translateX(14px)', top: 2 }} />
                  </span>
                  <span>Mail au cadre</span>
                </span>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrint}
                disabled={isSaving || readOnly}
                className="bg-white/20 hover:bg-white/30 text-white border border-white/30 gap-1.5 font-semibold"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                Imprimer &amp; Sauvegarder
              </Button>
            </div>
          </div>

          {/* Date + IDE astreinte row */}
          <div className="flex items-end gap-4 mt-5 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wide">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => { setDate(e.target.value); setShowArchives(false); }}
                className="px-3 py-1.5 rounded-lg text-sm bg-white/15 border border-white/25 text-white placeholder-white/40 focus:outline-none focus:border-white/50 focus:bg-white/20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wide">IDE d&apos;astreinte</label>
              <select
                value={ideAstreinte}
                onChange={e => setIdeAstreinte(e.target.value)}
                disabled={areBothLocked}
                className="px-3 py-1.5 rounded-lg text-sm bg-white/15 border border-white/25 text-white focus:outline-none focus:border-white/50 disabled:opacity-50"
                style={{ colorScheme: 'dark' }}
              >
                <option value="" className="bg-slate-800">— Sélectionner —</option>
                {ides.map(ide => (
                  <option key={ide.nom} value={ide.nom} className="bg-slate-800">{ide.nom}</option>
                ))}
                {ideAstreinte && !ides.find(i => i.nom === ideAstreinte) && (
                  <option value={ideAstreinte} className="bg-slate-800">{ideAstreinte}</option>
                )}
              </select>
            </div>
            {areBothLocked && (
              <span className="flex items-center gap-1.5 text-xs text-amber-200 bg-amber-900/40 border border-amber-400/30 px-3 py-1.5 rounded-lg font-medium mb-0.5">
                <Lock className="h-3.5 w-3.5" /> Verrouillé (jour passé)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Lecture seule badge ── */}
      {readOnly && (
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-0 text-sm text-blue-700 font-medium">
            <Eye className="h-4 w-4 flex-shrink-0" />
            Vous consultez cette page en lecture seule.
          </div>
        </div>
      )}

      {/* ── Archives panel ── */}
      {showArchives && (
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <ArchivesPanel
            archivedDates={archivedDates}
            currentDate={date}
            onSelectDate={d => { setDate(d); setShowArchives(false); }}
            onDeleteDate={d => setDeleteConfirm({ date: d })}
            onClean={cleanEmptyArchives}
            readOnly={readOnly}
          />
          <button onClick={() => setShowArchives(false)} className="mt-3 text-slate-400 hover:text-slate-700 text-xs underline">
            Fermer les archives
          </button>
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-slate-900 mb-1">Supprimer les consignes</h3>
            <p className="text-sm text-slate-500 mb-5">
              {new Date(deleteConfirm.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Annuler</button>
              <button onClick={handleDeleteArchive} disabled={readOnly} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50">Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {notesLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-white/60 p-6 flex flex-col gap-6">
            <Legend />

            {mapadResidents.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-2">Mapad (Recto)</h2>
                <NuitTable
                  residents={mapadResidents}
                  notes={currentNotes}
                  onChangeNote={handleChangeNote}
                  locked={isCurrentLocked || readOnly}
                  girData={girData}
                  contentionMap={contentionMap}
                />
              </div>
            )}

            {longSejourResidents.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-2">Long Séjour (Verso)</h2>
                <NuitTable
                  residents={longSejourResidents}
                  notes={currentNotes}
                  onChangeNote={handleChangeNote}
                  locked={isCurrentLocked || readOnly}
                  girData={girData}
                  contentionMap={contentionMap}
                />
                <div className="mt-4 border border-amber-200 bg-amber-50 rounded-lg px-4 py-3">
                  <h3 className="text-sm font-semibold text-amber-800 mb-2">INFOS</h3>
                  <textarea
                    value={infosByFloor[activeFloor] ?? ''}
                    onChange={e => setInfosByFloor(prev => ({ ...prev, [activeFloor]: e.target.value }))}
                    disabled={isCurrentLocked || readOnly}
                    className="w-full text-sm border border-amber-200 rounded px-2 py-1.5 bg-white resize-none disabled:opacity-50"
                    rows={3}
                    placeholder="Informations importantes pour la nuit…"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </div>{/* fin z-index: 1 */}
    </div>
  );
}
