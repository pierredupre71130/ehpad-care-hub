-- Module de planification IDEC (admin only)

CREATE TABLE IF NOT EXISTS projets_idec (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titre       text NOT NULL,
  categorie   text NOT NULL DEFAULT 'Général',
  label_libre text DEFAULT '',
  statut      text NOT NULL DEFAULT 'A_planifier',
  priorite    text NOT NULL DEFAULT 'Normale',
  date_cible  date,
  objectif    text DEFAULT '',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projets_idec_actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projet_id     uuid NOT NULL REFERENCES projets_idec(id) ON DELETE CASCADE,
  titre         text NOT NULL,
  responsable   text DEFAULT '',
  date_echeance date,
  fait          boolean DEFAULT false,
  ordre         integer DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projets_idec_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projet_id  uuid NOT NULL REFERENCES projets_idec(id) ON DELETE CASCADE,
  contenu    text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE projets_idec         ENABLE ROW LEVEL SECURITY;
ALTER TABLE projets_idec_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE projets_idec_notes   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_projets"  ON projets_idec FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "admin_actions"  ON projets_idec_actions FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "admin_notes"    ON projets_idec_notes FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

NOTIFY pgrst, 'reload schema';
