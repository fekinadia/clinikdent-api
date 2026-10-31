import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppointmentsService } from '../appointments/appointments.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { CurrentUserType } from '../auth/current-user.decorator';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ajouterJours,
  dateTunis,
  estDateValide,
  heuresDuJour,
  heuresLibres,
  Horaires,
  HORAIRES_PAR_DEFAUT,
  instantTunis,
  JOURS_MAX,
  normaliserGsm,
  slugDepuisNom,
  verifierHoraires,
} from './creneaux';
import { ConfirmerDemandeDto, CreerDemandeDto, ReglagesReservationDto } from './dto/reservation.dto';

export interface ActorContext {
  userId: number;
  ipAddress?: string | null;
}

// Limites d'une demande en attente, en plus de la limite par visiteur du contrôleur.
const DEMANDES_MAX_PAR_GSM = 3;
const DEMANDES_MAX_PAR_CABINET = 100;

// Après ce délai, le cabinet n'a plus à répondre sur WhatsApp depuis la page Demandes.
const DELAI_POUR_PREVENIR_MS = 3 * 24 * 60 * 60 * 1000;

/** Dans les dossiers, un numéro tunisien s'écrit sur 8 chiffres. */
const gsmDossier = (gsm: string) => gsm.replace(/^216(?=\d{8}$)/, '');

const CABINET_PUBLIC_SELECT = {
  id: true,
  nom: true,
  adresse: true,
  telephone: true,
  reservationActive: true,
  reservationHoraires: true,
  reservationDureeCreneau: true,
} as const;

type CabinetPublic = Prisma.CabinetGetPayload<{ select: typeof CABINET_PUBLIC_SELECT }>;

