'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PillBottle, Upload, Search, Loader2, ChevronRight, Eye, X, Filter,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useModuleAccess } from '@/lib/use-module-access';
import { fetchColorOverrides, type ColorOverrides } from '@/lib/module-colors';
import { MODULES } from '@/components/dashboard/module-config';
import {
  MED_CATEGORIES, extractMedicationsFromFile, type MedResult,
} from '@/lib/extract-medications';

const CATEGORY_COLORS: Record<string, string> = {
  'Antalgiques': 'bg-rose-100 text-rose-800 border-rose-300',
  'Psychotropes': 'bg-purple-100 text-purple-800 border-purple-300',
  'Traitements cardiaques': 'bg-red-100 text-red-800 border-red-300',
  'Anticoagulants': 'bg-amber-100 text-amber-800 border-amber-300',
  'Traitements respiratoires': 'bg-cyan-100 text-cyan-800 border-cyan-300',
  'Traitements diabète': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'Antibiotiques': 'bg-indigo-100 text-indigo-800 border-indigo-300',
  'Contentions': 'bg-orange-100 text-orange-800 border-orange-300',
  'Compléments alimentaires': 'bg-lime-100 text-lime-800 border-lime-300',
};

export default function RechercheOrdonnancesPage() {
  const access = useModuleAccess('rechercheOrdonnances');
  const readOnly = access === 'read';

  const { data: colorOverrides = {} } = useQuery<ColorOverrides>({
    queryKey: ['settings', 'module_colors'],
    queryFn: fetchColorOverrides,
    staleTime: 30000,
  });
  const mod = MODULES.find(m => m.id === 'rechercheOrdonnances');
  const colorFrom = colorOverrides['rechercheOrdonnances']?.from ?? mod?.cardFrom ?? '#FF6B00';
  const colorTo = colorOverrides['rechercheOrdonnances']?.to ?? mod?.cardTo ?? '#cc4f00';

  const allCategories = Object.keys(MED_CATEGORIES);

  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<MedResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set(allCategories));
  const [residentQuery, setResidentQuery] = useState('');
  const [drugQuery, setDrugQuery] = useState('');

  const toggleCat = (c: string) => {
    setSelectedCats(prev => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  const handleFile = (f: File | null) => {
    setFile(f);
    setResults([]);
    setError(null);
  };

  const run = async () => {
    if (!file) { toast.error('Importez un PDF'); return; }
    setProcessing(true);
    setError(null);
    try {
      const list = await extractMedicationsFromFile(file);
      setResults(list);
      if (list.length === 0) toast.info('Aucun médicament reconnu dans ce PDF');
      else toast.success(`${list.length} médicaments extraits`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  };

  // ── Filtre & regroupement ─────────────────────────────────────
  const filtered = useMemo(() => {
    const qR = residentQuery.toLowerCase().trim();
    const qD = drugQuery.toLowerCase().trim();
    return results.filter(r => {
      if (!selectedCats.has(r.category)) return false;
      if (qR && !r.resident.toLowerCase().includes(qR)) return false;
      if (qD && !r.drug.toLowerCase().includes(qD)) return false;
      return true;
    });
  }, [results, selectedCats, residentQuery, drugQuery]);

  const byResident = useMemo(() => {
    const map = new Map<string, MedResult[]>();
    for (const r of filtered) {
      const k = `${r.room}__${r.resident}`;
      const arr = map.get(k) ?? [];
      arr.push(r);
      map.set(k, arr);
    }
    return [...map.entries()]
      .map(([k, arr]) => {
        const [room, resident] = k.split('__');
        return { room, resident, meds: arr.sort((a, b) => a.category.localeCompare(b.category) || a.drug.localeCompare(b.drug)) };
      })
      .sort((a, b) => {
        const na = parseInt((a.room || '0').replace(/\D/g, '') || '0');
        const nb = parseInt((b.room || '0').replace(/\D/g, '') || '0');
        if (na !== nb) return na - nb;
        return a.resident.localeCompare(b.resident);
      });
  }, [filtered]);

  // Stats par catégorie
  const countsByCategory = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of results) c[r.category] = (c[r.category] || 0) + 1;
    return c;
  }, [results]);

  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>
      <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${colorFrom}, ${colorTo})` }}>
        <div className="relative z-10 max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/60 text-xs mb-4">
            <Link href="/" className="hover:text-white/90">Accueil</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/90">Recherche d&apos;ordonnances</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <PillBottle className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-white">Recherche d&apos;ordonnances</h1>
              <p className="text-white/70 text-sm">Médicaments par résident — analyse locale d&apos;un PDF de planning</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {readOnly && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700 font-medium">
            <Eye className="h-4 w-4" /> Lecture seule
          </div>
        )}

        {/* Import PDF */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <p className="text-sm text-slate-600">
            Importez un PDF contenant les ordonnances/planning des résidents. L&apos;analyse se fait
            entièrement dans votre navigateur — aucun fichier n&apos;est envoyé sur un serveur.
          </p>
          <div className="flex gap-2 items-center flex-wrap">
            <label className="flex items-center gap-2 px-4 py-2 rounded-lg border border-orange-300 bg-orange-50 text-orange-700 text-sm font-semibold hover:bg-orange-100 cursor-pointer transition-colors">
              <Upload className="h-4 w-4" />
              {file ? file.name : 'Choisir un PDF'}
              <input type="file" accept="application/pdf" className="hidden"
                onChange={e => handleFile(e.target.files?.[0] || null)} />
            </label>
            {file && (
              <button onClick={() => handleFile(null)} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">
                <X className="h-4 w-4" />
              </button>
            )}
            <button onClick={run} disabled={!file || processing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-40 transition-colors">
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Analyser le PDF
            </button>
            {results.length > 0 && (
              <span className="text-xs text-slate-500 font-medium ml-2">
                {results.length} médicaments extraits · {byResident.length} résidents
              </span>
            )}
          </div>
          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded p-2">{error}</p>
          )}
        </div>

        {results.length > 0 && (
          <>
            {/* Filtres */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <Filter className="h-3.5 w-3.5" /> Filtres
              </div>
              <div className="flex flex-wrap gap-2">
                {allCategories.map(c => {
                  const active = selectedCats.has(c);
                  const count = countsByCategory[c] || 0;
                  return (
                    <button key={c} onClick={() => toggleCat(c)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                        active ? CATEGORY_COLORS[c] || 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                      }`}>
                      {c} <span className="opacity-60">({count})</span>
                    </button>
                  );
                })}
                <button onClick={() => setSelectedCats(new Set(allCategories))}
                  className="text-xs text-slate-500 underline ml-2">Tout</button>
                <button onClick={() => setSelectedCats(new Set())}
                  className="text-xs text-slate-500 underline">Aucun</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input value={residentQuery} onChange={e => setResidentQuery(e.target.value)}
                    placeholder="Filtrer par nom de résident…"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-orange-400" />
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input value={drugQuery} onChange={e => setDrugQuery(e.target.value)}
                    placeholder="Filtrer par nom de médicament…"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-orange-400" />
                </div>
              </div>
            </div>

            {/* Résultats groupés par résident */}
            {byResident.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-400">
                Aucun résultat avec ces filtres.
              </div>
            ) : (
              <div className="space-y-2">
                {byResident.map(({ room, resident, meds }) => (
                  <div key={`${room}-${resident}`} className="bg-white rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-semibold text-slate-800">{resident}</span>
                        {room && <span className="ml-2 text-xs text-slate-500">Ch. {room}</span>}
                      </div>
                      <span className="text-xs text-slate-400">{meds.length} traitement{meds.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {meds.map((m, i) => (
                        <div key={i} className="flex items-center gap-2 px-2 py-1 border border-slate-100 rounded-lg text-sm">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${
                            CATEGORY_COLORS[m.category] || 'bg-slate-100 border-slate-300 text-slate-800'
                          }`}>
                            {m.category}
                          </span>
                          <span className="text-slate-800 truncate" title={m.drug}>{m.drug}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
