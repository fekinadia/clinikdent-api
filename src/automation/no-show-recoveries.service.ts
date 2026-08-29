import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNoShowRecoveryDto } from './dto/no-show-recovery.dto';

@Injectable()
export class NoShowRecoveriesService {
  constructor(private prisma: PrismaService) {}

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
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async assertRecoveryDuCabinet(cabinetId: number, id: number) {
    const recovery = await this.prisma.noShowRecovery.findUnique({
      where: { id },
      include: { appointment: true },
    });
    if (!recovery) throw new NotFoundException('Relance no-show introuvable');
    if (recovery.appointment.cabinetId !== cabinetId) {
      throw new ForbiddenException("Cette relance n'appartient pas à votre cabinet");
    }
    return recovery;
  }

  async update(cabinetId: number, id: number, dto: UpdateNoShowRecoveryDto) {
    await this.assertRecoveryDuCabinet(cabinetId, id);

    return this.prisma.noShowRecovery.update({
      where: { id },
      data: { statut: dto.statut },
    });
  }
}
