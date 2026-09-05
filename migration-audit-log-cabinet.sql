-- Chantier RBAC / sécurité (2026-09-05)
-- Ajoute une colonne cabinet_id à la table audit_log existante, pour
-- pouvoir filtrer l'historique par cabinet sans dépendre d'une jointure sur
-- user_id (qui peut être NULL pour un événement système, ex. webhook de
-- paiement Konnect). Purement additif, aucune donnée existante modifiée ou
-- supprimée. À exécuter dans Supabase SQL Editor, comme toutes les
-- migrations précédentes de ce projet.

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS cabinet_id INTEGER;
CREATE INDEX IF NOT EXISTS audit_log_cabinet_id_idx ON audit_log (cabinet_id);
