-- Ajout de la table calendar_events : blocs d'agenda libres (pause,
-- réunion, blocage de créneau...) qui ne sont PAS liés à un dossier
-- patient, à la différence des rendez-vous (table appointments existante,
-- non modifiée par cette migration).
--
-- Table entièrement nouvelle : n'affecte aucune donnée existante.
-- À exécuter manuellement dans l'éditeur SQL Supabase, comme les
-- migrations précédentes de ce projet.

CREATE TABLE IF NOT EXISTS calendar_events (
  id           SERIAL PRIMARY KEY,
  cabinet_id   INTEGER NOT NULL REFERENCES cabinets(id) ON DELETE CASCADE,
  titre        VARCHAR(200) NOT NULL,
  medecin_id   INTEGER REFERENCES users(id),
  date_debut   TIMESTAMP(3) NOT NULL,
  date_fin     TIMESTAMP(3) NOT NULL,
  created_by   INTEGER REFERENCES users(id),
  created_at   TIMESTAMP(3) NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_events_cabinet_id_idx ON calendar_events (cabinet_id);
CREATE INDEX IF NOT EXISTS calendar_events_medecin_id_idx ON calendar_events (medecin_id);
CREATE INDEX IF NOT EXISTS calendar_events_date_debut_idx ON calendar_events (date_debut);
