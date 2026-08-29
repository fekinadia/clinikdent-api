import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppointmentRemindersService {
  constructor(private prisma: PrismaService) {}

  async findAll(cabinetId: number, statut?: string) {
    return this.prisma.appointmentReminder.findMany({
      where: {
        appointment: { cabinetId },
        ...(statut ? { statut } : {}),
      },
      include: {
        appointment: {
          include: {
            patient: { select: { id: true, nom: true, prenom: true, gsm: true } },
            medecin: { select: { id: true, nom: true, prenom: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
