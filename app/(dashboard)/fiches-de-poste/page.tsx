'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Printer, Pencil, Check, X, Loader2, ChevronRight, Clock, Save, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FicheDePoste {
  id: string;
  poste: string;
  contenu: string;
  updated_at: string;
}

// ── Contenu par défaut ────────────────────────────────────────────────────────

const DEFAULTS: Record<string, string> = {
  'AS Matin': `FICHE DE TÂCHES - AS MATIN EHPAD GUEUGNON
Date d'application : 24 juil. 2024

06h45 / 06h50 - Habillage

06h50 / 07h00 - Transmissions avec l'équipe de nuit

07h00 / 08h15 - Réalisation des soins d'hygiène, de confort et préventifs (douches et toilettes)
Réfection des lits, traçabilité des soins

08h15 / 08h50 - Installation des résidents alités en binôme avec l'ASH
Aide à la prise du petit déjeuner en chambre

08h50 / 09h00 - Pause

09h00 / 11h30 - Réalisation des soins d'hygiène, de confort et préventifs
Douche ou toilette complète au lit
Réfection des lits

11h30 / 12h00 - Installation des résidents en SAM
Installation des résidents en chambre
Préparation des plateaux repas en collaboration avec l'IDE pour les traitements

12h00 / 12h50 - Distribution et aide au repas en chambre

12h50 / 13h00 - Installation des résidents sur les lieux de vie ou en chambre pour la sieste

13h00 / 13h20 - Pause

13h20 / 14h00 - Gestion logistique : fiches repas et commandes
Ateliers selon organisation hebdomadaire : PVI ou ateliers bien être

14h00 / 14h20 - Transmissions en équipe pluri disciplinaire

14h20 / 14h25 - Déshabillage

14h25 - Fin de poste`,

  'AS Soir': `FICHE DE TÂCHES - AS SOIR EHPAD GUEUGNON
Date d'application : 25 juil. 2024

12h40 / 12h45 - Habillage

12h45 / 12h50 - Distribution du café en SAM

12h50 / 14h00 - Accompagnement des résidents en chambre ou sur les lieux de vie
Réalisations des soins d'hygiène, de confort et préventifs
Traçabilité des soins effectués

14h00 / 14h20 - Transmissions en équipe pluridisciplinaire

14h20 / 14h50 - Préparation de la collation

14h50 / 16h00 - Distribution et aide à la prise de la collation en chambre et sur les lieux de vie
Ramassage de la collation, ouverture des lits
Traçabilité des soins effectués

16h00 / 16h10 - Pause

16h10 / 17h30 - Réalisations des soins d'hygiène, de confort et préventifs

17h30 / 17h45 - Accompagnement des résidents en SAM
Installation des résidents en chambre
Préparation des plateau repas en collaboration avec l'IDE pour les traitements

17h45 / 18h30 - Distribution et aide à la prise des repas en chambre

18h30 / 19h55 - Accompagnement des résidents en chambre et préparation pour la nuit
Réalisations des soins d'hygiène, de confort et préventifs
Traçabilité des soins effectués

19h55 / 20h15 - Pause

20h15 / 20h20 - Déshabillage

20h20 - Fin de poste`,

  'AS Nuit': `FICHE DE TÂCHES - AS NUIT EHPAD GUEUGNON
Date d'application : 24 juil. 2024

21h00 / 21h05 - Habillage

21h05 / 21h20 - Prise de connaissance des transmissions pour la nuit

21h20 / 23h30 - Réinstallation des résidents pour la nuit
Réalisations des soins d'hygiène, de confort et préventifs
Distribution des produits de soins et protections
Surveillance si besoin des paramètres vitaux
Aide à la prise des traitements sur délégation IDE
Traçabilité des soins effectuées

23h30 / 00h00 - Préparation des chariots AS pour le lendemain

00h00 / 00h30 - Pause

00h40 / 02h00 - Gestion de la logistique : commande de linge et / ou de protections

02h00 / 04h45 - Surveillance des résidents et réponse aux sollicitations

04h45 / 06h45 - Réinstallation des résidents pour la nuit
Réalisations des soins d'hygiène, de confort et préventifs
Traçabilité des soins effectuées

06h45 / 06h55 - Transmissions à l'équipe de jour

06h55 / 07h00 - Déshabillage

07h00 - Fin de poste`,

  'ASH Matin': `FICHE DE TÂCHES - ASH MATIN EHPAD GUEUGNON
Date d'application : 24 juil. 2024

07h00 / 07h05 - Habillage

07h05 / 07h30 - Préparation des chariots ménage (Secteur vert et rose)
Prise des températures des frigos (Secteur jaune)
Préparation des petits déjeuners
Mise du couvert en SAM (secteur bleu)

07h30 / 08h30 - Aide à l'installation des résidents pour le petit déjeuner, service en chambre des plateaux

08h30 / 08h45 - Débarrassage des plateaux et descente de la vaisselle en cuisine

08h50 / 09h00 - Pause

09h00 / 11h40 - Entretien des chambres
Mise en tension du chauffe assiettes, eau sur table

11h40 / 12h50 - Installation des résidents en SAM
Récupération du chariot repas en cuisine
Service et aide au repas en SAM

12h50 / 13h00 - Descente du chariot repas en cuisine après débarrassage de la vaisselle et nettoyage de la SAM

13h00 / 13h20 - Pause

13h20 / 14h00 - Activité selon calendrier établis des taches à la semaine (Linge, commande, ménage de fond, entretien matériel)

14h00 / 14h20 - Transmissions en équipe pluri disciplinaire

14h20 / 14h25 - Déshabillage

14h25 - Fin de poste`,

  'ASH Soir': `FICHE DE TÂCHES - ASH SOIR EHPAD GUEUGNON
Date d'application : 24 juil. 2024

11h30 / 11h35 - Habillage

11h35 / 12h15 - Entretien des chambres

12h15 / 13h00 - Fin du service en salle à manger : préparation du fromage et dessert à l'assiette
Descente du chariot repas en cuisine après débarrassage de la vaisselle et nettoyage de la SAM

13h00 / 13h20 - Pause

13h20 / 14h00 - Mise du couvert en SAM pour le diner
Préparation des plateaux du petit déjeuner
Activité selon calendrier établis des taches à la semaine (Linge, commande, ménage de fond, entretien matériel)

14h00 / 14h20 - Transmissions en équipe pluri disciplinaire

14h20 / 17h00 - Activité selon calendrier établis des taches à la semaine (Linge, commande, ménage de fond, entretien matériel)

16h00 / 16h10 - Pause

17h00 / 17h45 - Vérification des stocks, mise du pain et de l'eau sur les tables, en SAM
Mise en tension du chauffe assiettes
Récupération du chariot repas en cuisine

17h45 / 18h30 - Service du repas en SAM

18h30 / 19h05 - Descente du chariot repas après débarrassage des tables et nettoyage de la SAM
Descente des poubelles

19h05 / 19h10 - Déshabillage`,

  'IDE Matin': `FICHE DE TÂCHES - IDE MATIN EHPAD GUEUGNON
Date d'application : 24 juil. 2024

06h45 / 06h50 - Habillage

06h50 / 07h00 - Transmissions avec l'équipe de nuit

07h00 / 08h50 - Distribution des traitements en chambre, surveillance des paramètres vitaux

08h50 / 09h00 - Pause

09h00 / 12h00 - Tour de soins divers, pansements, visite médicale

12h00 / 12h30 - Distribution des médicaments en SAM

12h30 / 13h00 - Transmissions sur le DSI

13h00 / 13h20 - Pause

13h20 / 14h00 - Rangement, validation des stocks
Validation des soins faits

14h00 / 14h20 - Transmissions en équipe pluridisciplinaire

14h20 / 14h25 - Déshabillage

14h25 - Fin de poste`,

  'IDE Soir': `FICHE DE TÂCHES - IDE SOIR EHPAD GUEUGNON
Date d'application : 24 juil. 2024

13h20 / 13h25 - Habillage

13h25 / 14h00 - Vérification et déblisterage des médicaments pour l'après-midi

14h00 / 14h20 - Transmissions en équipe pluridisciplinaire

14h20 / 16h00 - Vérification et déblisterage des médicaments pour l'après-midi (suite)

16h00 / 16h10 - Pause

16h10 / 17h45 - Tour de soins divers : glycémie capillaire, administration des collyres, aérosol

17h45 / 18h30 - Distribution des médicaments sur les lieux de vie et en chambre

18h30 / 19h30 - Distribution des traitements pour la nuit

19h30 / 20h00 - Traçabilité des soins sur DSI et cahier de transmissions nuit

20h00 / 20h20 - Pause

20h20 / 20h55 - Préparation des RDV pour le lendemain + BS
Validation des soins faits

20h55 / 21h00 - Déshabillage

21h00 - Fin de poste`,
};

