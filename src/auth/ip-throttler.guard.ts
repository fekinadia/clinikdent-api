import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface RequeteHttp {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

/**
 * Adresse réelle du visiteur. Derrière Render, req.ip est celle du proxy,
 * commune à tout le monde : la limiter bloquerait tous les visiteurs d'un coup.
 */
export function adresseClient(req: RequeteHttp): string {
  const entete = (nom: string) => {
    const valeur = req.headers[nom];
    return Array.isArray(valeur) ? valeur[0] : valeur;
  };
  const transmise = entete('x-forwarded-for')?.split(',')[0];
  return entete('cf-connecting-ip') || entete('true-client-ip') || transmise?.trim() || req.ip || 'inconnue';
}

/** Limite de requêtes par visiteur, à poser route par route avec @Throttle. */
@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return adresseClient(req as RequeteHttp);
  }
}
