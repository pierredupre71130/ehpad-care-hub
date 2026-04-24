'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ShieldCheck, Home, Save, CheckSquare, Square,
  Users, Check, AlertCircle, Loader2, Eye,
} from 'lucide-react';
import { AdminPasswordGate } from '@/components/ui/admin-password-gate';
import { MODULES } from '@/components/dashboard/module-config';
import {
  fetchRolePermissions,
  saveRolePermissions,
  getDefaultPermissions,
  CONFIGURABLE_ROLES,
  type RolePermissions,
} from '@/lib/role-permissions';

// ── Page background network ───────────────────────────────────────────────────

const PG_NODES: [number, number][] = (() => {
  const pts: [number, number][] = [];
  const cols = 16, rows = 11;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.round((c / (cols - 1)) * 1500);
      const y = Math.round((r / (rows - 1)) * 1000);
      const ox = ((c * 7 + r * 13) % 50) - 25;
      const oy = ((r * 11 + c * 17) % 50) - 25;
      pts.push([Math.max(0, Math.min(1500, x + ox)), Math.max(0, Math.min(1000, y + oy))]);
    }
  }
  return pts;
})();

const PG_EDGES: [number, number][] = (() => {
  const e: [number, number][] = [];
  for (let i = 0; i < PG_NODES.length; i++)
    for (let j = i + 1; j < PG_NODES.length; j++) {
      const dx = PG_NODES[i][0] - PG_NODES[j][0];
      const dy = PG_NODES[i][1] - PG_NODES[j][1];
      if (dx * dx + dy * dy < 160 * 160) e.push([i, j]);
    }
  return e;
})();

// ── Header network (sparse) ───────────────────────────────────────────────────

const NODES: [number, number][] = [
  [60,80],[180,30],[320,110],[480,55],[630,130],[790,40],[940,105],[1100,25],[1260,90],[1420,50],
  [100,220],[250,175],[410,240],[570,195],[720,260],[880,185],[1030,245],[1190,170],[1350,230],[1470,195],
  [40,380],[200,340],[360,410],[530,360],[680,420],[840,355],[1000,395],[1160,330],[1320,400],[1460,360],
  [120,540],[280,500],[440,565],[600,510],[760,570],[920,505],[1080,555],[1240,490],[1390,545],[1490,510],
];
const EDGES: [number, number][] = (() => {
  const e: [number, number][] = [];
  for (let i = 0; i < NODES.length; i++)
    for (let j = i + 1; j < NODES.length; j++) {
      const dx = NODES[i][0] - NODES[j][0], dy = NODES[i][1] - NODES[j][1];
      if (dx * dx + dy * dy < 220 * 220) e.push([i, j]);
    }
  return e;
})();

// ── Colors ────────────────────────────────────────────────────────────────────

const COLOR_FROM = '#1a3560';
const COLOR_LINE = '#2a4a80';
const COLOR_DOT  = '#3a5a90';

// ── Main export ───────────────────────────────────────────────────────────────

export default function AdminPermissionsPage() {
  return (
    <AdminPasswordGate
      title="Gestion des accès"
      subtitle="Réservé aux administrateurs"
    >
      <AdminPermissionsContent />
    </AdminPasswordGate>
  );
}

// ── Content ───────────────────────────────────────────────────────────────────

