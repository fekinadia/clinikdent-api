import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePrescriptionDto, CreatePrescriptionModeleDto } from './dto/prescription.dto';

@Injectable()
export class PrescriptionsService {
  constructor(private prisma: PrismaService) {}

  async create(cabinetId: number, userId: number, dto: CreatePrescriptionDto) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });
    if (!patient || patient.cabinetId !== cabinetId) {
      throw new ForbiddenException();
    }

    return this.prisma.prescription.create({
      data: {
        patientId: dto.patientId,
        medecinId: userId,
        dateEmission: dto.dateEmission ? new Date(dto.dateEmission) : new Date(),
        texteLibre: dto.texteLibre,
        items: {
          create: dto.items.map((item, i) => ({
            medicationId: item.medicationId,
            nomMedicament: item.nomMedicament,
            posologie: item.posologie,
            ordre: i,
          })),
        },
      },
      include: {
        items: true,
        patient: { select: { nom: true, prenom: true, dateNaissance: true } },
      },
    });
  }

  async findByPatient(cabinetId: number, patientId: number) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient || patient.cabinetId !== cabinetId) {
      throw new ForbiddenException();
    }

    return this.prisma.prescription.findMany({
      where: { patientId },
      orderBy: { dateEmission: 'desc' },
      include: { items: true },
    });
  }

  async findOne(cabinetId: number, id: number) {
    const presc = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        items: true,
        patient: true,
        medecin: { select: { nom: true, prenom: true, specialite: true } },
      },
    });
    if (!presc) throw new NotFoundException();
    if (presc.patient.cabinetId !== cabinetId) throw new ForbiddenException();
    return presc;
  }

  // Médicaments du catalogue
  async listMedications(search?: string) {
    return this.prisma.medication.findMany({
      where: {
        actif: true,
        ...(search && {
          nom: { contains: search, mode: 'insensitive' },
        }),
      },
      include: { famille: true },
      orderBy: { nom: 'asc' },
      take: 50,
    });
  }

  // Ordonnances types
  async listTemplates(cabinetId: number) {
    return this.prisma.prescriptionTemplate.findMany({
      where: { cabinetId },
      include: {
        items: { include: { medication: true }, orderBy: { ordre: 'asc' } },
      },
      orderBy: { libelle: 'asc' },
    });
  }

  // Modèles d'ordonnances (texte libre réutilisable)
  async listModeles(cabinetId: number) {
    return this.prisma.prescriptionModele.findMany({
      where: { cabinetId },
      orderBy: { nom: 'asc' },
    });
  }

  async createModele(cabinetId: number, userId: number, dto: CreatePrescriptionModeleDto) {
    return this.prisma.prescriptionModele.create({
      data: {
        cabinetId,
        nom: dto.nom,
        contenu: dto.contenu,
        createdById: userId,
      },
    });
  }

  async deleteModele(cabinetId: number, id: number) {
    const modele = await this.prisma.prescriptionModele.findUnique({ where: { id } });
    if (!modele || modele.cabinetId !== cabinetId) {
      throw new ForbiddenException();
    }
    await this.prisma.prescriptionModele.delete({ where: { id } });
    return { success: true };
  }
}
