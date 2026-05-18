-- Ajoute la colonne DSI (Dossier de Soins Infirmiers) à la table residents.
-- À exécuter une seule fois dans le SQL Editor de Supabase.

ALTER TABLE residents
  ADD COLUMN IF NOT EXISTS dsi jsonb DEFAULT '{}'::jsonb;

-- Force PostgREST à recharger son cache de schéma pour que le nouveau champ
-- soit immédiatement accessible via l'API.
NOTIFY pgrst, 'reload schema';
