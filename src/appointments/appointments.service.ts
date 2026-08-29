import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  ListAppointmentsQueryDto,
} from './dto/appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(cabinetId: number, userId: number, dto: CreateAppointmentDto) {
    const dateDebut = new Date(dto.dateDebut);
    const dateFin = new Date(dto.dateFin);

    if (dateFin <= dateDebut) {
      throw new BadRequestException('La date de fin doit être après la date de début');
    }

    // Vérifier que le patient appartient au cabinet
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient || patient.cabinetId !== cabinetId) {
      throw new ForbiddenException('Patient invalide');
    }

    // Vérifier que le médecin et le type de RDV appartiennent au cabinet
    if (dto.medecinId) {
      await this.assertMedecinInCabinet(cabinetId, dto.medecinId);
    }
    if (dto.typeId) {
      await this.assertTypeInCabinet(cabinetId, dto.typeId);
    }

    // Vérifier les conflits d'horaires pour le médecin
    if (dto.medecinId) {
      const conflict = await this.findConflict(
        cabinetId,
        dto.medecinId,
        dateDebut,
        dateFin,
      );
      if (conflict) {
        throw new BadRequestException(
          `Conflit avec un autre RDV de ${conflict.patient.prenom} ${conflict.patient.nom} à ${conflict.dateDebut.toLocaleTimeString('fr-FR')}`,
        );
      }
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        patientId: dto.patientId,
        medecinId: dto.medecinId,
        typeId: dto.typeId,
        dateDebut,
        dateFin,
        observation: dto.observation,
        cabinetId,
        createdById: userId,
      },
      include: {
        patient: true,
        type: true,
      },
    });

    this.eventEmitter.emit('appointment.created', {
      appointmentId: appointment.id,
      cabinetId: appointment.cabinetId,
    });

    return appointment;
  }

  async findAll(cabinetId: number, query: ListAppointmentsQueryDto) {
    const where: any = { cabinetId };

    if (query.dateDebut) {
      where.dateDebut = { gte: new Date(query.dateDebut) };
    }
    if (query.dateFin) {
      where.dateFin = { lte: new Date(query.dateFin) };
    }
    if (query.patientId) {
      where.patientId = Number(query.patientId);
    }
    if (query.medecinId) {
      where.medecinId = Number(query.medecinId);
    }

    return this.prisma.appointment.findMany({
      where,
      orderBy: { dateDebut: 'asc' },
      include: {
        patient: { select: { id: true, nom: true, prenom: true, gsm: true } },
        type: true,
        medecin: { select: { id: true, nom: true, prenom: true } },
      },
    });
  }

  async findToday(cabinetId: number) {
    const today = new Date();
    const start = new Date(today.setHours(0, 0, 0, 0));
    const end = new Date(today.setHours(23, 59, 59, 999));

    return this.prisma.appointment.findMany({
      where: {
        cabinetId,
        dateDebut: { gte: start, lte: end },
      },
      orderBy: { dateDebut: 'asc' },
      include: {
        patient: { select: { id: true, nom: true, prenom: true, gsm: true } },
        type: true,
      },
    });
  }

  async findOne(cabinetId: number, id: number) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id },
      include: { patient: true, type: true, medecin: true },
    });

    if (!appt) throw new NotFoundException('Rendez-vous introuvable');
    if (appt.cabinetId !== cabinetId) {
      throw new ForbiddenException('Accès refusé');
    }
    return appt;
  }

  async update(cabinetId: number, id: number, dto: UpdateAppointmentDto) {
    const before = await this.findOne(cabinetId, id);

    // Si le RDV est ré-attaché à un autre patient/médecin/type, vérifier
    // que ces entités appartiennent bien au même cabinet (anti cross-tenant).
    if (dto.patientId) {
      const patient = await this.prisma.patient.findUnique({
        where: { id: dto.patientId },
      });
      if (!patient || patient.cabinetId !== cabinetId) {
        throw new ForbiddenException('Patient invalide');
      }
    }
    if (dto.medecinId) {
      await this.assertMedecinInCabinet(cabinetId, dto.medecinId);
    }
    if (dto.typeId) {
      await this.assertTypeInCabinet(cabinetId, dto.typeId);
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        ...dto,
        dateDebut: dto.dateDebut ? new Date(dto.dateDebut) : undefined,
        dateFin: dto.dateFin ? new Date(dto.dateFin) : undefined,
      },
      include: { patient: true, type: true },
    });

    // Émission d'événements d'automatisation (Phase 2) uniquement si le statut
    // a réellement changé vers une des valeurs suivies — comportement métier inchangé sinon.
    if (dto.statut !== undefined && dto.statut !== before.statut) {
      if (updated.statut === 'confirme') {
        this.eventEmitter.emit('appointment.confirmed', {
          appointmentId: updated.id,
          cabinetId: updated.cabinetId,
        });
      } else if (updated.statut === 'annule') {
        this.eventEmitter.emit('appointment.cancelled', {
          appointmentId: updated.id,
          cabinetId: updated.cabinetId,
        });
      } else if (updated.statut === 'termine') {
        this.eventEmitter.emit('appointment.completed', {
          appointmentId: updated.id,
          cabinetId: updated.cabinetId,
          patientId: updated.patientId,
        });
      } else if (updated.statut === 'no_show') {
        this.eventEmitter.emit('appointment.no_show', {
          appointmentId: updated.id,
          cabinetId: updated.cabinetId,
          patientId: updated.patientId,
        });
      }
    }

    return updated;
  }

  async delete(cabinetId: number, id: number) {
    await this.findOne(cabinetId, id);
    await this.prisma.appointment.delete({ where: { id } });
    return { success: true };
  }

  private async assertMedecinInCabinet(cabinetId: number, medecinId: number) {
    const medecin = await this.prisma.user.findUnique({
      where: { id: medecinId },
    });
    if (!medecin || medecin.cabinetId !== cabinetId) {
      throw new ForbiddenException('Médecin invalide');
    }
  }

  private async assertTypeInCabinet(cabinetId: number, typeId: number) {
    const type = await this.prisma.appointmentType.findUnique({
      where: { id: typeId },
    });
    if (!type || type.cabinetId !== cabinetId) {
      throw new ForbiddenException('Type de rendez-vous invalide');
    }
  }

  private async findConflict(
    cabinetId: number,
    medecinId: number,
    debut: Date,
    fin: Date,
  ) {
    return this.prisma.appointment.findFirst({
      where: {
        cabinetId,
        medecinId,
        statut: { not: 'annule' },
        OR: [
          { dateDebut: { lt: fin }, dateFin: { gt: debut } },
        ],
      },
      include: { patient: true },
    });
  }
}
