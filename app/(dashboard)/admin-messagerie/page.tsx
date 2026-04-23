'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MessageSquare, Home, Send, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConvSummary {
  conversation_id: string;
  display_name: string;
  role: string | null;
  last_message: string;
  last_at: string;
  unread_count: number;
}

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

// ── Constants ─────────────────────────────────────────────────────────────────

const NODES: [number, number][] = [
  [60,80],[180,30],[320,110],[480,55],[630,130],[790,40],[940,105],[1100,25],[1260,90],[1420,50],
  [100,220],[250,175],[410,240],[570,195],[720,260],[880,185],[1030,245],[1190,170],[1350,230],[1470,195],
  [40,380],[200,340],[360,410],[530,360],[680,420],[840,355],[1000,395],[1160,330],[1320,400],[1460,360],
  [120,540],[280,500],[440,565],[600,510],[760,570],[920,505],[1080,555],[1240,490],[1390,545],[1490,510],
  [60,700],[220,660],[380,720],[550,670],[700,730],[860,665],[1020,715],[1180,650],[1340,700],[1470,670],
  [150,820],[350,790],[560,840],[780,800],[1000,845],[1220,805],[1420,835],
];

const EDGES: [number, number][] = (() => {
  const edges: [number, number][] = [];
  for (let i = 0; i < NODES.length; i++) {
    for (let j = i + 1; j < NODES.length; j++) {
      const dx = NODES[i][0] - NODES[j][0];
      const dy = NODES[i][1] - NODES[j][1];
      if (dx * dx + dy * dy < 220 * 220) edges.push([i, j]);
    }
  }
  return edges;
})();

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'à l\'instant';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Network background ────────────────────────────────────────────────────────