// ── Config postes ─────────────────────────────────────────────────────────────

const GROUPES = [
  {
    label: 'Aide-Soignant',
    abrev: 'AS',
    color: 'from-amber-500 to-orange-500',
    lightBg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-700',
    postes: [
      { label: 'AS Matin',  horaire: '06h45 – 14h25', icon: '☀️' },
      { label: 'AS Soir',   horaire: '12h40 – 20h20', icon: '🌅' },
      { label: 'AS Nuit',   horaire: '21h00 – 07h00', icon: '🌙' },
    ],
  },
  {
    label: 'Agent de Service Hospitalier',
    abrev: 'ASH',
    color: 'from-emerald-500 to-teal-500',
    lightBg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-700',
    postes: [
      { label: 'ASH Matin', horaire: '07h00 – 14h25', icon: '☀️' },
      { label: 'ASH Soir',  horaire: '11h30 – 19h10', icon: '🌅' },
    ],
  },
  {
    label: 'Infirmier·ère Diplômé·e d\'État',
    abrev: 'IDE',
    color: 'from-rose-500 to-pink-500',
    lightBg: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-700',
    badge: 'bg-rose-100 text-rose-700',
    postes: [
      { label: 'IDE Matin', horaire: '06h45 – 14h25', icon: '☀️' },
      { label: 'IDE Soir',  horaire: '13h20 – 21h00', icon: '🌅' },
    ],
  },
];

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function fetchFiches(): Promise<FicheDePoste[]> {
  const sb = createClient();
  const { data, error } = await sb.from('fiche_de_poste').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as FicheDePoste[];
}

