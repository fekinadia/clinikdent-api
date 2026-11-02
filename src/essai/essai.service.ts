import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { HORAIRES_PAR_DEFAUT, normaliserGsm } from '../reservation/creneaux';
import { remplirCabinetEssai } from './donnees-essai';
import { CreerEssaiDto } from './dto/essai.dto';

export const ESSAI_DUREE_JOURS = 7;

// La base gratuite ne doit pas se remplir : au-delà, on renvoie vers WhatsApp.
const ESSAIS_ACTIFS_MAX = 200;

// Adresse technique : aucun e-mail n'y est jamais envoyé (domaine réservé).
const DOMAINE_ESSAI = 'essai.invalid';

@Injectable()
export class EssaiService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private auditLog: AuditLogService,
  ) {}

  async creer(dto: CreerEssaiDto, ipAddress?: string | null) {
    if (dto.siteWeb) throw new BadRequestException('Demande invalide');

    const gsm = normaliserGsm(dto.gsm);
    if (gsm.length < 11 || gsm.length > 15) {
      throw new BadRequestException('Numéro de téléphone invalide');
    }

    const maintenant = new Date();
    const essaiEnCours = { estDemo: true, demoExpiresAt: { gt: maintenant } };

    const [actifs, dejaInscrit] = await Promise.all([
      this.prisma.cabinet.count({ where: essaiEnCours }),
      this.prisma.user.findFirst({
        where: { telephone: gsm, cabinet: essaiEnCours },
        select: { id: true },
      }),
    ]);
    if (dejaInscrit) {
      throw new ConflictException('Un essai est déjà en cours pour ce numéro');
    }
    if (actifs >= ESSAIS_ACTIFS_MAX) {
      throw new HttpException('Trop d’essais en cours', HttpStatus.TOO_MANY_REQUESTS);
    }

    const email = `essai-${randomBytes(5).toString('hex')}@${DOMAINE_ESSAI}`;
    const motDePasse = randomBytes(8).toString('base64url');
    const passwordHash = await bcrypt.hash(motDePasse, 10);
    const expireLe = new Date(maintenant.getTime() + ESSAI_DUREE_JOURS * 24 * 60 * 60 * 1000);

    const { cabinet, user } = await this.prisma.$transaction(
      async (tx) => {
        const cabinet = await tx.cabinet.create({
          data: {
            nom: dto.nomCabinet.trim(),
            telephone: `+${gsm}`,
            estDemo: true,
            demoExpiresAt: expireLe,
            reservationActive: true,
            reservationHoraires: HORAIRES_PAR_DEFAUT as unknown as Prisma.InputJsonValue,
            // Aucun envoi automatique depuis un cabinet d'essai.
            automationSettings: {
              create: { rappelsActifs: false, noShowActif: false, recallActif: false },
            },
          },
        });
        await tx.cabinet.update({
          where: { id: cabinet.id },
          data: { reservationSlug: `essai-${cabinet.id}` },
        });
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            nom: dto.nom.trim(),
            prenom: dto.prenom.trim(),
            telephone: gsm,
            cabinetId: cabinet.id,
            role: 'admin',
          },
        });
        await remplirCabinetEssai(tx, { cabinetId: cabinet.id, medecinId: user.id, gsm, maintenant });
        return { cabinet, user };
      },
      // Marge pour le premier clic, quand le serveur gratuit vient de se réveiller.
      { maxWait: 10_000, timeout: 20_000 },
    );

    await this.auditLog.log({
      userId: user.id,
      cabinetId: cabinet.id,
      action: 'essai.creer',
      entityType: 'Cabinet',
      entityId: cabinet.id,
      ipAddress,
    });

    const session = await this.authService.signToken(user.id, email, cabinet.id, user.role);
    return { ...session, email, motDePasse, expireLe };
  }
}
