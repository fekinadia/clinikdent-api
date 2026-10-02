import { SetMetadata } from '@nestjs/common';

/**
 * Rôles existants côté cabinet. Ne pas en ajouter d'autres sans décision
 * produit explicite — voir l'audit du 2026-09-05.
 *
 * Extension du 2026-09-29 (Phase 2 "Équipe & rôles") : assistante,
 * reception, comptable — voir la matrice de droits validée par Nadia dans
 * claude/roadmap-parite-cabinet-care-2026-09-26.md. `maxPraticiens` (plan
 * d'abonnement) ne compte que le rôle 'medecin', inchangé par cet ajout.
 */
export type Role = 'admin' | 'medecin' | 'assistante' | 'reception' | 'comptable';

export const ALL_ROLES: Role[] = ['admin', 'medecin', 'assistante', 'reception', 'comptable'];

export const ROLES_KEY = 'roles';

/**
 * Marque une route comme réservée à un ou plusieurs rôles. Une route SANS
 * ce décorateur reste accessible à tout utilisateur authentifié (JwtGuard
 * s'en charge déjà) — voir RolesGuard pour le comportement par défaut.
 *
 * Exemple : @Roles('admin') sur une route réservée aux administrateurs du
 * cabinet.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
