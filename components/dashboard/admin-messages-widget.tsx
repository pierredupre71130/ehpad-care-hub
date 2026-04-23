'use client';

import { useQuery } from '@tanstack/react-query';
import { MessageSquare, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ConvSummary {
  conversation_id: string;
  display_name: string;
  role: string | null;
  last_message: string;
  last_at: string;
  unread_count: number;
}

const ROLE_LABELS: Record<string, string> = {
  ide: 'IDE',
  'aide-soignante': 'Aide-soignant(e)',
  as: 'ASH',
  cadre: 'Cadre',
  psychologue: 'Psychologue',
  dieteticienne: 'Diététicienne',
  secretaire: 'Secrétaire',
  medecin: 'Médecin',
  admin: 'Admin',
};

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'à l\'instant';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export function AdminMessagesWidget() {
  const { data: conversations = [] } = useQuery<ConvSummary[]>({
    queryKey: ['admin-messages-summary'],
    queryFn: () => fetch('/api/admin/messages').then(r => r.json()),
    refetchInterval: 20000,
  });

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);
  const latest = conversations.slice(0, 3);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-100">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}
        >
          <MessageSquare className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">Messagerie</p>
          <p className="text-xs text-slate-400">
            {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalUnread > 0 && (
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
              {totalUnread}
            </span>
          )}
          <Link
            href="/admin-messagerie"
            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            Voir tout
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Conversation previews */}
      {latest.length === 0 ? (
        <div className="px-4 py-5 text-center">
          <p className="text-sm text-slate-400">Aucun message reçu</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-50">
          {latest.map(conv => (
            <li key={conv.conversation_id}>
              <Link
                href={`/admin-messagerie?conv=${conv.conversation_id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                {/* Avatar */}
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  conv.unread_count > 0
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-slate-100 text-slate-500'
                )}>
                  {(conv.display_name ?? '?').slice(0, 2).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={cn(
                      'text-sm truncate',
                      conv.unread_count > 0 ? 'font-semibold text-slate-800' : 'font-medium text-slate-600'
                    )}>
                      {conv.display_name}
                    </span>
                    {conv.role && conv.role !== 'admin' && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md flex-shrink-0">
                        {ROLE_LABELS[conv.role] ?? conv.role}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 truncate">{conv.last_message}</p>
                </div>

                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[10px] text-slate-400">{formatTimeAgo(conv.last_at)}</span>
                  {conv.unread_count > 0 && (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {conversations.length > 3 && (
        <div className="px-4 py-2 border-t border-slate-50 text-center">
          <Link
            href="/admin-messagerie"
            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
          >
            +{conversations.length - 3} autre{conversations.length - 3 > 1 ? 's' : ''} conversation{conversations.length - 3 > 1 ? 's' : ''}
          </Link>
        </div>
      )}
    </div>
  );
}
