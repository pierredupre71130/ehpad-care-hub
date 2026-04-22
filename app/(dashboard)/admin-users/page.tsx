'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Users, Home, UserPlus, Trash2, Pencil, Eye, EyeOff,
  Loader2, Check, X, ShieldAlert, KeyRound, ChevronDown,
  Wand2, Copy, ClipboardCheck,
} from 'lucide-react';
import { AdminPasswordGate } from '@/components/ui/admin-password-gate';
import { CONFIGURABLE_ROLES } from '@/lib/role-permissions';
import { cn } from '@/lib/utils';

// ── Password generator ────────────────────────────────────────────────────────

const UPPER   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // sans I, O (ambigus)
const LOWER   = 'abcdefghjkmnpqrstuvwxyz';    // sans i, l, o
const DIGITS  = '23456789';                    // sans 0, 1
const SYMBOLS = '@#$%!*+-?';

function generatePassword(length = 14): string {
  const all = UPPER + LOWER + DIGITS + SYMBOLS;
  // Garantit au moins un caractère de chaque catégorie
  const mandatory = [
    UPPER  [Math.floor(Math.random() * UPPER.length)],
    LOWER  [Math.floor(Math.random() * LOWER.length)],
    DIGITS [Math.floor(Math.random() * DIGITS.length)],
    SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
  ];
  const rest = Array.from({ length: length - mandatory.length }, () =>
    all[Math.floor(Math.random() * all.length)]
  );
  return [...mandatory, ...rest].sort(() => Math.random() - 0.5).join('');
}

function getStrength(pwd: string): { score: number; label: string; color: string } {
  if (!pwd) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pwd.length >= 8)  score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 2) return { score, label: 'Faible',    color: '#ef4444' };
  if (score <= 4) return { score, label: 'Moyen',     color: '#f59e0b' };
  if (score <= 5) return { score, label: 'Fort',      color: '#22c55e' };
  return               { score, label: 'Très fort',  color: '#10b981' };
}

function StrengthBar({ password }: { password: string }) {
  const { score, label, color } = getStrength(password);
  if (!password) return null;
  const bars = 6;
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex gap-0.5 flex-1">
        {Array.from({ length: bars }).map((_, i) => (
          <div key={i} className="h-1.5 flex-1 rounded-full transition-all"
            style={{ background: i < score ? color : '#e2e8f0' }} />
        ))}
      </div>
      <span className="text-[11px] font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  placeholder = 'Minimum 6 caractères',
  required = false,
  showGenerate = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  showGenerate?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    const pwd = generatePassword(14);
    onChange(pwd);
    setShow(true); // révèle le mot de passe généré
  };

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            placeholder={placeholder}
            value={value}
            onChange={e => onChange(e.target.value)}
            required={required}
            className="input-field pr-10 font-mono tracking-wide"
          />
          <button type="button" onClick={() => setShow(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {/* Copier */}
        <button type="button" onClick={handleCopy} disabled={!value}
          title="Copier le mot de passe"
          className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-300 disabled:opacity-30 transition-colors flex-shrink-0"
        >
          {copied
            ? <ClipboardCheck className="h-4 w-4 text-green-500" />
            : <Copy className="h-4 w-4" />
          }
        </button>

        {/* Générer */}
        {showGenerate && (
          <button type="button" onClick={handleGenerate}
            title="Générer un mot de passe robuste"
            className="flex items-center gap-1.5 px-3 h-10 rounded-lg text-xs font-semibold transition-colors flex-shrink-0"
            style={{ background: '#f0f4ff', color: '#3b72d8', border: '1px solid #c7d7f5' }}
          >
            <Wand2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Générer</span>
          </button>
        )}
      </div>

      <StrengthBar password={value} />

      {copied && (
        <p className="text-[11px] text-green-600 mt-1 flex items-center gap-1">
          <Check className="h-3 w-3" /> Copié dans le presse-papier
        </p>
      )}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AppUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  role: string;
  display_name: string;
}

// ── Role helpers ──────────────────────────────────────────────────────────────

const ALL_ROLES = [
  { value: 'admin',          label: 'Administrateur',    color: '#1a3560' },
  ...CONFIGURABLE_ROLES.map(r => ({ value: r.value, label: r.label, color: r.color })),
];

function getRoleStyle(role: string) {
  return ALL_ROLES.find(r => r.value === role) ?? { label: role, color: '#64748b' };
}

function RoleBadge({ role }: { role: string }) {
  const r = getRoleStyle(role);
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: r.color + '18', color: r.color, border: `1px solid ${r.color}30` }}
    >
      {r.label}
    </span>
  );
}

