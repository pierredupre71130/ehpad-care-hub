'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Heart, CalendarCheck, AlertTriangle, CheckCircle2, Clock, ChevronRight } from 'lucide-react';
import Link from 'next/link';

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchPapStats() {
  const sb = createClient();
  const [{ data: paps }, { count: totalResidents }] = await Promise.all([
    sb
      .from('pap')
      .select('id, resident_id, resident_name, date_reunion, created_at')
      .order('date_reunion', { ascending: false, nullsFirst: false }),
    sb
      .from('residents')
      .select('id', { count: 'exact', head: true })
      .eq('archived', false),
  ]);

  const list = paps ?? [];
  const total = totalResidents ?? 0;

  // Résidents distincts avec au moins un PAP
  const distinctResidents = new Set(list.map(p => p.resident_id)).size;

  // PAP le plus récent (par date_reunion)
  const mostRecent = list.find(p => p.date_reunion) ?? list[0] ?? null;

  // Date du plus récent
  const mostRecentDate = mostRecent?.date_reunion
    ? new Date(mostRecent.date_reunion)
    : mostRecent?.created_at
    ? new Date(mostRecent.created_at)
    : null;

  const now = new Date();
  const daysSince = mostRecentDate
    ? Math.floor((now.getTime() - mostRecentDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // PAPs des 30 derniers jours
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentPaps = list.filter(p => {
    const d = p.date_reunion ? new Date(p.date_reunion) : p.created_at ? new Date(p.created_at) : null;
    return d && d >= thirtyDaysAgo;
  });

  return { total, distinctResidents, totalPaps: list.length, mostRecent, mostRecentDate, daysSince, recentPaps };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function RecencyBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-xs text-slate-400">Aucun PAP enregistré</span>;
  if (days <= 7)  return <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Cette semaine</span>;
  if (days <= 30) return <span className="flex items-center gap-1 text-xs font-semibold text-blue-600"><Clock className="h-3.5 w-3.5" />Ce mois-ci</span>;
  if (days <= 90) return <span className="flex items-center gap-1 text-xs font-semibold text-amber-600"><Clock className="h-3.5 w-3.5" />Il y a {days} jours</span>;
  return <span className="flex items-center gap-1 text-xs font-semibold text-red-500"><AlertTriangle className="h-3.5 w-3.5" />Il y a {days} jours</span>;
}

// ── Widget ────────────────────────────────────────────────────────────────────

export function PapStatsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['pap-stats'],
    queryFn: fetchPapStats,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1].map(i => (
          <div key={i} className="bg-white/70 rounded-2xl h-28 animate-pulse" />
        ))}
      </div>
    );
  }

  const { total, distinctResidents, totalPaps, mostRecent, mostRecentDate, daysSince, recentPaps } = data;

  const pct = total > 0 ? Math.round((distinctResidents / total) * 100) : 0;
  const barColor = pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

      {/* ── Carte 1 : PAP effectués ── */}
      <Link href="/pap"
        className="group bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md hover:border-indigo-200 transition-all"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Heart className="h-5 w-5 text-indigo-600" />
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-400 transition-colors mt-1" />
        </div>

        <div className="mb-1">
          <span className="text-3xl font-extrabold text-slate-800">{distinctResidents}</span>
          <span className="text-sm text-slate-400 ml-1">/ {total} résidents</span>
        </div>
        <p className="text-sm font-semibold text-slate-600 mb-3">PAP réalisés</p>

        {/* Barre de progression */}
        <div className="w-full bg-slate-100 rounded-full h-2 mb-1">
          <div
            className="h-2 rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-slate-400">
          <span>{pct}% des résidents</span>
          <span>{totalPaps} version{totalPaps > 1 ? 's' : ''} au total</span>
        </div>
      </Link>

      {/* ── Carte 2 : PAP récent ── */}
      <Link href={mostRecent ? `/pap?view=${mostRecent.resident_id}` : '/pap'}
        className="group bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md hover:border-indigo-200 transition-all"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <CalendarCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-400 transition-colors mt-1" />
        </div>

        <p className="text-sm font-semibold text-slate-600 mb-2">Dernier PAP effectué</p>

        {mostRecent ? (
          <>
            <p className="text-base font-bold text-slate-800 leading-tight">
              {mostRecent.resident_name ?? '—'}
            </p>
            {mostRecentDate && (
              <p className="text-xs text-slate-400 mt-0.5 mb-2">{formatDate(mostRecentDate)}</p>
            )}
            <RecencyBadge days={daysSince} />
          </>
        ) : (
          <p className="text-sm text-slate-400">Aucun PAP enregistré</p>
        )}

        {recentPaps.length > 1 && (
          <p className="text-[11px] text-slate-400 mt-2">
            +{recentPaps.length - 1} autre{recentPaps.length > 2 ? 's' : ''} ce mois-ci
          </p>
        )}
      </Link>

    </div>
  );
}
