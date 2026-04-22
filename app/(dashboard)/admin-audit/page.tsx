'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ScrollText, Home, Loader2, ShieldAlert, RefreshCw, User, Clock, Filter } from 'lucide-react';
import { AdminPasswordGate } from '@/components/ui/admin-password-gate';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  created_at: string;
  user_email: string | null;
  user_role: string | null;
  action: string;
  resource: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
}

// ── Action labels & colors ────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; color: string; bg: string }> = {
  login:                  { label: 'Connexion',         color: '#16a34a', bg: '#f0fdf4' },
  logout:                 { label: 'Déconnexion',       color: '#64748b', bg: '#f8fafc' },
  session_timeout:        { label: 'Timeout session',   color: '#d97706', bg: '#fffbeb' },
  consignes_save:         { label: 'Consignes sauveg.', color: '#2563eb', bg: '#eff6ff' },
  consignes_lock:         { label: 'Consignes verrouil.', color: '#7c3aed', bg: '#f5f3ff' },
  consignes_email_sent:   { label: 'Email consignes',   color: '#0891b2', bg: '#ecfeff' },
  consignes_delete:       { label: 'Consignes supprim.',color: '#dc2626', bg: '#fef2f2' },
  user_create:            { label: 'Compte créé',       color: '#16a34a', bg: '#f0fdf4' },
  user_update:            { label: 'Compte modifié',    color: '#2563eb', bg: '#eff6ff' },
  user_delete:            { label: 'Compte supprimé',   color: '#dc2626', bg: '#fef2f2' },
  permissions_save:       { label: 'Permissions sauveg.', color: '#7c3aed', bg: '#f5f3ff' },
  permissions_reset:      { label: 'Permissions réinit.', color: '#d97706', bg: '#fffbeb' },
  page_admin_users:       { label: 'Accès gestion users', color: '#64748b', bg: '#f8fafc' },
  page_admin_permissions: { label: 'Accès permissions', color: '#64748b', bg: '#f8fafc' },
  page_audit_log:         { label: 'Accès journal',     color: '#64748b', bg: '#f8fafc' },
};

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? { label: action, color: '#64748b', bg: '#f8fafc' };
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.color}25` }}
    >
      {meta.label}
    </span>
  );
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchLogs(filter: string): Promise<AuditLog[]> {
  const params = new URLSearchParams();
  if (filter) params.set('action', filter);
  const res = await fetch(`/api/admin/audit?${params}`);
  if (!res.ok) throw new Error('Erreur chargement');
  const data = await res.json();
  return data.logs;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminAuditPage() {
  return (
    <AdminPasswordGate title="Journal d'audit" subtitle="Réservé aux administrateurs">
      <AuditContent />
    </AdminPasswordGate>
  );
}

function AuditContent() {
  const [filter, setFilter] = useState('');

  const { data: logs = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'audit', filter],
    queryFn: () => fetchLogs(filter),
    refetchInterval: 60_000, // rafraîchit toutes les minutes
  });

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#dde4ee' }}>

      {/* Header */}
      <header className="relative z-10 w-full overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e4a7a 100%)' }}>
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.15)' }}>
              <ScrollText className="h-6 w-6 text-white" />
            </div>
            <div>
              <nav className="flex items-center gap-1 text-white/50 text-xs mb-0.5">
                <Link href="/" className="hover:text-white/80 transition-colors flex items-center gap-1">
                  <Home className="h-3 w-3" /> Accueil
                </Link>
                <span>›</span>
                <span className="text-white/80">Journal d&apos;audit</span>
              </nav>
              <h1 className="text-xl font-bold text-white leading-tight">Journal d&apos;audit</h1>
              <p className="text-sm text-white/60 mt-0.5">Traçabilité des actions — conformité RGPD</p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all"
            style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.25)' }}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 pb-16">

        {/* Filtre */}
        <div className="bg-white rounded-2xl shadow-sm px-4 py-3 mb-5 flex items-center gap-3">
          <Filter className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="flex-1 text-sm text-slate-700 bg-transparent outline-none"
          >
            <option value="">Toutes les actions</option>
            {Object.entries(ACTION_META).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
          <span className="text-xs text-slate-400 flex-shrink-0">{logs.length} entrée{logs.length > 1 ? 's' : ''}</span>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            Erreur de chargement — vérifiez la connexion Supabase.
          </div>
        )}

        {!isLoading && !error && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {logs.length === 0 ? (
              <div className="px-6 py-16 text-center text-slate-400 text-sm">
                Aucun événement enregistré.
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {logs.map(log => (
                  <div key={log.id} className="px-5 py-3.5 hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-start gap-3">
                      {/* Icône */}
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <User className="h-4 w-4 text-slate-400" />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Ligne 1 : action + email */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <ActionBadge action={log.action} />
                          <span className="text-sm text-slate-700 font-medium truncate">
                            {log.user_email ?? '—'}
                          </span>
                          {log.user_role && (
                            <span className="text-xs text-slate-400">({log.user_role})</span>
                          )}
                        </div>

                        {/* Ligne 2 : date + IP */}
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(log.created_at).toLocaleString('fr-FR', {
                              day: '2-digit', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit', second: '2-digit',
                            })}
                          </span>
                          {log.ip_address && (
                            <span className="text-xs text-slate-400">IP : {log.ip_address}</span>
                          )}
                        </div>

                        {/* Détails */}
                        {log.details && Object.keys(log.details).length > 0 && (
                          <div className="mt-1.5 text-xs text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5 font-mono break-all">
                            {JSON.stringify(log.details)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
