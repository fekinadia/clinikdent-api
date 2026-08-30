-- Migration : ajout du suivi d'envoi SMS sur les rappels manuels (reminders)
-- A executer par Nadia dans Supabase SQL Editor.

ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS sms_envoye BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_envoye_at TIMESTAMP(3);
