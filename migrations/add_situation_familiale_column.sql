-- Ajoute la colonne situation_familiale à la table residents.
-- À exécuter une seule fois dans le SQL Editor de Supabase.

ALTER TABLE residents
  ADD COLUMN IF NOT EXISTS situation_familiale text DEFAULT '';

NOTIFY pgrst, 'reload schema';
