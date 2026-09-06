-- STEP 4 — No-Show Management : contrainte d'unicité sur no_show_recoveries
--
-- Objectif : garantir au niveau base de données qu'un rendez-vous ne peut
-- avoir qu'UNE seule relance no-show (aujourd'hui uniquement garanti au
-- niveau applicatif par un check-then-act, non atomique sous concurrence).
--
-- ATTENTION — À EXÉCUTER EN DEUX TEMPS, DANS L'ORDRE, MANUELLEMENT :
--
--   1. Exécuter D'ABORD la requête de vérification ci-dessous (SELECT).
--      Elle ne modifie AUCUNE donnée.
--
--   2. Si (et seulement si) elle retourne ZÉRO ligne, exécuter l'ALTER
--      TABLE de l'étape 2.
--
--   3. Si elle retourne UNE OU PLUSIEURS lignes : NE PAS EXÉCUTER L'ALTER
--      TABLE. Cela signifie qu'il existe déjà, en production, plusieurs
--      relances pour un même rendez-vous (doublons créés avant la
--      correction STEP 4 du bug de "relance fantôme", ou par une
--      exécution concurrente du cron avant l'ajout du claim-then-act).
--      Dans ce cas :
--        - NE PAS supprimer, fusionner ou modifier ces lignes soi-même.
--        - Reporter à l'équipe/au responsable produit la liste exacte des
--          appointment_id concernés (voir résultat de la requête) pour
--          décision métier sur laquelle des relances dupliquées garder.
--        - La contrainte UNIQUE ne doit être ajoutée qu'une fois les
--          doublons résolus (manuellement, en connaissance de cause).
--      Ceci suit l'instruction explicite reçue pour STEP 4 : "STOP
--      MIGRATION, REPORT THE DUPLICATES, DO NOT DELETE DATA."
--
-- Cette vérification n'a pas pu être exécutée directement en environnement
-- réel dans le cadre de cette implémentation (l'accès navigateur à
-- Supabase n'était pas disponible au moment de l'écriture de ce fichier) :
-- elle DOIT donc être exécutée manuellement avant d'appliquer l'étape 2.

-- ─────────────────────────────────────────────────────────────────────────
-- ÉTAPE 1 — Vérification (lecture seule, à exécuter en premier)
-- ─────────────────────────────────────────────────────────────────────────

SELECT appointment_id, COUNT(*) AS nb_relances, array_agg(id ORDER BY id) AS recovery_ids
FROM no_show_recoveries
GROUP BY appointment_id
HAVING COUNT(*) > 1;

-- Si cette requête retourne des lignes : STOP. Ne pas exécuter l'étape 2.
-- Reporter les appointment_id et recovery_ids listés ci-dessus.

-- ─────────────────────────────────────────────────────────────────────────
-- ÉTAPE 2 — Contrainte d'unicité (à exécuter UNIQUEMENT si l'étape 1 a
-- retourné zéro ligne)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE no_show_recoveries
  ADD CONSTRAINT no_show_recoveries_appointment_id_key UNIQUE (appointment_id);

-- Note : correspond au champ `appointmentId Int @unique` déjà présent dans
-- prisma/schema.prisma (voir modification de STEP 4). Sans cette
-- contrainte SQL réellement appliquée en base, le `@unique` Prisma ne fait
-- que déclarer l'intention côté schéma — `prisma generate` ne modifie pas
-- la base réelle dans le flux manuel utilisé sur ce projet.
