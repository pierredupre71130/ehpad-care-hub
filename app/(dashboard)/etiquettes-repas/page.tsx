'use client';

import { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Printer, X, Camera, Image as ImageIcon, Check } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createClient } from '@/lib/supabase/client';
import { HomeButton } from '@/components/ui/home-button';
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

  // Générer des URLs signées pour les résidents qui ont une photo (chemin stocké)
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
      {/* Photo (optionnelle) */}
      {withPhoto && resident.photo_url && (
        <img
          src={resident.photo_url}
          alt={name}
          style={{
            width: 70,
            height: 70,
            objectFit: 'cover',
            borderRadius: 6,
            flexShrink: 0,
            border: '1.5px solid #e2e8f0',
          }}
        />
      )}

      {/* Nom + prénom */}
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

      {/* Chambre */}
      <div style={{
        fontSize: 32, fontWeight: 900, color: '#1e293b', letterSpacing: '0.03em', whiteSpace: 'nowrap',
        borderLeft: '2px solid #e2e8f0',
        borderRight: diets.length > 0 ? '2px solid #e2e8f0' : 'none',
        paddingLeft: 14,
        paddingRight: diets.length > 0 ? 14 : 0,
      }}>
        Ch. {resident.room}
      </div>

      {/* Régimes */}
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
  const [activeFloor, setActiveFloor] = useState('RDC');
  const [activeRepas, setActiveRepas] = useState('midi');
  const [withPhoto, setWithPhoto] = useState(false);
  const saveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const dbRecordIds = useRef<Record<string, string>>({});

  const { data: residents = [], isLoading: loadingResidents } = useQuery({
    queryKey: ['residents'],
    queryFn: fetchResidents,
  });

  const { data: allSelections = {}, isLoading: loadingSelections } = useQuery({
    queryKey: ['etiquette_selections'],
    queryFn: fetchSelections,
    staleTime: Infinity,
  });

  // ── Selections helpers ────────────────────────────────────────────────────

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

  // ── Derived lists ─────────────────────────────────────────────────────────

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
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ── */}
      <div className="screen-only sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <HomeButton />
            <h1 className="text-xl font-bold text-slate-800">Étiquettes Repas</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Toggle photo */}
            <button
              onClick={() => setWithPhoto(v => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                withPhoto
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <ImageIcon className="h-4 w-4" />
              Avec photos
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium"
            >
              <Printer className="h-4 w-4" /> Imprimer
            </button>
          </div>
        </div>
      </div>

      {/* ── Corps ── */}
      <div className="screen-only max-w-5xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">

        {/* Colonne gauche : sélection */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-semibold text-slate-700">Sélectionner les résidents</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <Tabs value={activeFloor} onValueChange={setActiveFloor}>
                  <TabsList className="bg-slate-100">
                    <TabsTrigger value="RDC">RDC</TabsTrigger>
                    <TabsTrigger value="1ER">1er</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Tabs value={activeRepas} onValueChange={setActiveRepas}>
                  <TabsList className="bg-amber-50">
                    <TabsTrigger value="midi" className="data-[state=active]:bg-amber-400 data-[state=active]:text-white">Midi</TabsTrigger>
                    <TabsTrigger value="soir" className="data-[state=active]:bg-indigo-500 data-[state=active]:text-white">Soir</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              Cliquer pour sélectionner · les photos se gèrent dans <span className="font-medium text-slate-500">Gestion des résidents</span>
            </p>

            <div className="flex flex-col gap-1">
              {floorResidents.map(r => {
                const isSelected = selected.includes(r.id);
                return (
                  <div
                    key={r.id}
                    onClick={() => toggleSelect(r.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleSelect(r.id); }}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all text-sm border cursor-pointer select-none ${
                      isSelected
                        ? 'bg-blue-50 border-blue-300 text-blue-800 font-semibold'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {/* Mini photo */}
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

                    {/* Badge régime */}
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

            {/* Tout sélectionner / désélectionner */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelected(() => floorResidents.map(r => r.id))}
                className="text-xs text-blue-600 hover:underline"
              >
                Tout sélectionner
              </button>
              <span className="text-slate-300">·</span>
              <button
                onClick={() => setSelected(() => [])}
                className="text-xs text-red-400 hover:underline"
              >
                Tout retirer
              </button>
            </div>
          </div>
        </div>

        {/* Colonne droite : résumé */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sticky top-24">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-slate-700">À imprimer</h2>
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                {selectedResidents.length} étiquette{selectedResidents.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex gap-1 mb-3">
              {[
                { val: activeFloor,  label: activeFloor,  active: true,  bg: 'bg-slate-800' },
                { val: activeRepas,  label: activeRepas === 'midi' ? 'Midi' : 'Soir', active: true,
                  bg: activeRepas === 'midi' ? 'bg-amber-400' : 'bg-indigo-500' },
              ].map(b => (
                <span key={b.val} className={`text-xs px-2 py-0.5 rounded-full font-semibold text-white ${b.bg}`}>
                  {b.label}
                </span>
              ))}
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
                    {/* Mini photo */}
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
                    <button
                      onClick={() => toggleSelect(r.id)}
                      className="text-red-400 hover:text-red-600 shrink-0"
                      title="Retirer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Aperçu + Zone d'impression (même DOM, images toujours chargées) ── */}
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
          <div className="print-zone-inner bg-white rounded-xl border border-slate-200 shadow-sm p-4">
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
    </div>
  );
}
