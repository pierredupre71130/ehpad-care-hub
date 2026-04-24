'use client';

import { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Printer, X, Camera, Image as ImageIcon, Check, UtensilsCrossed, Eye } from 'lucide-react';
import { useModuleAccess } from '@/lib/use-module-access';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fetchColorOverrides, darkenHex, type ColorOverrides } from '@/lib/module-colors';
import { MODULES } from '@/components/dashboard/module-config';
import { toast } from 'sonner';

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

// ── Types ─────────────────────────────────────────────────────────────────────

interface Resident {
  id: string;
  title?: string;
  first_name?: string;
  last_name: string;
  room?: string;
  floor?: string;
  archived?: boolean;
  regime_mixe?: boolean;
  viande_mixee?: boolean;
  regime_diabetique?: boolean;
  epargne_intestinale?: boolean;
  allergie_poisson?: boolean;
  photo_url?: string;
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function fetchResidents(): Promise<Resident[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('residents')
    .select('id,title,first_name,last_name,room,floor,archived,regime_mixe,viande_mixee,regime_diabetique,epargne_intestinale,allergie_poisson,photo_url')
    .eq('archived', false)
    .order('room');
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

async function fetchSelections(): Promise<Record<string, string[]>> {
  const sb = createClient();
  const { data } = await sb.from('etiquette_selection').select('cle,resident_ids');
  const map: Record<string, string[]> = {};
  (data ?? []).forEach((s: { cle: string; resident_ids: string[] }) => {
    map[s.cle] = s.resident_ids ?? [];
  });
  return map;
}

// ── Label component ───────────────────────────────────────────────────────────

function Etiquette({ resident, withPhoto }: { resident: Resident; withPhoto: boolean }) {
  const name = [resident.title, resident.last_name?.toUpperCase()].filter(Boolean).join(' ');
  const diets: { label: string; color: string }[] = [];
  if (resident.regime_mixe)         diets.push({ label: 'Mixé',              color: '#c2410c' });
  if (resident.viande_mixee)        diets.push({ label: 'Viande mixée',      color: '#b45309' });
  if (resident.regime_diabetique)   diets.push({ label: 'Diabétique',        color: '#7e22ce' });
  if (resident.epargne_intestinale) diets.push({ label: 'Épargne intestinale', color: '#15803d' });
  if (resident.allergie_poisson)    diets.push({ label: '⚠ Allergie poisson', color: '#dc2626' });

  return (
    <div
      className="etiquette-item"
      style={{
        border: '2.5px solid #1e293b',
        borderRadius: 8,
        padding: '8px 14px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        background: '#fff',
        marginBottom: 8,
        pageBreakInside: 'avoid',
        breakInside: 'avoid',
        gap: 14,
        minHeight: withPhoto && resident.photo_url ? 90 : undefined,
      }}
    >
      {withPhoto && resident.photo_url && (
        <img
          src={resident.photo_url}
          alt={name}
          style={{
            width: 70, height: 70, objectFit: 'cover',
            borderRadius: 6, flexShrink: 0, border: '1.5px solid #e2e8f0',
          }}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 32, fontWeight: 900, color: '#0f172a', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </div>
        {resident.first_name && (
          <div style={{ fontSize: 26, fontWeight: 700, color: '#1e293b', lineHeight: 1.1 }}>
            {resident.first_name}
          </div>
        )}
      </div>
      <div style={{
        fontSize: 32, fontWeight: 900, color: '#1e293b', letterSpacing: '0.03em', whiteSpace: 'nowrap',
        borderLeft: '2px solid #e2e8f0',
        borderRight: diets.length > 0 ? '2px solid #e2e8f0' : 'none',
        paddingLeft: 14,
        paddingRight: diets.length > 0 ? 14 : 0,
      }}>
        Ch. {resident.room}
      </div>
      {diets.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center', justifyContent: 'flex-end' }}>
          {diets.map(d => (
            <span key={d.label} style={{ fontSize: 20, fontWeight: 800, color: d.color, whiteSpace: 'nowrap' }}>
              {d.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function getKey(floor: string, repas: string) {
  return `${floor}_${repas}`;
}

export default function EtiquettesRepasPage() {
  const queryClient = useQueryClient();
  const access = useModuleAccess('etiquettesRepas');
  const readOnly = access === 'read';
  const [activeFloor, setActiveFloor] = useState('RDC');
  const [activeRepas, setActiveRepas] = useState('midi');
  const [withPhoto, setWithPhoto] = useState(false);
  const saveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const { data: colorOverrides = {} } = useQuery<ColorOverrides>({
    queryKey: ['settings', 'module_colors'],
    queryFn: fetchColorOverrides,
    staleTime: 30000,
  });

  const etiquettesModule = MODULES.find(m => m.id === 'etiquettesRepas');
  const colorFrom = colorOverrides['etiquettesRepas']?.from ?? etiquettesModule?.cardFrom ?? '#8b30d4';
  const colorTo   = colorOverrides['etiquettesRepas']?.to   ?? etiquettesModule?.cardTo   ?? '#6018a8';

  const { data: residents = [], isLoading: loadingResidents } = useQuery({
    queryKey: ['residents'],
    queryFn: fetchResidents,
  });

  const { data: allSelections = {}, isLoading: loadingSelections } = useQuery({
    queryKey: ['etiquette_selections'],
    queryFn: fetchSelections,
    staleTime: Infinity,
  });

  const currentKey = getKey(activeFloor, activeRepas);
  const selected: string[] = allSelections[currentKey] ?? [];

  const saveToDb = useCallback((key: string, ids: string[]) => {
    if (saveTimerRef.current[key]) clearTimeout(saveTimerRef.current[key]);
    saveTimerRef.current[key] = setTimeout(async () => {
      const sb = createClient();
      const { error } = await sb
        .from('etiquette_selection')
        .upsert({ cle: key, resident_ids: ids, updated_at: new Date().toISOString() }, { onConflict: 'cle' });
      if (error) toast.error(error.message);
    }, 800);
  }, []);

  const setSelected = useCallback((updater: (prev: string[]) => string[]) => {
    queryClient.setQueryData(['etiquette_selections'], (prev: Record<string, string[]> = {}) => {
      const prevSelected = prev[currentKey] ?? [];
      const next = updater(prevSelected);
      saveToDb(currentKey, next);
      return { ...prev, [currentKey]: next };
    });
  }, [currentKey, queryClient, saveToDb]);

  const toggleSelect = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const floorResidents = residents
    .filter(r => r.floor === activeFloor && r.last_name)
    .sort((a, b) => {
      const na = parseInt((a.room || '').replace(/\D/g, '') || '0');
      const nb = parseInt((b.room || '').replace(/\D/g, '') || '0');
      if (na !== nb) return na - nb;
      return (a.room || '').localeCompare(b.room || '');
    });

  const selectedResidents = residents.filter(
    r => selected.includes(r.id) && r.last_name && r.floor === activeFloor
  );

  const hasDiet = (r: Resident) =>
    r.regime_mixe || r.viande_mixee || r.regime_diabetique || r.epargne_intestinale || r.allergie_poisson;

  const isLoading = loadingResidents || loadingSelections;

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
    </div>
  );

  return (
    <div className="min-h-screen relative" style={{ background: '#dde4ee' }}>

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
              <span className="text-white/90">Étiquettes Repas</span>
            </div>

            {/* Icon + title + controls */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                <UtensilsCrossed className="h-6 w-6 text-white" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-white">Étiquettes Repas</h1>
                <p className="text-white/70 text-sm hidden sm:block">Régimes alimentaires et allergies</p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 flex-wrap">

                {/* Floor tabs */}
                <div className="flex bg-black/20 rounded-xl p-1 gap-1">
                  {(['RDC', '1ER'] as const).map(f => (
                    <button key={f}
                      onClick={() => setActiveFloor(f)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                        activeFloor === f
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`}
                    >{f}</button>
                  ))}
                </div>

                {/* Repas tabs */}
                <div className="flex bg-black/20 rounded-xl p-1 gap-1">
                  {[{ val: 'midi', label: 'Midi' }, { val: 'soir', label: 'Soir' }].map(r => (
                    <button key={r.val}
                      onClick={() => setActiveRepas(r.val)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                        activeRepas === r.val
                          ? 'bg-white text-slate-800 shadow-sm'
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`}
                    >{r.label}</button>
                  ))}
                </div>

                {/* Photo toggle */}
                <button
                  onClick={() => setWithPhoto(v => !v)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                    withPhoto
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'bg-black/20 text-white/80 hover:text-white hover:bg-white/30'
                  }`}
                >
                  <ImageIcon className="h-4 w-4" />
                  Avec photos
                </button>

                {/* Print */}
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-semibold transition-colors"
                >
                  <Printer className="h-4 w-4" /> Imprimer
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Corps ── */}
        {readOnly && (
          <div className="screen-only max-w-5xl mx-auto px-4 pt-4">
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700 font-medium">
              <Eye className="h-4 w-4 flex-shrink-0" />
              Vous consultez cette page en lecture seule.
            </div>
          </div>
        )}
        <div className="screen-only max-w-5xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">

          {/* Colonne gauche : sélection */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-2xl shadow-sm border border-white/60 p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="font-semibold text-slate-700">Sélectionner les résidents</h2>
                <span className="text-xs text-slate-400">
                  {activeFloor} · {activeRepas === 'midi' ? 'Midi' : 'Soir'}
                </span>
              </div>

              <p className="text-xs text-slate-400 mb-3">
                Cliquer pour sélectionner · les photos se gèrent dans{' '}
                <span className="font-medium text-slate-500">Gestion des résidents</span>
              </p>

              <div className="flex flex-col gap-1">
                {floorResidents.map(r => {
                  const isSelected = selected.includes(r.id);
                  return (
                    <div
                      key={r.id}
                      onClick={() => !readOnly && toggleSelect(r.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (!readOnly && (e.key === 'Enter' || e.key === ' ')) toggleSelect(r.id); }}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all text-sm border select-none ${
                        readOnly ? 'cursor-default' : 'cursor-pointer'
                      } ${
                        isSelected
                          ? 'bg-blue-50 border-blue-300 text-blue-800 font-semibold'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden bg-slate-100 border border-slate-200">
                        {r.photo_url
                          ? <img src={r.photo_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center">
                              <Camera className="h-3 w-3 text-slate-300" />
                            </div>
                        }
                      </div>
                      <span className="w-10 text-xs text-slate-400 font-mono shrink-0">Ch.{r.room}</span>
                      <span className="font-semibold flex-1 truncate">
                        {r.title} {r.last_name?.toUpperCase()} {r.first_name}
                      </span>
                      {hasDiet(r) && (
                        <span className="text-[10px] text-orange-600 font-semibold shrink-0">régime</span>
                      )}
                      {isSelected && <Check className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                    </div>
                  );
                })}
                {floorResidents.length === 0 && (
                  <div className="text-slate-400 text-sm text-center py-6">Aucun résident sur cet étage</div>
                )}
              </div>

              <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                <button
                  onClick={() => !readOnly && setSelected(() => floorResidents.map(r => r.id))}
                  disabled={readOnly}
                  className="text-xs text-blue-600 hover:underline disabled:opacity-40 disabled:cursor-default"
                >
                  Tout sélectionner
                </button>
                <span className="text-slate-300">·</span>
                <button
                  onClick={() => !readOnly && setSelected(() => [])}
                  disabled={readOnly}
                  className="text-xs text-red-400 hover:underline disabled:opacity-40 disabled:cursor-default"
                >
                  Tout retirer
                </button>
              </div>
            </div>
          </div>

          {/* Colonne droite : résumé */}
          <div className="w-full lg:w-72 shrink-0">
            <div className="bg-white rounded-2xl shadow-sm border border-white/60 p-4 sticky top-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-slate-700">À imprimer</h2>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                  {selectedResidents.length} étiquette{selectedResidents.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex gap-1 mb-3">
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white bg-slate-800">{activeFloor}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold text-white ${activeRepas === 'midi' ? 'bg-amber-400' : 'bg-indigo-500'}`}>
                  {activeRepas === 'midi' ? 'Midi' : 'Soir'}
                </span>
                {withPhoto && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-500 text-white flex items-center gap-1">
                    <ImageIcon className="h-2.5 w-2.5" /> Photos
                  </span>
                )}
              </div>

              {selectedResidents.length === 0 ? (
                <div className="text-slate-400 text-sm text-center py-6">Aucun résident sélectionné</div>
              ) : (
                <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
                  {selectedResidents.map(r => (
                    <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
                      <div className="w-6 h-6 rounded-full flex-shrink-0 overflow-hidden bg-slate-100 border border-slate-200">
                        {r.photo_url
                          ? <img src={r.photo_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center">
                              <Camera className="h-2.5 w-2.5 text-slate-300" />
                            </div>
                        }
                      </div>
                      <span className="text-xs text-slate-400 font-mono w-8 shrink-0">Ch.{r.room}</span>
                      <span className="font-semibold text-blue-800 text-xs flex-1 truncate">
                        {r.title} {r.last_name?.toUpperCase()} {r.first_name}
                      </span>
                      {!readOnly && (
                        <button
                          onClick={() => toggleSelect(r.id)}
                          className="text-red-400 hover:text-red-600 shrink-0"
                          title="Retirer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Aperçu + Zone d'impression ── */}
        <style>{`
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
            body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .screen-only { display: none !important; }
            .print-zone { display: block !important; padding: 0 !important; max-width: 100% !important; }
            .print-zone-inner { box-shadow: none !important; border: none !important; padding: 0 !important; border-radius: 0 !important; }
            .print-zone-header { display: none !important; }
            .etiquette-item { width: 100% !important; box-sizing: border-box; }
            img { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }
        `}</style>

        {selectedResidents.length > 0 && (
          <div className="print-zone max-w-5xl mx-auto px-4 pb-10">
            <div className="print-zone-inner bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="print-zone-header flex items-center gap-2 mb-4 screen-only">
                <h2 className="font-semibold text-slate-700">Aperçu des étiquettes</h2>
                <span className="text-xs text-slate-400">({selectedResidents.length})</span>
                {withPhoto && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">avec photos</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {selectedResidents.map(r => (
                  <Etiquette key={r.id} resident={r} withPhoto={withPhoto} />
                ))}
              </div>
            </div>
          </div>
        )}

      </div>{/* fin z-index: 1 */}
    </div>
  );
}
