-- Rappels WhatsApp « en un geste » (2026-10-23).
-- Purement additif, sans perte de données : aucune colonne supprimée ni modifiée.
-- ⚠️ À exécuter dans Supabase SQL Editor AVANT de redéployer le backend.

-- Langue des messages envoyés au patient ('fr' ou 'ar'), français par défaut.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS langue_messages VARCHAR(2) NOT NULL DEFAULT 'fr';

-- Langue d'un modèle de message WhatsApp ('fr' ou 'ar'), français par défaut.
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS langue VARCHAR(2) NOT NULL DEFAULT 'fr';

-- Quand et par qui le rappel a été ouvert dans WhatsApp depuis la page Rappels.
-- (rappel_envoye existe déjà dans le schéma ; la ligne ne fait rien si c'est le cas.)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS rappel_envoye BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS rappel_envoye_at TIMESTAMP(3);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS rappel_envoye_par INTEGER
  REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
