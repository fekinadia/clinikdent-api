-- Chantier Dentalis — nouvelle page "Documents" (2026-09-21)
-- Crée la table `documents`, qui couvre 4 types de documents générés
-- depuis la fiche patient : certificat médical, lettre de liaison,
-- devis, note d'honoraires. Les ordonnances restent dans la table
-- `prescriptions` existante, non touchée ici.
--
-- Idempotent : peut être exécuté plusieurs fois sans risque
-- (IF NOT EXISTS partout).

CREATE TABLE IF NOT EXISTS documents (
  id            SERIAL PRIMARY KEY,
  cabinet_id    INTEGER NOT NULL REFERENCES cabinets(id) ON DELETE CASCADE,
  patient_id    INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  type          VARCHAR(30) NOT NULL,
  contenu       TEXT NOT NULL,
  montant       DECIMAL(10, 3),
  medecin_id    INTEGER REFERENCES users(id),
  date_emission DATE NOT NULL DEFAULT now(),
  created_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_cabinet_id_idx ON documents (cabinet_id);
CREATE INDEX IF NOT EXISTS documents_patient_id_idx ON documents (patient_id);
CREATE INDEX IF NOT EXISTS documents_type_idx ON documents (type);
CREATE INDEX IF NOT EXISTS documents_date_emission_idx ON documents (date_emission);
