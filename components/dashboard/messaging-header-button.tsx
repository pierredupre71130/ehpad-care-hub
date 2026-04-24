'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, X, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'user' | 'admin';
  sender_name: string | null;
  content: string;
  created_at: string;
  read_by_admin: boolean;
  read_by_user: boolean;
}

interface ConvSummary {
  conversation_id: string;
  unread_count: number;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

// ── Bouton header pour les utilisateurs non-admin ─────────────────────────────

function UserMessagingHeaderButton() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [senderName, setSenderName] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profile?.display_name) setSenderName(profile.display_name);
  }, [profile?.display_name]);

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['user-messages'],
    queryFn: () => fetch('/api/messages').then(r => r.json()),
    refetchInterval: open ? 15000 : 60000,
    enabled: true,
  });

  const unreadCount = messages.filter(m => m.sender_type === 'admin' && !m.read_by_user).length;

  useEffect(() => {
    if (open) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [messages, open]);

  useEffect(() => {
    if (open) {
      qc.invalidateQueries({ queryKey: ['user-messages'] });
    }
  }, [open, qc]);

  const sendMut = useMutation({
    mutationFn: (body: { content: string; sender_name: string }) =>
      fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-messages'] });
      setContent('');
    },
  });

  const handleSend = () => {
    if (!content.trim()) return;
    sendMut.mutate({ content, sender_name: senderName });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Bouton header compact */}
      <button
        onClick={() => setOpen(true)}
        className="relative flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white/85 hover:text-white text-xs font-medium px-3 py-1.5 rounded-lg border border-white/15 transition-colors"
        title="Messagerie"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Messagerie</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold ring-2 ring-[#1a3560]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Modale de chat */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(10,20,50,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="px-5 py-4 flex items-center gap-3 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}
            >
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-white">Messagerie</h2>
                <p className="text-xs text-white/70">Administration — EHPAD Care Hub</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4 text-white" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0" style={{ minHeight: 200 }}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center">
                  <MessageSquare className="h-8 w-8 text-slate-200 mb-2" />
                  <p className="text-sm text-slate-400">Aucun message pour l&apos;instant</p>
                  <p className="text-xs text-slate-300 mt-1">Envoyez votre premier message ci-dessous</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isUser = msg.sender_type === 'user';
                  const prevMsg = idx > 0 ? messages[idx - 1] : null;
                  const showDay = !prevMsg || formatDay(prevMsg.created_at) !== formatDay(msg.created_at);
                  return (
                    <div key={msg.id}>
                      {showDay && (
                        <div className="flex items-center gap-2 my-2">
                          <div className="flex-1 h-px bg-slate-100" />
                          <span className="text-[10px] text-slate-400 font-medium">{formatDay(msg.created_at)}</span>
                          <div className="flex-1 h-px bg-slate-100" />
                        </div>
                      )}
                      <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
                        <div
                          className={cn(
                            'max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
                            isUser
                              ? 'bg-indigo-600 text-white rounded-br-sm'
                              : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                          )}
                        >
                          {!isUser && (
                            <p className="text-[10px] font-semibold text-slate-500 mb-0.5">
                              {msg.sender_name ?? 'Administrateur'}
                            </p>
                          )}
                          <p>{msg.content}</p>
                          <p className={cn(
                            'text-[10px] mt-1 text-right',
                            isUser ? 'text-white/60' : 'text-slate-400'
                          )}>
                            {formatTime(msg.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Zone de saisie */}
            <div className="flex-shrink-0 border-t border-slate-100 px-4 py-3 space-y-2 bg-white">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Votre nom <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={senderName}
                  onChange={e => setSenderName(e.target.value)}
                  placeholder="Ex : Marie Dupont"
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 text-slate-700 placeholder:text-slate-400"
                />
              </div>
              <div className="flex gap-2">
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Votre message… (Entrée pour envoyer)"
                  rows={2}
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none text-slate-700 placeholder:text-slate-400"
                />
                <button
                  onClick={handleSend}
                  disabled={!content.trim() || sendMut.isPending}
                  className="w-10 h-10 self-end rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-opacity flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Bouton header pour l'admin ────────────────────────────────────────────────

function AdminMessagingHeaderButton() {
  const router = useRouter();

  const { data: conversations = [] } = useQuery<ConvSummary[]>({
    queryKey: ['admin-messages-summary'],
    queryFn: () => fetch('/api/admin/messages').then(r => r.json()),
    refetchInterval: 20000,
  });

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <button
      onClick={() => router.push('/admin-messagerie')}
      className="relative flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white/85 hover:text-white text-xs font-medium px-3 py-1.5 rounded-lg border border-white/15 transition-colors"
      title="Messagerie — Admin"
    >
      <MessageSquare className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Messagerie</span>
      {totalUnread > 0 && (
        <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold ring-2 ring-[#1a3560]">
          {totalUnread > 9 ? '9+' : totalUnread}
        </span>
      )}
    </button>
  );
}

// ── Export principal ──────────────────────────────────────────────────────────

export function MessagingHeaderButton() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  if (isAdmin) return <AdminMessagingHeaderButton />;
  return <UserMessagingHeaderButton />;
}
