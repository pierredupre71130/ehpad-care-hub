'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { CalendarClock } from 'lucide-react';
import Link from 'next/link';

interface PapRow {
  id: string;
  resident_id: string;
  resident_name: string | null;
  date_reunion: string | null;
  date_reevaluation: string | null;
}

interface ResidentRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

async function fetchUpcoming() {
  const sb = createClient();
  const [{ data: paps }, { data: residents }] = await Promise.all([
    sb.from('pap').select('id, resident_id, resident_name, date_reunion, date_reevaluation'),
    sb.from('residents').select('id, first_name, last_name').eq('archived', false),
  ]);
  return {
    paps: (paps ?? []) as PapRow[],
    residents: (residents ?? []) as ResidentRow[],
  };
}

export function PapUpcomingWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['pap-upcoming'],
    queryFn: fetchUpcoming,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const residentName = (id: string, fallback: string | null) => {
    const r = data.residents.find(x => x.id === id);
    return r ? `${r.last_name ?? ''} ${r.first_name ?? ''}`.trim() : (fallback || '—');
  };

  const reunionsPrevues = data.paps
    .filter(p => p.date_reunion)
    .map(p => ({ ...p, _date: new Date(p.date_reunion as string) }))
    .filter(p => p._date >= today)
    .sort((a, b) => a._date.getTime() - b._date.getTime())
    .slice(0, 5);

  const prochainesReevals = data.paps
    .filter(p => p.date_reevaluation)
    .map(p => ({ ...p, _date: new Date(p.date_reevaluation as string) }))
    .filter(p => p._date >= today)
    .sort((a, b) => a._date.getTime() - b._date.getTime())
    .slice(0, 4);

  if (reunionsPrevues.length === 0 && prochainesReevals.length === 0) return null;

  const labelFor = (d: Date) => {
    const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return 'Demain';
    return `Dans ${diffDays}j`;
  };

  return (
    <div className="space-y-3">
      {reunionsPrevues.length > 0 && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex gap-3 items-start">
          <CalendarClock className="h-5 w-5 text-violet-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-violet-800 text-sm mb-2">Réunions prévues</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {reunionsPrevues.map(p => (
                <Link key={p.id} href={`/pap?edit=${p.resident_id}`}
                  className="text-left bg-white border border-violet-200 rounded-lg px-3 py-2 hover:bg-violet-100 transition-colors">
                  <div className="text-xs font-semibold text-violet-900 truncate">
                    {residentName(p.resident_id, p.resident_name)}
                  </div>
                  <div className="text-xs text-violet-500 mt-0.5">
                    {p._date.toLocaleDateString('fr-FR')} · <span className="font-medium">{labelFor(p._date)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {prochainesReevals.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 items-start">
          <CalendarClock className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-blue-800 text-sm mb-2">Prochaines réévaluations</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {prochainesReevals.map(p => (
                <Link key={p.id} href={`/pap?edit=${p.resident_id}`}
                  className="text-left bg-white border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-100 transition-colors">
                  <div className="text-xs font-semibold text-blue-900 truncate">
                    {residentName(p.resident_id, p.resident_name)}
                  </div>
                  <div className="text-xs text-blue-500 mt-0.5">
                    {p._date.toLocaleDateString('fr-FR')} · <span className="font-medium">{labelFor(p._date)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
