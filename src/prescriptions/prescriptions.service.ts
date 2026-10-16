import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMedicationDto,
  CreatePrescriptionDto,
  CreatePrescriptionModeleDto,
  UpdateMedicationDto,
} from './dto/prescription.dto';

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

  /**
   * Liste globale du cabinet, utilisée par la page Documents (chantier
   * Dentalis, 2026-09-21) pour fusionner les ordonnances avec les 4
   * autres types de documents (module Documents).
   */
  async findAllByCabinet(
    cabinetId: number,
    query: { search?: string; page?: number; limit?: number },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = { patient: { cabinetId } };
    if (query.search) {
      where.patient = {
        cabinetId,
        OR: [
          { nom: { contains: query.search, mode: 'insensitive' } },
          { prenom: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.prescription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { dateEmission: 'desc' },
        include: {
          items: true,
          patient: { select: { id: true, nom: true, prenom: true, numeroDossier: true } },
        },
      }),
      this.prisma.prescription.count({ where }),
    ]);

    return { items, total, page, pageCount: Math.ceil(total / limit) || 1 };
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

  // Médicaments visibles par un cabinet (2026-10-16) : le catalogue commun
  // (cabinetId null, lecture seule) + ceux que ce cabinet a ajoutés lui-même.
  // Les médicaments des autres cabinets ne sont jamais visibles.
  private medicationsVisibles(cabinetId: number, search?: string) {
    return {
      actif: true,
      OR: [{ cabinetId: null }, { cabinetId }],
      ...(search && {
        nom: { contains: search, mode: 'insensitive' as const },
      }),
    };
  }

  // Médicament que ce cabinet a le droit de modifier : uniquement un des
  // siens. Le catalogue commun est refusé (403) ; celui d'un autre cabinet
  // est présenté comme introuvable (404) pour ne pas révéler son existence.
  private async medicationModifiable(cabinetId: number, id: number) {
    const medication = await this.prisma.medication.findUnique({ where: { id } });
    if (!medication || (medication.cabinetId !== null && medication.cabinetId !== cabinetId)) {
      throw new NotFoundException();
    }
    if (medication.cabinetId === null) {
      throw new ForbiddenException(
        'Ce médicament fait partie du catalogue commun : il ne peut pas être modifié.',
      );
    }
    return medication;
  }

  // Médicaments du catalogue — recherche rapide utilisée dans le formulaire
  // d'ordonnance (autocomplete), limitée à 50 résultats.
  async listMedications(cabinetId: number, search?: string) {
    return this.prisma.medication.findMany({
      where: this.medicationsVisibles(cabinetId, search),
      include: { famille: true },
      orderBy: { nom: 'asc' },
      take: 50,
    });
  }

  // Page "Médicaments" (2026-10-02) — catalogue paginé avec le nombre de
  // fois où chaque médicament a été prescrit dans CE cabinet (colonne
  // "Prescrit" façon Dentalis). Depuis le 2026-10-16 : catalogue commun
  // (lecture seule) + médicaments propres au cabinet (modifiables), signalés
  // par `modifiable` ; le comptage "Prescrit" est aussi filtré par cabinet.
  async listMedicationsCatalog(
    cabinetId: number,
    options: { search?: string; page?: number; limit?: number },
  ) {
    const page = Number(options.page) || 1;
    const limit = Number(options.limit) || 20;
    const skip = (page - 1) * limit;

    const where = this.medicationsVisibles(cabinetId, options.search);

    const [items, total] = await Promise.all([
      this.prisma.medication.findMany({
        where,
        include: { famille: true },
        orderBy: { nom: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.medication.count({ where }),
    ]);

    // Un seul count groupé plutôt qu'une requête par médicament (évite le
    // N+1 sur une page de 20 lignes).
    const counts = await this.prisma.prescriptionItem.groupBy({
      by: ['medicationId'],
      where: {
        medicationId: { in: items.map((m) => m.id) },
        prescription: { patient: { cabinetId } },
      },
      _count: { medicationId: true },
    });
    const countByMedicationId = new Map(
      counts.map((c) => [c.medicationId, c._count.medicationId]),
    );

    return {
      items: items.map((m) => ({
        ...m,
        nbPrescriptions: countByMedicationId.get(m.id) || 0,
        modifiable: m.cabinetId === cabinetId,
      })),
      total,
      page,
      pageCount: Math.ceil(total / limit),
    };
  }

  async createMedication(cabinetId: number, dto: CreateMedicationDto) {
    return this.prisma.medication.create({
      data: {
        cabinetId,
        nom: dto.nom,
        dosage: dto.dosage,
        forme: dto.forme,
        posologieDefaut: dto.posologieDefaut,
      },
    });
  }

  async updateMedication(cabinetId: number, id: number, dto: UpdateMedicationDto) {
    await this.medicationModifiable(cabinetId, id);
    return this.prisma.medication.update({
      where: { id },
      data: {
        ...(dto.nom !== undefined && { nom: dto.nom }),
        ...(dto.dosage !== undefined && { dosage: dto.dosage }),
        ...(dto.forme !== undefined && { forme: dto.forme }),
        ...(dto.posologieDefaut !== undefined && { posologieDefaut: dto.posologieDefaut }),
      },
    });
  }

  // Désactivation (pas de suppression définitive) : un médicament est
  // référencé par des ordonnances existantes (PrescriptionItem.medicationId)
  // — un hard delete casserait l'historique. `actif: false` le retire
  // simplement des listes. Seuls les médicaments du cabinet sont concernés.
  async deactivateMedication(cabinetId: number, id: number) {
    await this.medicationModifiable(cabinetId, id);
    return this.prisma.medication.update({ where: { id }, data: { actif: false } });
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
