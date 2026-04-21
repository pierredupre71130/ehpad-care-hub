'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save, Loader2, Mail, User, PhoneCall } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { HomeButton } from '@/components/ui/home-button';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface IdeConfig {
  nom: string;
  email: string;
}

interface AstreinteData {
  ides: IdeConfig[];
  cadreEmail: string;
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function fetchSettings(): Promise<AstreinteData> {
  const sb = createClient();
  const { data } = await sb.from('astreinte_settings').select('key,value');
  const rows = (data ?? []) as { key: string; value: unknown }[];
  const byKey = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    ides: (byKey['ides'] as IdeConfig[]) ?? [
      { nom: 'Pierre', email: '' },
      { nom: 'Florence', email: '' },
      { nom: 'Mandy', email: '' },
    ],
    cadreEmail: (byKey['cadre_email'] as string) ?? '',
  };
}

async function saveSettings(data: AstreinteData): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from('astreinte_settings').upsert(
    [
      { key: 'ides', value: data.ides, updated_at: new Date().toISOString() },
      { key: 'cadre_email', value: data.cadreEmail, updated_at: new Date().toISOString() },
    ],
    { onConflict: 'key' }
  );
  if (error) throw new Error(error.message);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AstreinteSettingsPage() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [ides, setIdes] = useState<IdeConfig[]>([]);
  const [cadreEmail, setCadreEmail] = useState('');
  const [initialized, setInitialized] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['astreinte_settings'],
    queryFn: fetchSettings,
  });

  // Initialiser le state local UNE SEULE FOIS quand les données arrivent
  useEffect(() => {
    if (data && !initialized) {
      setIdes(data.ides);
      setCadreEmail(data.cadreEmail);
      setInitialized(true);
    }
  }, [data, initialized]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings({ ides, cadreEmail });
      // Forcer un refetch pour confirmer que les données sont bien en base
      await qc.invalidateQueries({ queryKey: ['astreinte_settings'] });
      toast.success('Paramètres enregistrés');
    } catch (err: unknown) {
      toast.error('Erreur : ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const updateIde = (idx: number, field: keyof IdeConfig, value: string) => {
    setIdes(prev => prev.map((ide, i) => i === idx ? { ...ide, [field]: value } : ide));
  };

  const addIde = () => setIdes(prev => [...prev, { nom: '', email: '' }]);

  const removeIde = (idx: number) => setIdes(prev => prev.filter((_, i) => i !== idx));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <HomeButton />
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-100">
                <PhoneCall className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">Paramètres Astreintes</h1>
                <p className="text-xs text-slate-500">IDEs d'astreinte et email du cadre</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-8">

        {/* IDEs d'astreinte */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-800">IDEs d'astreinte</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ces noms apparaissent dans le menu déroulant des Consignes de Nuit
              </p>
            </div>
            <button
              onClick={addIde}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg font-medium transition-colors"
            >
              <Plus className="h-4 w-4" /> Ajouter
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {ides.length === 0 && (
              <p className="px-5 py-6 text-sm text-slate-400 text-center">
                Aucun IDE configuré. Cliquez sur Ajouter.
              </p>
            )}
            {ides.map((ide, idx) => (
              <div key={idx} className="px-5 py-3 flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 w-40 flex-shrink-0">
                    <User className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={ide.nom}
                      onChange={e => updateIde(idx, 'nom', e.target.value)}
                      placeholder="Prénom"
                      className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Mail className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    <input
                      type="email"
                      value={ide.email}
                      onChange={e => updateIde(idx, 'email', e.target.value)}
                      placeholder="email@exemple.com"
                      className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>
                <button
                  onClick={() => removeIde(idx)}
                  className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg transition-colors flex-shrink-0"
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Email du cadre */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
            <h2 className="font-semibold text-slate-800">Email du Cadre de Santé</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cet email reçoit automatiquement une copie de chaque envoi de consignes de nuit
            </p>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <input
                type="email"
                value={cadreEmail}
                onChange={e => setCadreEmail(e.target.value)}
                placeholder="cadre@ehpad.fr"
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
              />
            </div>
          </div>
        </div>

        {/* Info Resend */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-1">Configuration Resend</h3>
          <p className="text-xs text-blue-700 leading-relaxed">
            Pour activer l'envoi d'emails, renseignez votre clé API Resend dans le fichier{' '}
            <code className="bg-blue-100 px-1 rounded">.env.local</code>{' '}
            (<code className="bg-blue-100 px-1 rounded">RESEND_API_KEY</code>) et configurez
            l'adresse expéditeur (<code className="bg-blue-100 px-1 rounded">RESEND_FROM_EMAIL</code>)
            avec un domaine vérifié dans votre compte Resend.
          </p>
        </div>

      </div>
    </div>
  );
}
