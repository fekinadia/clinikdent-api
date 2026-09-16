import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { UpdateNoShowRecoveryDto, MarkRecoveredDto } from './dto/no-show-recovery.dto';

export interface ActorContext {
  userId: number;
  ipAddress?: string | null;
}

@Injectable()
export class NoShowRecoveriesService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  async findAll(cabinetId: number, statut?: string) {
    return this.prisma.noShowRecovery.findMany({
      where: {
        appointment: { cabinetId },
        ...(statut ? { statut } : {}),
      },
      include: {
        appointment: {
          include: {
            patient: { select: { id: true, nom: true, prenom: true, gsm: true } },
            medecin: { select: { id: true, nom: true, prenom: true } },
            type: true,
          },
        },
        nouveauAppointment: {
          include: {
            patient: { select: { id: true, nom: true, prenom: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // STEP 4 — isolation cabinet strictement en 404, jamais 403 : voir
  // convention adoptée en STEP 3 pour ActCatalog (audit du 2026-09-05).
  // Un ID inexistant et un ID d'un autre cabinet doivent être indiscernables.
  private async assertRecoveryDuCabinet(cabinetId: number, id: number) {
    const recovery = await this.prisma.noShowRecovery.findUnique({
      where: { id },
      include: { appointment: true },
    });
    if (!recovery || recovery.appointment.cabinetId !== cabinetId) {
      throw new NotFoundException('Relance no-show introuvable');
    }
    return recovery;
  }

  async update(cabinetId: number, id: number, dto: UpdateNoShowRecoveryDto, actor?: ActorContext) {
    await this.assertRecoveryDuCabinet(cabinetId, id);

    const updated = await this.prisma.noShowRecovery.update({
      where: { id },
      data: { statut: dto.statut },
    });

    await this.auditLog.log({
      userId: actor?.userId,
      cabinetId,
      action: 'no_show_recovery.lost',
      entityType: 'NoShowRecovery',
      entityId: id,
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  /**
   * STEP 4 — le patient a repris rendez-vous (ou a été recontacté avec
   * succès). Le lien vers le nouveau RDV est optionnel mais, s'il est
   * fourni, doit appartenir au même cabinet et ne peut pas être le RDV
   * manqué lui-même — sinon 400 (donnée invalide, pas un problème
   * d'autorisation, donc pas de 404 ici).
   */
  async markRecovered(
    cabinetId: number,
    id: number,
    dto: MarkRecoveredDto,
    actor?: ActorContext,
  ) {
    const recovery = await this.assertRecoveryDuCabinet(cabinetId, id);

    if (dto.nouveauAppointmentId !== undefined) {
      if (dto.nouveauAppointmentId === recovery.appointmentId) {
        throw new BadRequestException(
          'Le nouveau rendez-vous ne peut pas être le rendez-vous manqué lui-même',
        );
      }
      const nouveauAppointment = await this.prisma.appointment.findUnique({
        where: { id: dto.nouveauAppointmentId },
      });
      if (!nouveauAppointment || nouveauAppointment.cabinetId !== cabinetId) {
        throw new BadRequestException(
          "Le nouveau rendez-vous indiqué n'appartient pas à votre cabinet",
        );
      }
    }

    const updated = await this.prisma.noShowRecovery.update({
      where: { id },
      data: {
        statut: 'recupere',
        nouveauAppointmentId: dto.nouveauAppointmentId ?? undefined,
      },
    });

    await this.auditLog.log({
      userId: actor?.userId,
      cabinetId,
      action: 'no_show_recovery.recovered',
      entityType: 'NoShowRecovery',
      entityId: id,
      details: { nouveauAppointmentId: dto.nouveauAppointmentId ?? null },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }
}
