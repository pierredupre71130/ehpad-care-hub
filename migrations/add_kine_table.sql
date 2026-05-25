-- Table des assignations kiné par résident
-- À exécuter dans le SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS kine_assignations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id  text NOT NULL,
  kine_id      text NOT NULL,
  kine_nom     text NOT NULL DEFAULT '',
  types_kine   text[] NOT NULL DEFAULT '{}',
  notes        text NOT NULL DEFAULT '',
  actif        boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kine_assignations_resident_id_idx ON kine_assignations(resident_id);
CREATE INDEX IF NOT EXISTS kine_assignations_kine_id_idx     ON kine_assignations(kine_id);

-- Désactiver RLS pour permettre les opérations CRUD depuis l'application
-- (même politique que les autres tables du projet)
ALTER TABLE kine_assignations DISABLE ROW LEVEL SECURITY;

-- La liste des kinésithérapeutes + leurs jours de passage est stockée
-- dans la table settings avec la clé 'kine_config' (tableau JSON).
-- Format : [{ "id": "k1", "nom": "Dr. Dupont", "jours": ["Lundi","Mercredi"], "telephone": "06..." }]

NOTIFY pgrst, 'reload schema';
