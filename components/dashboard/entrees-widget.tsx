'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { DoorOpen, PencilLine, Check, X, TrendingUp } from 'lucide-react';

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchEntreesData(year: number) {
  const sb = createClient();
  const yearStr = String(year);

  // 1. Get or initialize the baseline timestamp.
  // Only residents created after this baseline are counted automatically,
  // so the widget starts at 0 the moment it is first loaded.
  let { data: baselineRow } = await sb
    .from('settings')
    .select('value')
    .eq('key', `entrees_baseline_${yearStr}`)
    .maybeSingle();

  let baseline: string;
  if (baselineRow?.value) {
    baseline = baselineRow.value as string;
  } else {
    baseline = new Date().toISOString();
    await sb.from('settings').upsert(
      { key: `entrees_baseline_${yearStr}`, value: baseline, updated_at: new Date().toISOString() },
      { onConflict: 'key', ignoreDuplicates: true }
    );
  }

  // 2. Count residents created after baseline, with date_entree in current year.
  const [{ count: autoCount }, { data: offsetRow }] = await Promise.all([
    sb
      .from('residents')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', baseline)
      .gte('date_entree', `${yearStr}-01-01`)
      .lte('date_entree', `${yearStr}-12-31`),
    sb
      .from('settings')
      .select('value')
      .eq('key', `entrees_offset_${yearStr}`)
      .maybeSingle(),
  ]);

  const offset = offsetRow?.value ? Number(offsetRow.value) : 0;
  return { autoCount: autoCount ?? 0, offset, total: (autoCount ?? 0) + offset };
}

async function saveOffset(year: number, offset: number) {
  const sb = createClient();
  await sb
    .from('settings')
    .upsert(
      { key: `entrees_offset_${year}`, value: String(offset), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
}

// ── Widget ────────────────────────────────────────────────────────────────────

export function EntreesWidget({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const year = new Date().getFullYear();

  const { data, isLoading } = useQuery({
    queryKey: ['entrees-widget', year],
    queryFn: () => fetchEntreesData(year),
    staleTime: 60 * 1000,
  });

  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');

  const mutation = useMutation({
    mutationFn: (offset: number) => saveOffset(year, offset),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entrees-widget', year] });
      setEditing(false);
    },
  });

  const handleEdit = () => {
    setInputVal(String(data?.offset ?? 0));
    setEditing(true);
  };

  const handleSave = () => {
    const val = parseInt(inputVal, 10);
    if (isNaN(val) || val < 0) return;
    mutation.mutate(val);
  };

  if (isLoading || !data) {
    return <div className="bg-white/70 rounded-2xl h-32 animate-pulse" />;
  }

  const { autoCount, offset, total } = data;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
          <DoorOpen className="h-5 w-5 text-teal-600" />
        </div>
        {isAdmin && !editing && (
          <button
            onClick={handleEdit}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-teal-600 transition-colors px-2 py-1 rounded-lg hover:bg-teal-50"
            title="Saisir les entrées rétroactives"
          >
            <PencilLine className="h-3.5 w-3.5" />
            Ajuster
          </button>
        )}
      </div>

      {/* Chiffre principal */}
      <div className="mb-1">
        <span className="text-4xl font-extrabold text-slate-800 tabular-nums">{total}</span>
      </div>
      <p className="text-sm font-semibold text-slate-600 mb-3">
        Entrées {year}
      </p>

      {/* Détail */}
      {!editing ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <TrendingUp className="h-3 w-3 text-teal-400" />
            <span>{autoCount} enregistrée{autoCount > 1 ? 's' : ''} dans l&apos;app</span>
          </div>
          {offset > 0 && (
            <div className="text-[11px] text-slate-400">
              + {offset} saisie{offset > 1 ? 's' : ''} manuellement (avant déploiement)
            </div>
          )}
        </div>
      ) : (
        /* Formulaire d'édition inline de l'offset */
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <p className="text-[11px] text-slate-500 mb-1">
              Entrées avant déploiement de l&apos;app ({year})
            </p>
            <input
              type="number"
              min={0}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
              autoFocus
              className="w-24 border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-200"
            />
          </div>
          <div className="flex gap-1 mt-4">
            <button
              onClick={handleSave}
              disabled={mutation.isPending}
              className="p-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-600 transition-colors"
              title="Enregistrer"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
              title="Annuler"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
