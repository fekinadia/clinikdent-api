export interface CorsDecision {
  origin: string[] | boolean;
  credentials: true;
}

/**
 * Construit la configuration CORS à partir de l'environnement.
 *
 * Règle de sécurité (audit du 2026-09-05, point critique #2) : plus aucun
 * repli silencieux sur '*' en production. Si CORS_ORIGINS est absente ou
 * vide en production, on lève une erreur explicite au démarrage plutôt que
 * d'autoriser silencieusement n'importe quelle origine avec
 * `credentials: true` (combinaison dangereuse : un cookie/jeton envoyé par
 * le navigateur d'un utilisateur serait alors lisible par n'importe quel
 * site tiers capable de faire une requête cross-origin).
 *
 * En développement, on reste permissif si la variable n'est pas définie
 * (confort local), mais on respecte quand même CORS_ORIGINS si elle est
 * fournie (utile pour reproduire un problème CORS localement).
 *
 * Fonction pure (pas d'accès à `process.env` ici) pour rester testable
 * sans dépendre de l'environnement d'exécution — voir cors.config.spec.ts.
 */
export function buildCorsOptions(
  nodeEnv: string | undefined,
  corsOriginsRaw: string | undefined,
): CorsDecision {
  const origins = (corsOriginsRaw || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const isProduction = nodeEnv === 'production';

  if (isProduction) {
    if (origins.length === 0) {
      throw new Error(
        "CORS_ORIGINS doit être défini en production (liste d'origines autorisées séparées par des virgules, ex. https://clinikdent-web.vercel.app). Aucun repli sur '*' n'est autorisé en production.",
      );
    }
    return { origin: origins, credentials: true };
  }

  // Développement / autres environnements non-production : permissif par
  // défaut, mais respecte CORS_ORIGINS si elle est explicitement fournie.
  return { origin: origins.length > 0 ? origins : true, credentials: true };
}
