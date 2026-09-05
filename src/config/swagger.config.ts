/**
 * La documentation Swagger (/api/docs) liste toutes les routes, DTO et
 * modèles de données de l'API sans authentification — reconnaissance
 * gratuite offerte à quiconque connaît l'URL du backend (audit du
 * 2026-09-05, point critique #3). Solution la plus simple et la plus sûre :
 * ne jamais la monter en production. Reste disponible sans changement en
 * développement.
 */
export function shouldEnableSwagger(nodeEnv: string | undefined): boolean {
  return nodeEnv !== 'production';
}