@Injectable()
export class ReservationService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private patientsService: PatientsService,
    private appointmentsService: AppointmentsService,
  ) {}

  // ===== Page publique : aucune donnée de patient ne doit en sortir =====

  async infosPubliques(slug: string) {
    const cabinet = await this.cabinetPublic(slug);
    const horaires = cabinet.reservationHoraires as unknown as Horaires;
    const aujourdhui = dateTunis(new Date());
    return {
      nom: cabinet.nom,
      adresse: cabinet.adresse,
      telephone: cabinet.telephone,
      joursOuverts: Object.keys(horaires).map(Number),
      aujourdhui,
      dernierJour: ajouterJours(aujourdhui, JOURS_MAX),
    };
  }

  async creneaux(slug: string, date: string) {
    const cabinet = await this.cabinetPublic(slug);
    return { date, heures: await this.heuresDisponibles(cabinet, date) };
  }

  async creerDemande(slug: string, dto: CreerDemandeDto) {
    const cabinet = await this.cabinetPublic(slug);

    // Un robot a rempli le champ invisible : même réponse, rien n'est enregistré.
    if (dto.siteWeb) return { ok: true };

    const heures = await this.heuresDisponibles(cabinet, dto.date);
    if (!heures.includes(dto.heure)) {
      throw new ConflictException("Ce créneau n'est plus disponible");
    }

    const gsm = normaliserGsm(dto.gsm);
    if (gsm.length < 11 || gsm.length > 15) {
      throw new BadRequestException('Numéro de téléphone invalide');
    }

    const [duNumero, duCabinet] = await Promise.all([
      this.prisma.demandeRdv.count({ where: { cabinetId: cabinet.id, gsm, statut: 'en_attente' } }),
      this.prisma.demandeRdv.count({ where: { cabinetId: cabinet.id, statut: 'en_attente' } }),
    ]);
    if (duNumero >= DEMANDES_MAX_PAR_GSM || duCabinet >= DEMANDES_MAX_PAR_CABINET) {
      throw new HttpException('Trop de demandes en attente', HttpStatus.TOO_MANY_REQUESTS);
    }

    const dateDebut = instantTunis(dto.date, dto.heure);
    try {
      await this.prisma.demandeRdv.create({
        data: {
          cabinetId: cabinet.id,
          prenom: dto.prenom.trim(),
          nom: dto.nom.trim(),
          gsm,
          motif: dto.motif?.trim() || null,
          langue: dto.langue ?? 'fr',
          dateDebut,
          dateFin: new Date(dateDebut.getTime() + cabinet.reservationDureeCreneau * 60_000),
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException("Ce créneau n'est plus disponible");
      }
      throw e;
    }
    return { ok: true };
  }

  // ===== Réglages du cabinet =====

  async reglages(cabinetId: number) {
    const cabinet = await this.prisma.cabinet.findUnique({
      where: { id: cabinetId },
      select: {
        nom: true,
        adresse: true,
        telephone: true,
        reservationActive: true,
        reservationSlug: true,
        reservationHoraires: true,
        reservationDureeCreneau: true,
      },
    });
    if (!cabinet) throw new NotFoundException('Cabinet introuvable');

    return {
      active: cabinet.reservationActive,
      slug: cabinet.reservationSlug ?? (await this.proposerSlug(cabinet.nom, cabinetId)),
      horaires: (cabinet.reservationHoraires as unknown as Horaires | null) ?? HORAIRES_PAR_DEFAUT,
      dureeCreneau: cabinet.reservationDureeCreneau,
      adresse: cabinet.adresse ?? '',
      telephone: cabinet.telephone ?? '',
    };
  }

  async modifierReglages(cabinetId: number, dto: ReglagesReservationDto, actor: ActorContext) {
    let horaires: Horaires;
    try {
      horaires = verifierHoraires(dto.horaires);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (dto.active && Object.keys(horaires).length === 0) {
      throw new BadRequestException("Ajoutez au moins une plage horaire avant d'activer la réservation");
    }

    try {
      await this.prisma.cabinet.update({
        where: { id: cabinetId },
        data: {
          reservationActive: dto.active,
          reservationSlug: dto.slug,
          reservationHoraires: horaires as unknown as Prisma.InputJsonValue,
          reservationDureeCreneau: dto.dureeCreneau,
          ...(dto.adresse !== undefined && { adresse: dto.adresse?.trim() || null }),
          ...(dto.telephone !== undefined && { telephone: dto.telephone?.trim() || null }),
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException('Cette adresse est déjà utilisée par un autre cabinet');
      }
      throw e;
    }

    await this.auditLog.log({
      userId: actor.userId,
      cabinetId,
      action: 'reservation.reglages',
      entityType: 'cabinet',
      entityId: cabinetId,
      details: { active: dto.active, slug: dto.slug, dureeCreneau: dto.dureeCreneau },
      ipAddress: actor.ipAddress,
    });
    return this.reglages(cabinetId);
  }

  // ===== Demandes à traiter par le cabinet =====

  async demandes(cabinetId: number) {
    const demandes = await this.prisma.demandeRdv.findMany({
      where: { cabinetId, statut: 'en_attente' },
      orderBy: { dateDebut: 'asc' },
    });
    if (demandes.length === 0) return [];

    // Le numéro est écrit de plusieurs façons dans les dossiers : la
    // comparaison se fait sur le numéro normalisé, donc côté serveur.
    const patients = await this.prisma.patient.findMany({
      where: { cabinetId, gsm: { not: null } },
      select: { id: true, nom: true, prenom: true, numeroDossier: true, gsm: true },
    });
    const parGsm = new Map<string, typeof patients>();
    for (const patient of patients) {
      const gsm = normaliserGsm(patient.gsm as string);
      parGsm.set(gsm, [...(parGsm.get(gsm) ?? []), patient]);
    }

    return demandes.map((demande) => ({
      ...demande,
      patientsTrouves: parGsm.get(demande.gsm) ?? [],
    }));
  }

  compterDemandes(cabinetId: number) {
    return this.prisma.demandeRdv
      .count({ where: { cabinetId, statut: 'en_attente' } })
      .then((enAttente) => ({ enAttente }));
  }

  /** Demandes traitées récemment, pour envoyer la réponse même après avoir quitté la page. */
  aPrevenir(cabinetId: number) {
    const maintenant = new Date();
    return this.prisma.demandeRdv.findMany({
      where: {
        cabinetId,
        statut: { in: ['confirmee', 'refusee'] },
        traiteeAt: { gte: new Date(maintenant.getTime() - DELAI_POUR_PREVENIR_MS) },
        dateDebut: { gt: maintenant },
      },
      orderBy: { traiteeAt: 'asc' },
    });
  }

  async confirmer(user: CurrentUserType, id: number, dto: ConfirmerDemandeDto, actor: ActorContext) {
    const cabinetId = user.cabinetId;
    const demande = await this.demandeEnAttente(cabinetId, id);
    if (demande.dateDebut <= new Date()) {
      throw new BadRequestException('La date de cette demande est passée');
    }

    const medecinId = await this.medecinParDefaut(user);
    if (medecinId) {
      const conflit = await this.appointmentsService.findConflict(
        cabinetId,
        medecinId,
        demande.dateDebut,
        demande.dateFin,
      );
      if (conflit) {
        throw new ConflictException(
          `Ce créneau est déjà pris par ${conflit.patient.prenom} ${conflit.patient.nom}`,
        );
      }
    }

    // Prise de la demande en premier : un double clic ne crée pas deux rendez-vous.
    await this.marquerTraitee(cabinetId, id, 'confirmee', actor.userId);
    try {
      const patientId =
        dto.patientId ??
        (
          await this.patientsService.create(cabinetId, actor.userId, {
            nom: demande.nom,
            prenom: demande.prenom,
            gsm: gsmDossier(demande.gsm),
            langueMessages: demande.langue,
            estProspect: true,
          })
        ).id;

      const rendezVous = await this.appointmentsService.create(cabinetId, actor.userId, {
        patientId,
        medecinId,
        dateDebut: demande.dateDebut.toISOString(),
        dateFin: demande.dateFin.toISOString(),
        observation: demande.motif ? `Réservation en ligne : ${demande.motif}` : 'Réservation en ligne',
      });

      await this.prisma.demandeRdv.update({ where: { id }, data: { appointmentId: rendezVous.id } });
      await this.auditLog.log({
        userId: actor.userId,
        cabinetId,
        action: 'reservation.confirmer',
        entityType: 'demande_rdv',
        entityId: id,
        details: { appointmentId: rendezVous.id, patientId },
        ipAddress: actor.ipAddress,
      });
      return rendezVous;
    } catch (e) {
      await this.prisma.demandeRdv.update({
        where: { id },
        data: { statut: 'en_attente', traiteeAt: null, traiteePar: null },
      });
      throw e;
    }
  }

  async refuser(cabinetId: number, id: number, actor: ActorContext) {
    await this.demandeEnAttente(cabinetId, id);
    await this.marquerTraitee(cabinetId, id, 'refusee', actor.userId);
    await this.auditLog.log({
      userId: actor.userId,
      cabinetId,
      action: 'reservation.refuser',
      entityType: 'demande_rdv',
      entityId: id,
      ipAddress: actor.ipAddress,
    });
    return { ok: true };
  }

  // ===== Interne =====

  /** Même réponse pour un lien inconnu et pour une réservation désactivée. */
  private async cabinetPublic(slug: string): Promise<CabinetPublic> {
    const cabinet = await this.prisma.cabinet.findUnique({
      where: { reservationSlug: slug },
      select: CABINET_PUBLIC_SELECT,
    });
    if (!cabinet || !cabinet.reservationActive || !cabinet.reservationHoraires) {
      throw new NotFoundException('Page de réservation introuvable');
    }
    return cabinet;
  }

  private async heuresDisponibles(cabinet: CabinetPublic, date: string): Promise<string[]> {
    const maintenant = new Date();
    const aujourdhui = dateTunis(maintenant);
    if (!estDateValide(date) || date < aujourdhui || date > ajouterJours(aujourdhui, JOURS_MAX)) {
      return [];
    }

    const duree = cabinet.reservationDureeCreneau;
    const heures = heuresDuJour(cabinet.reservationHoraires as unknown as Horaires, duree, date);
    if (heures.length === 0) return [];

    const debut = instantTunis(date, '00:00');
    const fin = new Date(debut.getTime() + 24 * 60 * 60 * 1000);
    const chevauche = { cabinetId: cabinet.id, dateDebut: { lt: fin }, dateFin: { gt: debut } };
    const periode = { dateDebut: true, dateFin: true } as const;
    const [rendezVous, evenements, demandes] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { ...chevauche, statut: { not: 'annule' } },
        select: periode,
      }),
      this.prisma.calendarEvent.findMany({ where: chevauche, select: periode }),
      this.prisma.demandeRdv.findMany({
        where: { ...chevauche, statut: 'en_attente' },
        select: periode,
      }),
    ]);

    return heuresLibres(heures, date, duree, [...rendezVous, ...evenements, ...demandes], maintenant);
  }

  private async proposerSlug(nom: string, cabinetId: number): Promise<string> {
    const base = slugDepuisNom(nom);
    const slug = base.length >= 3 ? base : `cabinet-${cabinetId}`;
    const pris = await this.prisma.cabinet.findUnique({
      where: { reservationSlug: slug },
      select: { id: true },
    });
    return pris ? `${slug}-${cabinetId}` : slug;
  }

  private async demandeEnAttente(cabinetId: number, id: number) {
    const demande = await this.prisma.demandeRdv.findUnique({ where: { id } });
    if (!demande || demande.cabinetId !== cabinetId) {
      throw new NotFoundException('Demande introuvable');
    }
    if (demande.statut !== 'en_attente') {
      throw new ConflictException('Cette demande a déjà été traitée');
    }
    return demande;
  }

  private async marquerTraitee(
    cabinetId: number,
    id: number,
    statut: 'confirmee' | 'refusee',
    userId: number,
  ) {
    const { count } = await this.prisma.demandeRdv.updateMany({
      where: { id, cabinetId, statut: 'en_attente' },
      data: { statut, traiteeAt: new Date(), traiteePar: userId },
    });
    if (count === 0) throw new ConflictException('Cette demande a déjà été traitée');
  }

  /** Le praticien qui confirme, sinon le seul praticien du cabinet s'il n'y en a qu'un. */
  private async medecinParDefaut(user: CurrentUserType): Promise<number | undefined> {
    if (user.role === 'admin' || user.role === 'medecin') return user.userId;
    const praticiens = await this.prisma.user.findMany({
      where: { cabinetId: user.cabinetId, role: { in: ['admin', 'medecin'] }, actif: true },
      select: { id: true },
      take: 2,
    });
    return praticiens.length === 1 ? praticiens[0].id : undefined;
  }
}