function AdminPermissionsContent() {
  const qc = useQueryClient();
  const [localPerms, setLocalPerms] = useState<RolePermissions | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: serverPerms, isLoading } = useQuery({
    queryKey: ['settings', 'role_permissions'],
    queryFn: fetchRolePermissions,
  });

  // Init local state from server
  useEffect(() => {
    if (serverPerms && !localPerms) {
      setLocalPerms(JSON.parse(JSON.stringify(serverPerms)));
    }
  }, [serverPerms, localPerms]);

  const mutation = useMutation({
    mutationFn: saveRolePermissions,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'role_permissions'] });
      setIsDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const cycle = useCallback((role: string, moduleId: string) => {
    setLocalPerms(prev => {
      if (!prev) return prev;
      const current = prev[role]?.[moduleId]; // undefined | 'full' | 'read'
      const updated = { ...prev, [role]: { ...prev[role] } };
      if (!current) {
        updated[role][moduleId] = 'full';
      } else if (current === 'full') {
        updated[role][moduleId] = 'read';
      } else {
        delete updated[role][moduleId];
      }
      setIsDirty(true);
      return updated;
    });
  }, []);

  const toggleAll = useCallback((type: 'role' | 'module', key: string, value: boolean) => {
    setLocalPerms(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      if (type === 'role') {
        updated[key] = {};
        if (value) {
          for (const m of MODULES) updated[key][m.id] = 'full';
        }
      } else {
        // key = moduleId
        for (const { value: rv } of CONFIGURABLE_ROLES) {
          updated[rv] = { ...updated[rv] };
          if (value) {
            updated[rv][key] = 'full';
          } else {
            delete updated[rv][key];
          }
        }
      }
      setIsDirty(true);
      return updated;
    });
  }, []);

  const resetToDefaults = () => {
    setLocalPerms(getDefaultPermissions());
    setIsDirty(true);
  };

  if (isLoading || !localPerms) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#dde4ee' }}>
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#dde4ee' }}>

      {/* ── Page background network ── */}
      <div className="print:hidden" style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.45 }}
          viewBox="0 0 1500 1000" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          {PG_EDGES.map(([i, j], idx) => (
            <line key={idx} x1={PG_NODES[i][0]} y1={PG_NODES[i][1]} x2={PG_NODES[j][0]} y2={PG_NODES[j][1]}
              stroke={COLOR_LINE} strokeWidth="0.8" />
          ))}
          {PG_NODES.map(([x, y], idx) => (
            <circle key={idx} cx={x} cy={y} r="3" fill={COLOR_DOT} />
          ))}
        </svg>
      </div>

      {/* ── Header gradient ── */}
      <header
        className="relative z-10 w-full overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${COLOR_FROM} 0%, #0e4a7a 100%)` }}
      >
        {/* Network overlay in header */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20"
          viewBox="0 0 1500 560" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          {EDGES.map(([i, j], idx) => (
            <line key={idx} x1={NODES[i][0]} y1={NODES[i][1]} x2={NODES[j][0]} y2={NODES[j][1]}
              stroke="white" strokeWidth="0.7" />
          ))}
          {NODES.map(([x, y], idx) => (
            <circle key={idx} cx={x} cy={y} r="3" fill="white" />
          ))}
        </svg>

        <div className="relative max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.15)' }}>
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <div>
              <nav className="flex items-center gap-1 text-white/50 text-xs mb-0.5">
                <Link href="/" className="hover:text-white/80 transition-colors flex items-center gap-1">
                  <Home className="h-3 w-3" /> Accueil
                </Link>
                <span>›</span>
                <span className="text-white/80">Gestion des Accès</span>
              </nav>
              <h1 className="text-xl font-bold text-white leading-tight">Gestion des Accès</h1>
              <p className="text-sm text-white/60 mt-0.5">Définissez les modules visibles par rôle utilisateur</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={resetToDefaults}
              className="hidden sm:flex items-center gap-2 text-white/70 hover:text-white text-sm bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl transition-colors border border-white/10"
            >
              Réinitialiser
            </button>
            <button
              onClick={() => mutation.mutate(localPerms)}
              disabled={!isDirty || mutation.isPending}
              className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all"
              style={{
                background: isDirty
                  ? 'rgba(255,255,255,0.25)'
                  : 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.2)',
                opacity: !isDirty ? 0.5 : 1,
              }}
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saveSuccess ? (
                <Check className="h-4 w-4 text-green-300" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saveSuccess ? 'Enregistré !' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 pb-16">

        {/* Info banner */}
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 mb-6 text-sm text-blue-800">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" />
          <div>
            <span className="font-semibold">L&apos;administrateur</span> a toujours accès à tous les modules en écriture.
            <span className="ml-2">Cliquez sur une case pour cycler : </span>
            <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 bg-white rounded border border-slate-200 text-xs">
              <span className="w-2 h-2 bg-slate-200 rounded-sm inline-block" /> Pas d&apos;accès
            </span>
            →
            <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 bg-blue-50 rounded border border-blue-200 text-xs text-blue-700">
              <Check className="h-3 w-3" /> Accès complet
            </span>
            →
            <span className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 bg-blue-50 rounded border border-blue-200 text-xs text-blue-400">
              <Eye className="h-3 w-3" /> Lecture seule
            </span>
          </div>
        </div>

        {/* Matrix card */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">

          {/* Card header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
              <Users className="h-4.5 w-4.5 text-slate-600" style={{ width: '1.125rem', height: '1.125rem' }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Matrice des permissions</h2>
              <p className="text-xs text-slate-500">{MODULES.length} modules · {CONFIGURABLE_ROLES.length} rôles configurables</p>
            </div>
            {isDirty && (
              <span className="ml-auto text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                Modifications non enregistrées
              </span>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-56">
                    Module
                  </th>
                  {CONFIGURABLE_ROLES.map(role => {
                    const allChecked = MODULES.every(m => !!localPerms[role.value]?.[m.id]);
                    return (
                      <th key={role.value} className="px-3 py-3 text-center" style={{ minWidth: 72 }}>
                        <div className="flex flex-col items-center gap-1.5">
                          <span
                            className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                            style={{ background: role.color + '18', color: role.color }}
                          >
                            {role.shortLabel}
                          </span>
                          <button
                            onClick={() => toggleAll('role', role.value, !allChecked)}
                            title={allChecked ? 'Tout décocher' : 'Tout cocher'}
                            className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            {allChecked
                              ? <CheckSquare className="h-3 w-3" />
                              : <Square className="h-3 w-3" />
                            }
                            {allChecked ? 'Tout' : 'Tout'}
                          </button>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {MODULES.map((mod, idx) => {
                  const Icon = mod.icon;
                  const allChecked = CONFIGURABLE_ROLES.every(r => !!localPerms[r.value]?.[mod.id]);
                  return (
                    <tr
                      key={mod.id}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors"
                    >
                      {/* Module label */}
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: mod.cardFrom + '20' }}
                          >
                            <Icon className="h-4 w-4" style={{ color: mod.cardFrom }} />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-slate-800 leading-tight">{mod.label}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5 leading-tight truncate max-w-[160px]">{mod.description}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role cells — 3 states */}
                      {CONFIGURABLE_ROLES.map(role => {
                        const access = localPerms[role.value]?.[mod.id]; // undefined|'full'|'read'
                        return (
                          <td key={role.value} className="px-3 py-3 text-center">
                            <button
                              onClick={() => cycle(role.value, mod.id)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all hover:scale-110 active:scale-95"
                              style={
                                access === 'full'
                                  ? { background: role.color + '18', border: `1.5px solid ${role.color}50` }
                                  : access === 'read'
                                  ? { background: '#eff6ff', border: '1.5px solid #93c5fd' }
                                  : { background: '#f8fafc', border: '1.5px solid #e2e8f0' }
                              }
                              title={
                                !access ? 'Pas d\'accès → cliquer pour accès complet'
                                : access === 'full' ? 'Accès complet → cliquer pour lecture seule'
                                : 'Lecture seule → cliquer pour supprimer l\'accès'
                              }
                            >
                              {access === 'full' ? (
                                <Check className="h-3.5 w-3.5" style={{ color: role.color }} />
                              ) : access === 'read' ? (
                                <Eye className="h-3.5 w-3.5 text-blue-400" />
                              ) : (
                                <span className="w-2 h-2 rounded-sm bg-slate-200 block" />
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-100">
                  <td className="px-6 py-3 text-xs text-slate-500 font-medium">
                    Basculer une colonne entière →
                  </td>
                  {CONFIGURABLE_ROLES.map(role => {
                    const allChecked = MODULES.every(m => !!localPerms[role.value]?.[m.id]);
                    return (
                      <td key={role.value} className="px-3 py-3 text-center">
                        <button
                          onClick={() => toggleAll('role', role.value, !allChecked)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-slate-200"
                          style={{ background: '#e2e8f0' }}
                          title={allChecked ? 'Tout décocher' : 'Tout cocher'}
                        >
                          {allChecked
                            ? <CheckSquare className="h-3.5 w-3.5 text-slate-600" />
                            : <Square className="h-3.5 w-3.5 text-slate-400" />
                          }
                        </button>
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3 px-1">
          {CONFIGURABLE_ROLES.map(role => (
            <div key={role.value} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span
                className="w-2.5 h-2.5 rounded-sm inline-block"
                style={{ background: role.color }}
              />
              <span className="font-medium">{role.shortLabel}</span>
              <span className="text-slate-400">= {role.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 px-1 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-slate-100 border border-slate-200 inline-flex items-center justify-center"><span className="w-1.5 h-1.5 bg-slate-200 rounded-sm" /></span> Pas d&apos;accès</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-green-50 border border-green-200 inline-flex items-center justify-center"><Check className="h-2.5 w-2.5 text-green-600" /></span> Accès complet (lecture + écriture)</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-50 border border-blue-200 inline-flex items-center justify-center"><Eye className="h-2.5 w-2.5 text-blue-400" /></span> Lecture seule (consultation uniquement)</span>
        </div>

        {/* Save button (bottom) */}
        <div className="mt-8 flex items-center justify-end gap-3">
          <button
            onClick={resetToDefaults}
            className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors bg-white"
          >
            Réinitialiser aux valeurs par défaut
          </button>
          <button
            onClick={() => mutation.mutate(localPerms)}
            disabled={!isDirty || mutation.isPending}
            className="flex items-center gap-2 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #1a3560, #0e4a7a)' }}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saveSuccess ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saveSuccess ? 'Enregistré !' : 'Enregistrer les permissions'}
          </button>
        </div>

        {mutation.isError && (
          <p className="mt-3 text-sm text-red-500 text-center">
            Erreur lors de l&apos;enregistrement. Vérifiez la connexion Supabase.
          </p>
        )}
      </main>
    </div>
  );
}