function Avatar({ name, email, color }: { name: string; email: string; color: string }) {
  const initials = name
    ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : email.slice(0, 2).toUpperCase();
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
      style={{ background: color }}
    >
      {initials}
    </div>
  );
}

// ── Network background ────────────────────────────────────────────────────────

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
      const dx = PG_NODES[i][0] - PG_NODES[j][0], dy = PG_NODES[i][1] - PG_NODES[j][1];
      if (dx * dx + dy * dy < 160 * 160) e.push([i, j]);
    }
  return e;
})();

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchUsers(): Promise<AppUser[]> {
  const res = await fetch('/api/admin/users');
  if (!res.ok) throw new Error('Erreur chargement');
  const data = await res.json();
  return data.users;
}

async function createUser(body: { email: string; password: string; display_name: string; role: string }) {
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Erreur création');
  return data;
}

async function updateUser(id: string, body: { role?: string; display_name?: string; password?: string }) {
  const res = await fetch(`/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Erreur modification');
  return data;
}

async function deleteUser(id: string) {
  const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Erreur suppression');
  return data;
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  return (
    <AdminPasswordGate title="Gestion des utilisateurs" subtitle="Réservé aux administrateurs">
      <AdminUsersContent />
    </AdminPasswordGate>
  );
}

// ── Content ───────────────────────────────────────────────────────────────────

function AdminUsersContent() {
  const qc = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: fetchUsers,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      setDeleteConfirm(null);
    },
  });

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#dde4ee' }}>

      {/* Background network */}
      <div className="print:hidden" style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.45 }}
          viewBox="0 0 1500 1000" preserveAspectRatio="xMidYMid slice">
          {PG_EDGES.map(([i, j], idx) => (
            <line key={idx} x1={PG_NODES[i][0]} y1={PG_NODES[i][1]} x2={PG_NODES[j][0]} y2={PG_NODES[j][1]}
              stroke="#2a4a80" strokeWidth="0.8" />
          ))}
          {PG_NODES.map(([x, y], idx) => (
            <circle key={idx} cx={x} cy={y} r="3" fill="#3a5a90" />
          ))}
        </svg>
      </div>

      {/* Header */}
      <header className="relative z-10 w-full overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e4a7a 100%)' }}>
        <div className="relative max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.15)' }}>
              <Users className="h-6 w-6 text-white" />
            </div>
            <div>
              <nav className="flex items-center gap-1 text-white/50 text-xs mb-0.5">
                <Link href="/" className="hover:text-white/80 transition-colors flex items-center gap-1">
                  <Home className="h-3 w-3" /> Accueil
                </Link>
                <span>›</span>
                <span className="text-white/80">Utilisateurs</span>
              </nav>
              <h1 className="text-xl font-bold text-white leading-tight">Gestion des Utilisateurs</h1>
              <p className="text-sm text-white/60 mt-0.5">Créez et gérez les comptes de connexion</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all"
            style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.25)' }}
          >
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Créer un compte</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 pb-16">

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
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-white rounded-2xl shadow-sm px-4 py-3">
                <div className="text-2xl font-bold text-slate-800">{users.length}</div>
                <div className="text-xs text-slate-500 mt-0.5">Comptes total</div>
              </div>
              {['admin', 'ide', 'cadre', 'aide-soignante'].map(r => (
                <div key={r} className="bg-white rounded-2xl shadow-sm px-4 py-3">
                  <div className="text-2xl font-bold" style={{ color: getRoleStyle(r).color }}>
                    {users.filter(u => u.role === r).length}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{getRoleStyle(r).label}</div>
                </div>
              ))}
            </div>

            {/* Users list */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">
                  {users.length} compte{users.length > 1 ? 's' : ''} enregistré{users.length > 1 ? 's' : ''}
                </h2>
              </div>

              {users.length === 0 ? (
                <div className="px-6 py-16 text-center text-slate-400 text-sm">
                  Aucun utilisateur. Créez le premier compte.
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {users.map(u => {
                    const roleStyle = getRoleStyle(u.role);
                    const isDeleting = deleteMutation.isPending && deleteConfirm === u.id;
                    return (
                      <div key={u.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors">
                        <Avatar name={u.display_name} email={u.email} color={roleStyle.color} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800 truncate">
                              {u.display_name || '—'}
                            </span>
                            <RoleBadge role={u.role} />
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 truncate">{u.email}</div>
                          {u.last_sign_in_at && (
                            <div className="text-xs text-slate-400 mt-0.5">
                              Dernière connexion : {new Date(u.last_sign_in_at).toLocaleDateString('fr-FR', {
                                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                              })}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Edit */}
                          <button
                            onClick={() => setEditingUser(u)}
                            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-600 flex items-center justify-center transition-colors"
                            title="Modifier"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          {/* Delete */}
                          {deleteConfirm === u.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-red-600 font-medium">Supprimer ?</span>
                              <button
                                onClick={() => deleteMutation.mutate(u.id)}
                                disabled={isDeleting}
                                className="w-7 h-7 rounded-lg bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                              >
                                {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition-colors"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(u.id)}
                              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Create modal */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['admin', 'users'] });
            setShowCreateModal(false);
          }}
        />
      )}

      {/* Edit modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['admin', 'users'] });
            setEditingUser(null);
          }}
        />
      )}
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ email: '', password: '', display_name: '', role: 'ide' });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: onCreated,
    onError: (e: Error) => setError(e.message),
  });

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setError('');
    if (form.password.length < 6) { setError('Mot de passe minimum 6 caractères'); return; }
    mutation.mutate(form);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
          <UserPlus className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">Créer un compte</h2>
          <p className="text-xs text-slate-500">Nouvel utilisateur EHPAD Care Hub</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nom affiché">
          <input
            type="text"
            placeholder="Ex : Marie Dupont"
            value={form.display_name}
            onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
            className="input-field"
          />
        </Field>

        <Field label="Adresse e-mail *">
          <input
            type="email"
            placeholder="marie.dupont@ehpad.fr"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            required
            className="input-field"
          />
        </Field>

        <Field label="Mot de passe *">
          <PasswordField
            value={form.password}
            onChange={v => setForm(f => ({ ...f, password: v }))}
            required
          />
        </Field>

        <Field label="Rôle *">
          <RoleSelect value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))} />
        </Field>

        {error && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
            <X className="h-3.5 w-3.5 flex-shrink-0" /> {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={mutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Créer le compte
          </button>
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors">
            Annuler
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────

function EditUserModal({ user, onClose, onSaved }: { user: AppUser; onClose: () => void; onSaved: () => void }) {
  const [display_name, setDisplayName] = useState(user.display_name);
  const [role, setRole] = useState(user.role);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (body: { role: string; display_name: string; password?: string }) =>
      updateUser(user.id, body),
    onSuccess: onSaved,
    onError: (e: Error) => setError(e.message),
  });

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setError('');
    if (newPassword && newPassword.length < 6) { setError('Mot de passe minimum 6 caractères'); return; }
    mutation.mutate({
      role,
      display_name,
      ...(newPassword ? { password: newPassword } : {}),
    });
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex items-center gap-3 mb-5">
        <Avatar name={user.display_name} email={user.email} color={getRoleStyle(user.role).color} />
        <div>
          <h2 className="text-base font-bold text-slate-900">Modifier le compte</h2>
          <p className="text-xs text-slate-500 truncate max-w-[220px]">{user.email}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nom affiché">
          <input
            type="text"
            value={display_name}
            onChange={e => setDisplayName(e.target.value)}
            className="input-field"
          />
        </Field>

        <Field label="Rôle">
          <RoleSelect value={role} onChange={setRole} />
        </Field>

        <Field label="Nouveau mot de passe">
          <PasswordField
            value={newPassword}
            onChange={setNewPassword}
            placeholder="Laisser vide pour ne pas changer"
          />
          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <KeyRound className="h-3 w-3" /> Laissez vide pour conserver le mot de passe actuel
          </p>
        </Field>

        {error && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
            <X className="h-3.5 w-3.5 flex-shrink-0" /> {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={mutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Enregistrer
          </button>
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors">
            Annuler
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,31,61,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative animate-in fade-in zoom-in-95 duration-150">
        <button onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors">
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = getRoleStyle(value);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:border-slate-300 transition-colors bg-white">
        <span className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: current.color }} />
          {current.label}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl py-1 max-h-60 overflow-y-auto">
          {ALL_ROLES.map(r => (
            <button key={r.value} type="button"
              onClick={() => { onChange(r.value); setOpen(false); }}
              className={cn(
                'w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors',
                value === r.value ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
              )}>
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.color }} />
              {r.label}
              {value === r.value && <Check className="h-3.5 w-3.5 ml-auto text-blue-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
