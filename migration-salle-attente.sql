-- Salle d'attente (2026-09-26) : heure d'arrivée et heure d'entrée au fauteuil.
-- Purement additif, sans perte de données. À exécuter dans Supabase SQL Editor.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS heure_arrivee TIMESTAMP(3);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS heure_entree TIMESTAMP(3);