function NetworkBackground() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 1500 860"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      {EDGES.map(([i, j], idx) => (
        <line
          key={idx}
          x1={NODES[i][0]} y1={NODES[i][1]}
          x2={NODES[j][0]} y2={NODES[j][1]}
          stroke="#8aabcc" strokeWidth="0.7" strokeOpacity="0.35"
        />
      ))}
      {NODES.map(([x, y], idx) => (
        <circle key={idx} cx={x} cy={y} r="3.5" fill="#8aabcc" fillOpacity="0.5" />
      ))}
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminMessagingPage() {
  const { profile, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const qc = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const initialConv = searchParams.get('conv');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(initialConv);
  const [replyContent, setReplyContent] = useState('');
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(initialConv ? 'chat' : 'list');

  // Redirect non-admins
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
    if (!isLoading && isAuthenticated && profile?.role !== 'admin') router.replace('/');
  }, [isLoading, isAuthenticated, profile?.role, router]);

  // Conversations list
  const { data: conversations = [] } = useQuery<ConvSummary[]>({
    queryKey: ['admin-messages-summary'],
    queryFn: () => fetch('/api/admin/messages').then(r => r.json()),
    refetchInterval: 20000,
    enabled: profile?.role === 'admin',
  });

  // Messages for selected conversation
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['admin-messages-conv', selectedConvId],
    queryFn: () => fetch(`/api/admin/messages/${selectedConvId}`).then(r => r.json()),
    refetchInterval: selectedConvId ? 10000 : false,
    enabled: !!selectedConvId && profile?.role === 'admin',
  });

  // Scroll to bottom when messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [messages]);

  // Invalidate summary when a conversation is opened (marks read)
  useEffect(() => {
    if (selectedConvId) {
      qc.invalidateQueries({ queryKey: ['admin-messages-summary'] });
    }
  }, [selectedConvId, qc]);

  const replyMut = useMutation({
    mutationFn: (body: { content: string }) =>
      fetch(`/api/admin/messages/${selectedConvId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-messages-conv', selectedConvId] });
      qc.invalidateQueries({ queryKey: ['admin-messages-summary'] });
      setReplyContent('');
    },
  });

  const handleReply = () => {
    if (!replyContent.trim() || !selectedConvId) return;
    replyMut.mutate({ content: replyContent });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleReply();
    }
  };

  const selectConv = (id: string) => {
    setSelectedConvId(id);
    setMobileView('chat');
    qc.invalidateQueries({ queryKey: ['admin-messages-conv', id] });
  };

  const selectedConv = conversations.find(c => c.conversation_id === selectedConvId);

  if (isLoading || !isAuthenticated) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}
      >
        <Loader2 className="h-6 w-6 text-white/60 animate-spin" />
      </div>
    );
  }

  if (profile?.role !== 'admin') return null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#dde4ee' }}>

      {/* Network background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <NetworkBackground />
      </div>

      {/* Header */}
      <header
        className="relative z-30 w-full"
        style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}
      >
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center gap-4">
          <Link href="/" className="text-white/70 hover:text-white transition-colors">
            <Home className="h-5 w-5" />
          </Link>
          <div className="h-5 w-px bg-white/20" />
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white leading-none">Messagerie</h1>
            <p className="text-sm text-white/65 mt-0.5">Conversations avec les utilisateurs</p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        <div className="flex gap-4 h-[calc(100vh-180px)] min-h-[400px]">

          {/* ── Left panel: conversation list ── */}
          <div className={cn(
            'w-full sm:w-80 flex-shrink-0 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden',
            // Mobile: hide when in chat view
            mobileView === 'chat' ? 'hidden sm:flex' : 'flex'
          )}>
            <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-sm font-bold text-slate-700">Conversations</h2>
              <p className="text-xs text-slate-400">{conversations.length} au total</p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                  <MessageSquare className="h-8 w-8 text-slate-200 mb-2" />
                  <p className="text-sm text-slate-400">Aucune conversation</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {conversations.map(conv => (
                    <li key={conv.conversation_id}>
                      <button
                        onClick={() => selectConv(conv.conversation_id)}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors',
                          selectedConvId === conv.conversation_id
                            ? 'bg-indigo-50 border-r-2 border-indigo-500'
                            : 'hover:bg-slate-50'
                        )}
                      >
                        {/* Avatar */}
                        <div className={cn(
                          'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                          conv.unread_count > 0
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-slate-100 text-slate-500'
                        )}>
                          {initials(conv.display_name ?? '?')}
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
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ── Right panel: chat ── */}
          <div className={cn(
            'flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden',
            // Mobile: hide when in list view
            mobileView === 'list' ? 'hidden sm:flex' : 'flex'
          )}>
            {!selectedConvId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}
                >
                  <MessageSquare className="h-8 w-8 text-white" />
                </div>
                <p className="text-base font-semibold text-slate-600">Sélectionnez une conversation</p>
                <p className="text-sm text-slate-400 mt-1">Choisissez un utilisateur dans la liste</p>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
                  {/* Mobile back button */}
                  <button
                    className="sm:hidden p-1 rounded-lg hover:bg-slate-100 transition-colors"
                    onClick={() => setMobileView('list')}
                  >
                    <ArrowLeft className="h-5 w-5 text-slate-500" />
                  </button>

                  {selectedConv && (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 bg-indigo-100 text-indigo-700"
                    >
                      {initials(selectedConv.display_name ?? '?')}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {selectedConv?.display_name ?? 'Utilisateur'}
                    </p>
                    {selectedConv?.role && selectedConv.role !== 'admin' && (
                      <p className="text-xs text-slate-400">
                        {ROLE_LABELS[selectedConv.role] ?? selectedConv.role}
                      </p>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-center">
                      <p className="text-sm text-slate-400">Aucun message dans cette conversation</p>
                    </div>
                  ) : (
                    messages.map((msg, idx) => {
                      const isAdmin = msg.sender_type === 'admin';
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
                          <div className={cn('flex', isAdmin ? 'justify-end' : 'justify-start')}>
                            <div
                              className={cn(
                                'max-w-[70%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
                                isAdmin
                                  ? 'bg-indigo-600 text-white rounded-br-sm'
                                  : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                              )}
                            >
                              {!isAdmin && (
                                <p className="text-[10px] font-semibold text-slate-500 mb-0.5">
                                  {msg.sender_name ?? selectedConv?.display_name ?? 'Utilisateur'}
                                </p>
                              )}
                              <p>{msg.content}</p>
                              <p className={cn(
                                'text-[10px] mt-1 text-right',
                                isAdmin ? 'text-white/60' : 'text-slate-400'
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

                {/* Reply input */}
                <div className="flex-shrink-0 border-t border-slate-100 px-4 py-3 flex gap-2 bg-white">
                  <textarea
                    ref={replyRef}
                    value={replyContent}
                    onChange={e => setReplyContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Répondre… (Entrée pour envoyer)"
                    rows={2}
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none text-slate-700 placeholder:text-slate-400"
                  />
                  <button
                    onClick={handleReply}
                    disabled={!replyContent.trim() || replyMut.isPending}
                    className="w-10 h-10 self-end rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-opacity flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}
                  >
                    {replyMut.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Send className="h-4 w-4" />
                    }
                  </button>
                </div>
              </>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
