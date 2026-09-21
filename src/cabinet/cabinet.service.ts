import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CabinetService {
  constructor(private prisma: PrismaService) {}

  /**
   * Infos du cabinet + du médecin connecté, utilisées pour composer
   * l'entête (letterhead) des documents imprimés (Documents, Ordonnances) :
   * nom/adresse/téléphone/logo du cabinet, nom/spécialité/n° d'ordre du
   * médecin. Chantier Documents (2026-09-21).
   */
  async getMe(cabinetId: number, userId: number) {
    const [cabinet, medecin] = await Promise.all([
      this.prisma.cabinet.findUnique({
        where: { id: cabinetId },
        select: { nom: true, adresse: true, telephone: true, email: true, logoUrl: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { nom: true, prenom: true, specialite: true, numeroOrdre: true },
      }),
    ]);
    if (!cabinet) throw new NotFoundException('Cabinet introuvable');

    return { cabinet, medecin };
  }
}
