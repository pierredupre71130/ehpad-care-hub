'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Megaphone, Home, Plus, Trash2, ToggleLeft, ToggleRight,
  Loader2, Users, User, Globe, ChevronDown,
} from 'lucide-react';
import { AdminPasswordGate } from '@/components/ui/admin-password-gate';
import { CONFIGURABLE_ROLES } from '@/lib/role-permissions';
import { cn } from '@/lib/utils';

interface Announcement {
  id: string;
  message: string;
  target_type: 'all' | 'role' | 'user';
  target_value: string | null;
  active: boolean;
  created_at: string;
  expires_at: string | null;
}

const TARGET_LABELS: Record<string, string> = {
  all: 'Tous les utilisateurs',
  ...Object.fromEntries(CONFIGURABLE_ROLES.map(r => [r.value, r.label])),
};

function targetLabel(a: Announcement): string {
  if (a.target_type === 'all') return 'Tous';
  if (a.target_type === 'role') return TARGET_LABELS[a.target_value ?? ''] ?? a.target_value ?? '—';
  if (a.target_type === 'user') return `Utilisateur spécifique`;
  return '—';
}

function targetIcon(a: Announcement) {
  if (a.target_type === 'all') return <Globe className="h-3.5 w-3.5" />;
  if (a.target_type === 'role') return <Users className="h-3.5 w-3.5" />;
  return <User className="h-3.5 w-3.5" />;
}

// ── Page ─────────────────────────────────────────────────────────────────────

function AnnouncementsContent() {
  const qc = useQueryClient();

  // Formulaire
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'role' | 'user'>('all');
  const [targetValue, setTargetValue] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ['admin-announcements'],
    queryFn: () => fetch('/api/admin/announcements').then(r => r.json()),
  });

  const createMut = useMutation({
    mutationFn: (body: object) =>
      fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-announcements'] });
      setMessage('');
      setTargetType('all');
      setTargetValue('');
      setExpiresAt('');
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      fetch(`/api/admin/announcements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-announcements'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-announcements'] }),
  });

  const handleCreate = () => {
    if (!message.trim()) return;
    createMut.mutate({
      message,
      target_type: targetType,
      target_value: targetType !== 'all' ? targetValue || null : null,
      expires_at: expiresAt || null,
    });
  };

  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>
      {/* Header */}
      <header
        className="w-full px-6 py-4 flex items-center gap-4"
        style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}
      >
        <Link href="/" className="text-white/70 hover:text-white transition-colors">
          <Home className="h-5 w-5" />
        </Link>
        <div className="h-5 w-px bg-white/20" />
        <Megaphone className="h-5 w-5 text-amber-300" />
        <h1 className="text-lg font-bold text-white">Annonces & Bandeau</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* ── Créer une annonce ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <h2 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4 text-amber-600" />
            Nouvelle annonce
          </h2>

          {/* Message */}
          <label className="block text-xs font-semibold text-slate-500 mb-1">Message *</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Réunion d'équipe mardi 14h en salle de soins…"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none mb-4"
          />

          {/* Cible */}
          <label className="block text-xs font-semibold text-slate-500 mb-1">Destinataires</label>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {(['all', 'role', 'user'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTargetType(t); setTargetValue(''); }}
                className={cn(
                  'flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors',
                  targetType === t
                    ? 'bg-amber-50 border-amber-400 text-amber-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                )}
              >
                {t === 'all' && <><Globe className="h-3.5 w-3.5" />Tous</>}
                {t === 'role' && <><Users className="h-3.5 w-3.5" />Un rôle</>}
                {t === 'user' && <><User className="h-3.5 w-3.5" />Un utilisateur</>}
              </button>
            ))}
          </div>

          {targetType === 'role' && (
            <div className="relative mb-3">
              <select
                value={targetValue}
                onChange={e => setTargetValue(e.target.value)}
                className="w-full appearance-none px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white pr-8"
              >
                <option value="">— Choisir un rôle —</option>
                {CONFIGURABLE_ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          )}

          {targetType === 'user' && (
            <input
              value={targetValue}
              onChange={e => setTargetValue(e.target.value)}
              placeholder="UUID de l'utilisateur (depuis Gestion des utilisateurs)"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 mb-3 font-mono"
            />
          )}

          {/* Expiration optionnelle */}
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Expiration <span className="font-normal text-slate-400">(optionnel)</span>
          </label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 mb-4"
          />

          <button
            onClick={handleCreate}
            disabled={!message.trim() || createMut.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #92400e, #b45309)' }}
          >
            {createMut.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><Plus className="h-4 w-4" />Publier l&apos;annonce</>
            }
          </button>
        </div>

        {/* ── Liste des annonces ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700">Annonces publiées</h2>
            <span className="text-xs text-slate-400">{announcements.length} au total</span>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : announcements.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">Aucune annonce</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {announcements.map(a => (
                <li key={a.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    {/* Indicateur actif */}
                    <div className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0 mt-1.5',
                      a.active ? 'bg-emerald-500' : 'bg-slate-300'
                    )} />

                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-sm leading-snug',
                        a.active ? 'text-slate-800 font-medium' : 'text-slate-400 line-through'
                      )}>
                        {a.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {/* Cible */}
                        <span className="flex items-center gap-1 text-[11px] bg-slate-100 text-slate-500 rounded-md px-2 py-0.5">
                          {targetIcon(a)}
                          {targetLabel(a)}
                        </span>
                        {/* Date */}
                        <span className="text-[11px] text-slate-400">
                          {new Date(a.created_at).toLocaleDateString('fr-FR', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                        {/* Expiration */}
                        {a.expires_at && (
                          <span className="text-[11px] text-orange-500">
                            expire {new Date(a.expires_at).toLocaleDateString('fr-FR', {
                              day: '2-digit', month: 'short',
                            })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggleMut.mutate({ id: a.id, active: !a.active })}
                        title={a.active ? 'Désactiver' : 'Activer'}
                        className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        {a.active
                          ? <ToggleRight className="h-4.5 w-4.5 text-emerald-500" style={{ width: 18, height: 18 }} />
                          : <ToggleLeft className="h-4.5 w-4.5 text-slate-400" style={{ width: 18, height: 18 }} />
                        }
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Supprimer cette annonce ?')) deleteMut.mutate(a.id);
                        }}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminAnnouncementsPage() {
  return (
    <AdminPasswordGate>
      <AnnouncementsContent />
    </AdminPasswordGate>
  );
}
