-- Réservation en ligne (2026-10-30) : le patient choisit un créneau sur le
-- lien public du cabinet, le cabinet confirme ou refuse.
-- Purement additif, sans perte de données : aucune colonne supprimée ni modifiée.
-- La réservation reste désactivée pour tous les cabinets après ce script.
-- ⚠️ À exécuter dans Supabase SQL Editor AVANT de redéployer le backend.

-- Réglages du cabinet.
ALTER TABLE cabinets ADD COLUMN IF NOT EXISTS reservation_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cabinets ADD COLUMN IF NOT EXISTS reservation_slug VARCHAR(60);
ALTER TABLE cabinets ADD COLUMN IF NOT EXISTS reservation_horaires JSONB;
ALTER TABLE cabinets ADD COLUMN IF NOT EXISTS reservation_duree_creneau INTEGER NOT NULL DEFAULT 30;
CREATE UNIQUE INDEX IF NOT EXISTS cabinets_reservation_slug_key ON cabinets (reservation_slug);

-- Demandes envoyées depuis la page publique, gardées à part des patients
-- pour qu'une demande fantaisiste n'arrive jamais dans les dossiers.
CREATE TABLE IF NOT EXISTS demandes_rdv (
  id             SERIAL PRIMARY KEY,
  cabinet_id     INTEGER NOT NULL REFERENCES cabinets(id) ON DELETE CASCADE ON UPDATE CASCADE,
  prenom         VARCHAR(100) NOT NULL,
  nom            VARCHAR(100) NOT NULL,
  gsm            VARCHAR(30) NOT NULL,
  motif          VARCHAR(200),
  langue         VARCHAR(2) NOT NULL DEFAULT 'fr',
  date_debut     TIMESTAMP(3) NOT NULL,
  date_fin       TIMESTAMP(3) NOT NULL,
  statut         VARCHAR(20) NOT NULL DEFAULT 'en_attente',
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL ON UPDATE CASCADE,
  traitee_at     TIMESTAMP(3),
  traitee_par    INTEGER REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS demandes_rdv_cabinet_id_statut_idx ON demandes_rdv (cabinet_id, statut);

-- Deux patients ne peuvent pas demander le même créneau au même moment.
CREATE UNIQUE INDEX IF NOT EXISTS demandes_rdv_creneau_en_attente
  ON demandes_rdv (cabinet_id, date_debut) WHERE statut = 'en_attente';

-- Cette table contient des données de patients : elle ne doit pas être lisible
-- par l'accès public de Supabase. L'API, propriétaire de la table, n'est pas concernée.
ALTER TABLE demandes_rdv ENABLE ROW LEVEL SECURITY;

-- Vérification à lancer ensuite : 7 lignes attendues.
SELECT 'colonne ' || column_name AS element
  FROM information_schema.columns
 WHERE table_name = 'cabinets' AND column_name LIKE 'reservation\_%'
UNION ALL
SELECT 'table demandes_rdv, protection ' || CASE WHEN rowsecurity THEN 'ACTIVE' ELSE 'ABSENTE' END
  FROM pg_tables
 WHERE tablename = 'demandes_rdv'
UNION ALL
SELECT 'index ' || indexname
  FROM pg_indexes
 WHERE indexname IN ('cabinets_reservation_slug_key', 'demandes_rdv_creneau_en_attente')
ORDER BY 1;
