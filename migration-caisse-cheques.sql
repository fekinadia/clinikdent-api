-- Caisse & chèques (2026-09-27) : banque émettrice et date d'échéance des chèques.
-- Purement additif, sans perte de données.
-- ⚠️ À exécuter dans Supabase SQL Editor AVANT de redéployer le backend.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS banque VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS date_echeance DATE;
