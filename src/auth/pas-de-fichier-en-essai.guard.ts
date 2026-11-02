import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * L'essai se crée sans compte vérifié : pas d'envoi de fichiers, pour que le
 * stockage ne serve pas à héberger n'importe quoi. Refuse avant de lire le fichier.
 */
@Injectable()
export class PasDeFichierEnEssaiGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { cabinetId } = context.switchToHttp().getRequest().user;
    const cabinet = await this.prisma.cabinet.findUnique({
      where: { id: cabinetId },
      select: { estDemo: true },
    });
    if (cabinet?.estDemo) {
      throw new ForbiddenException("L'ajout de fichiers n'est pas disponible pendant l'essai");
    }
    return true;
  }
}
