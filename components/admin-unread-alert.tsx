'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { MessageSquare, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const SESSION_KEY = 'admin_unread_alert_shown';

type Conversation = {
  conversation_id: string;
  display_name: string;
  unread_count: number;
  last_message: string;
  last_at: string;
};

export function AdminUnreadAlert() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [dismissed, setDismissed] = useState(true); // start hidden until sessionStorage checked

  useEffect(() => {
    // Show only if not already dismissed this session
    if (!sessionStorage.getItem(SESSION_KEY)) {
      setDismissed(false);
    }
  }, []);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['admin-unread-alert'],
    queryFn: async () => {
      const res = await fetch('/api/admin/messages');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAdmin && !dismissed,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const unreadConvs = conversations.filter(c => c.unread_count > 0);
  const totalUnread = unreadConvs.reduce((s, c) => s + c.unread_count, 0);

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    setDismissed(true);
  };

  if (!isAdmin || dismissed || totalUnread === 0) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">

        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-violet-600" />
              </div>
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            </div>
            <div>
              <p className="font-bold text-slate-800">Nouveau{totalUnread > 1 ? 'x' : ''} message{totalUnread > 1 ? 's' : ''}</p>
              <p className="text-xs text-slate-500">Messagerie — non lu{totalUnread > 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corps */}
        <div className="px-5 py-4">
          <p className="text-sm text-slate-600 mb-3">
            {unreadConvs.length === 1
              ? 'Un utilisateur vous a envoyé un message en attente de réponse :'
              : `${unreadConvs.length} utilisateurs ont des messages en attente de réponse :`}
          </p>
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {unreadConvs.map(c => (
              <div
                key={c.conversation_id}
                className="flex items-center gap-3 p-3 bg-violet-50 border border-violet-100 rounded-xl"
              >
                <div className="w-8 h-8 rounded-full bg-violet-200 flex items-center justify-center flex-shrink-0 text-violet-700 font-bold text-sm">
                  {(c.display_name ?? '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{c.display_name}</p>
                  <p className="text-xs text-slate-400 truncate">{c.last_message}</p>
                </div>
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {c.unread_count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Pied */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={handleDismiss}
            className="flex-1 py-2.5 rounded-xl text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Plus tard
          </button>
          <Link
            href="/admin-messagerie"
            onClick={handleDismiss}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 transition-colors text-center"
          >
            Voir les messages
          </Link>
        </div>
      </div>
    </div>
  );
}
