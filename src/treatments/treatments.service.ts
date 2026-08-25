import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTreatmentDto, RecordPaymentDto, UpdateToothStateDto } from './dto/treatment.dto';

@Injectable()
export class TreatmentsService {
  constructor(private prisma: PrismaService) {}

  async create(cabinetId: number, userId: number, dto: CreateTreatmentDto) {
    // Vérifier que le patient appartient au cabinet
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient || patient.cabinetId !== cabinetId) {
      throw new ForbiddenException('Patient invalide');
    }

    return this.prisma.treatment.create({
      data: {
        patientId: dto.patientId,
        appointmentId: dto.appointmentId,
        dateSoin: new Date(dto.dateSoin),
        observations: dto.observations,
        medecinId: userId,
        acts: {
          create: dto.acts.map((a) => ({
            acteId: a.acteId,
            libelle: a.libelle,
            dents: a.dents,
            cout: a.cout,
            montantRecu: a.montantRecu || 0,
            remise: a.remise || 0,
            modeReglement: a.modeReglement,
            typeSoin: a.typeSoin || 'realise',
          })),
        },
      },
      include: { acts: true, patient: true },
    });
  }

  async findByPatient(cabinetId: number, patientId: number) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient || patient.cabinetId !== cabinetId) {
      throw new ForbiddenException();
    }

    return this.prisma.treatment.findMany({
      where: { patientId },
      orderBy: { dateSoin: 'desc' },
      include: { acts: true, medecin: { select: { nom: true, prenom: true } } },
    });
  }

  async getFinancialSummary(cabinetId: number, patientId: number) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient || patient.cabinetId !== cabinetId) {
      throw new ForbiddenException();
    }

    const result = await this.prisma.treatmentAct.aggregate({
      where: {
        treatment: { patientId },
        typeSoin: 'realise',
      },
      _sum: {
        cout: true,
        montantRecu: true,
        remise: true,
      },
    });

    const total = Number(result._sum.cout || 0);
    const recu = Number(result._sum.montantRecu || 0);
    const remise = Number(result._sum.remise || 0);
    const reste = total - recu - remise;

    return { total, recu, remise, reste };
  }

  async recordPayment(
    cabinetId: number,
    userId: number,
    actId: number,
    dto: RecordPaymentDto,
  ) {
    const act = await this.prisma.treatmentAct.findUnique({
      where: { id: actId },
      include: { treatment: { include: { patient: true } } },
    });
    if (!act || act.treatment.patient.cabinetId !== cabinetId) {
      throw new ForbiddenException('Acte invalide');
    }

    const cout = Number(act.cout);
    const remise = Number(act.remise);
    const dejaRecu = Number(act.montantRecu);
    const reste = cout - remise - dejaRecu;

    if (dto.montant > reste + 0.01) {
      throw new BadRequestException(
        `Le montant dépasse le solde dû (${reste.toFixed(2)} DT)`,
      );
    }

    const modeReglement = dto.modeReglement || act.modeReglement || 'especes';

    const [updatedAct] = await this.prisma.$transaction([
      this.prisma.treatmentAct.update({
        where: { id: actId },
        data: { montantRecu: { increment: dto.montant }, modeReglement },
      }),
      this.prisma.payment.create({
        data: {
          patientId: act.treatment.patientId,
          treatmentActId: actId,
          montant: dto.montant,
          modeReglement,
          remarque: dto.remarque,
          createdById: userId,
        },
      }),
    ]);

    return updatedAct;
  }

  // ==== SCHÉMA DENTAIRE ====

  async getToothChart(cabinetId: number, patientId: number) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient || patient.cabinetId !== cabinetId) {
      throw new ForbiddenException();
    }

    return this.prisma.toothState.findMany({
      where: { patientId },
      orderBy: { dentNumero: 'asc' },
    });
  }

  async upsertToothState(
    cabinetId: number,
    userId: number,
    patientId: number,
    dto: UpdateToothStateDto,
  ) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient || patient.cabinetId !== cabinetId) {
      throw new ForbiddenException();
    }

    return this.prisma.toothState.upsert({
      where: {
        patientId_dentNumero: { patientId, dentNumero: dto.dentNumero },
      },
      update: {
        etat: dto.etat,
        notes: dto.notes,
        modifiedById: userId,
        dateModif: new Date(),
      },
      create: {
        patientId,
        dentNumero: dto.dentNumero,
        etat: dto.etat,
        notes: dto.notes,
        modifiedById: userId,
      },
    });
  }
}
