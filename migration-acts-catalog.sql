-- STEP 3 — Catalogue des actes
-- Non destructif : relâche une contrainte (code devient optionnel) et
-- ajoute des colonnes nullable / à valeur par défaut. Aucune donnée
-- existante n'est modifiée ou supprimée, aucune table n'est créée.
--
-- Vérifié contre prisma/schema.prisma avant d'écrire cette migration :
-- la table acts_catalog existante a déjà les colonnes cabinet_id, code,
-- libelle, coefficient, tarif_base, categorie, actif. Il manque
-- description, duree_minutes, created_at, updated_at, et code est
-- actuellement NOT NULL.

ALTER TABLE acts_catalog ALTER COLUMN code DROP NOT NULL;

ALTER TABLE acts_catalog
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE acts_catalog
  ADD COLUMN IF NOT EXISTS duree_minutes INTEGER;

ALTER TABLE acts_catalog
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now();

ALTER TABLE acts_catalog
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT now();