// ── Timeline content renderer ─────────────────────────────────────────────────

function FicheTimeline({ text }: { text: string }) {
  const lines = text.split('\n');
  const items: { time: string; tasks: string[]; isPause: boolean; isFin: boolean }[] = [];
  let current: { time: string; tasks: string[]; isPause: boolean; isFin: boolean } | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('FICHE DE') || line.startsWith('Date')) continue;

    const horaireParts = line.match(/^(\d{1,2}h\d{0,2}\s*\/\s*\d{1,2}h\d{0,2})\s*[-–]\s*(.*)$/);
    const finParts     = line.match(/^(\d{1,2}h\d{0,2})\s*[-–]\s*(.*)$/);

    if (horaireParts) {
      if (current) items.push(current);
      const task = horaireParts[2].trim();
      const isPause = task.toLowerCase().startsWith('pause');
      const isFin   = task.toLowerCase().startsWith('fin de poste');
      current = { time: horaireParts[1].replace(/\s/g, ''), tasks: [task], isPause, isFin };
    } else if (finParts && !horaireParts) {
      if (current) items.push(current);
      current = { time: finParts[1], tasks: [finParts[2].trim()], isPause: false, isFin: true };
    } else if (current) {
      current.tasks.push(line);
    }
  }
  if (current) items.push(current);

  return (
    <div className="relative pl-4">
      {/* Ligne verticale */}
      <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-200" />

      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="relative flex gap-4 group">
            {/* Point sur la timeline */}
            <div className="relative flex-shrink-0 mt-3.5">
              <div className={`w-3 h-3 rounded-full border-2 z-10 relative ${
                item.isFin   ? 'bg-slate-700 border-slate-700' :
                item.isPause ? 'bg-slate-300 border-slate-400' :
                               'bg-white border-blue-500'
              }`} />
            </div>

            {/* Contenu */}
            <div className={`flex-1 rounded-xl px-4 py-3 mb-1 transition-colors ${
              item.isFin   ? 'bg-slate-800 text-white' :
              item.isPause ? 'bg-slate-100 border border-slate-200' :
                             'bg-white border border-slate-200 hover:border-blue-200 hover:bg-blue-50/30'
            }`}>
              <div className="flex items-start gap-3">
                {/* Horaire */}
                <div className={`flex-shrink-0 flex items-center gap-1 text-xs font-bold font-mono whitespace-nowrap mt-0.5 ${
                  item.isFin   ? 'text-white/80' :
                  item.isPause ? 'text-slate-400' :
                                 'text-blue-600'
                }`}>
                  <Clock className="h-3 w-3 opacity-70" />
                  {item.time}
                </div>
                {/* Tâches */}
                <div className="flex-1 min-w-0">
                  {item.tasks.map((t, j) => (
                    <p key={j} className={`text-sm leading-snug ${
                      j === 0
                        ? item.isFin   ? 'font-semibold text-white' :
                          item.isPause ? 'font-medium text-slate-400 italic' :
                                         'font-semibold text-slate-800'
                        : 'text-slate-500 mt-0.5'
                    }`}>
                      {j > 0 && <span className="mr-1 text-slate-300">›</span>}
                      {t}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── FicheView ─────────────────────────────────────────────────────────────────

function FicheView({
  fiche, poste, onSave,
}: {
  fiche: FicheDePoste | undefined;
  poste: string;
  onSave: (id: string | undefined, poste: string, contenu: string) => Promise<void>;
}) {
  const content = fiche?.contenu ?? DEFAULTS[poste] ?? '';
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const handleEdit = () => { setEditValue(content); setEditing(true); };
  const handleCancel = () => { setEditing(false); setEditValue(''); };
  const handleSave = async () => {
    setSaving(true);
    await onSave(fiche?.id, poste, editValue);
    setSaving(false);
    setEditing(false);
    setEditValue('');
  };

  return (
    <div>
      {/* Barre d'actions */}
      <div className="flex justify-end gap-2 mb-6 print:hidden">
        {editing ? (
          <>
            <Button size="sm" variant="outline" onClick={handleCancel} className="gap-1.5 text-slate-600">
              <X className="h-4 w-4" /> Annuler
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={handleEdit} className="gap-1.5">
              <Pencil className="h-4 w-4" /> Modifier
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5">
              <Printer className="h-4 w-4" /> Imprimer
            </Button>
          </>
        )}
      </div>

      {editing ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs text-slate-400 mb-3 font-medium">
            Format : <code className="bg-slate-100 px-1 rounded">06h45 / 07h00 - Description de la tâche</code>
          </p>
          <Textarea
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            className="font-mono text-sm min-h-[600px] w-full"
          />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <FicheTimeline text={content} />
        </div>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function FichesDePostePage() {
  const queryClient = useQueryClient();
  const [selectedPoste, setSelectedPoste] = useState<string | null>(null);

  const { data: fiches = [], isLoading } = useQuery({
    queryKey: ['fiches_de_poste'],
    queryFn: fetchFiches,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, poste, contenu }: { id: string | undefined; poste: string; contenu: string }) => {
      const sb = createClient();
      if (id) {
        const { error } = await sb.from('fiche_de_poste').update({ contenu, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await sb.from('fiche_de_poste').insert({ poste, contenu });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiches_de_poste'] });
      toast.success('Fiche enregistrée ✓');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = (id: string | undefined, poste: string, contenu: string) =>
    saveMutation.mutateAsync({ id, poste, contenu });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: '#dde4ee' }}>
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // ── Vue fiche individuelle ──────────────────────────────────────────────────
  if (selectedPoste) {
    const fiche = fiches.find(f => f.poste === selectedPoste);
    const groupe = GROUPES.find(g => g.postes.some(p => p.label === selectedPoste))!;
    const posteConfig = groupe.postes.find(p => p.label === selectedPoste)!;

    return (
      <div className="min-h-screen" style={{ background: '#dde4ee' }}>
        {/* Header gradient */}
        <header className="print:hidden relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}>
          <div className="relative z-10 max-w-4xl mx-auto px-6 py-5">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
              <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
              <ChevronRight className="h-3 w-3" />
              <button onClick={() => setSelectedPoste(null)} className="hover:text-white/80 transition-colors">
                Fiches de Poste
              </button>
              <ChevronRight className="h-3 w-3" />
              <span className="text-white/80">{selectedPoste}</span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center text-2xl flex-shrink-0 shadow-inner">
                  {posteConfig.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white/20 text-white/90`}>
                      {groupe.abrev}
                    </span>
                    <span className="text-white/50 text-xs">{groupe.label}</span>
                  </div>
                  <h1 className="text-2xl font-extrabold text-white tracking-tight">{selectedPoste}</h1>
                  <p className="text-white/60 text-sm mt-0.5 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {posteConfig.horaire}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPoste(null)}
                className="flex-shrink-0 text-white/70 hover:text-white text-sm bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl transition-all"
              >
                ← Tous les postes
              </button>
            </div>
          </div>
        </header>

        {/* Titre impression uniquement */}
        <div className="hidden print:block px-8 pt-8 pb-4">
          <h1 className="text-2xl font-bold text-slate-900">Fiche de Poste — {selectedPoste}</h1>
          <p className="text-sm text-slate-500">EHPAD Gueugnon · {posteConfig.horaire}</p>
          <hr className="mt-4 border-slate-300" />
        </div>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-12">
          <FicheView fiche={fiche} poste={selectedPoste} onSave={handleSave} />
        </main>
      </div>
    );
  }

  // ── Vue accueil ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>
      {/* Header gradient */}
      <header className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}>
        <div className="relative z-10 max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/80">Fiches de Poste</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0 shadow-inner">
              <ClipboardList className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight leading-none">
                Fiches de Poste
              </h1>
              <p className="text-white/60 text-sm mt-1">Résidence La Fourrier · Consultez et modifiez les fiches par poste</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 pb-16 space-y-6">
        {GROUPES.map(groupe => (
          <div key={groupe.abrev} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* En-tête du groupe */}
            <div className={`bg-gradient-to-r ${groupe.color} px-6 py-4 flex items-center gap-3`}>
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <span className="text-white font-extrabold text-sm">{groupe.abrev}</span>
              </div>
              <div>
                <h2 className="text-white font-bold text-base leading-tight">{groupe.label}</h2>
                <p className="text-white/70 text-xs">{groupe.postes.length} fiche{groupe.postes.length > 1 ? 's' : ''} de poste</p>
              </div>
            </div>

            {/* Cartes postes */}
            <div className="divide-y divide-slate-100">
              {groupe.postes.map(poste => {
                const hasFiche = fiches.some(f => f.poste === poste.label);
                const ficheData = fiches.find(f => f.poste === poste.label);
                return (
                  <button
                    key={poste.label}
                    onClick={() => setSelectedPoste(poste.label)}
                    className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors text-left group"
                  >
                    {/* Icône shift */}
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${groupe.lightBg} ${groupe.border} border`}>
                      {poste.icon}
                    </div>

                    {/* Infos */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-slate-800 text-sm">{poste.label}</span>
                        {hasFiche && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${groupe.badge}`}>
                            ✓ personnalisée
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        <span>{poste.horaire}</span>
                        {hasFiche && ficheData?.updated_at && (
                          <>
                            <span className="text-slate-200">·</span>
                            <span>Modifiée le {new Date(ficheData.updated_at).toLocaleDateString('fr-FR')}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Flèche */}
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <p className="text-center text-xs text-slate-400 pt-2">
          Cliquez sur un poste pour consulter ou modifier sa fiche de tâches
        </p>
      </main>
    </div>
  );
}
