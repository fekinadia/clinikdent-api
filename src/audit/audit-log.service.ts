import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogEntry {
  /** Utilisateur qui a effectué l'action. null pour un événement système
   * (ex. webhook de paiement non authentifié). */
  userId?: number | null;
  /** Cabinet concerné, quand applicable (permet de filtrer l'historique
   * d'un cabinet donné sans dépendre d'une jointure sur userId). */
  cabinetId?: number | null;
  /** Verbe d'action court, ex. 'patient.delete', 'cabinet.delete',
   * 'subscription.checkout_initiated'. */
  action: string;
  entityType?: string | null;
  entityId?: number | null;
  /** Métadonnées libres. Ne jamais y mettre de mot de passe, token, clé
   * API, ou donnée médicale non indispensable à la traçabilité. */
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

/**
 * Fine couche au-dessus du modèle Prisma AuditLog déjà présent dans le
 * schéma (jamais alimenté jusqu'ici, voir audit du 2026-09-05).
 *
 * Volontairement résiliente : une erreur d'écriture du journal ne doit
 * jamais faire échouer l'opération métier qu'elle décrit (ex. la
 * suppression d'un patient doit réussir même si, par accident, l'écriture
 * du log échoue) — on journalise l'échec côté serveur et on continue.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          cabinetId: entry.cabinetId ?? null,
          action: entry.action,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          details: entry.details ?? undefined,
          ipAddress: entry.ipAddress ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Échec d'écriture du journal d'audit (action="${entry.action}") : ${err}`,
      );
    }
  }
}
