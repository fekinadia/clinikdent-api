import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TypeImagePatient } from './dto/patient-image.dto';

const MIME_AUTORISES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const TAILLE_MAX_OCTETS = 15 * 1024 * 1024; // 15 Mo
const DUREE_URL_SIGNEE = 300; // secondes

@Injectable()
export class PatientImagesService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private async assertPatientDuCabinet(cabinetId: number, patientId: number) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Patient introuvable');
    if (patient.cabinetId !== cabinetId) {
      throw new ForbiddenException("Ce patient n'appartient pas à votre cabinet");
    }
    return patient;
  }

  private storageConfig() {
    const url = this.config.get<string>('SUPABASE_URL');
    const serviceKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const bucket = this.config.get<string>('SUPABASE_STORAGE_BUCKET') || 'patient-files';
    if (!url || !serviceKey) {
      throw new BadRequestException(
        "Le stockage des fichiers n'est pas encore configuré (Supabase Storage)",
      );
    }
    return { url, serviceKey, bucket };
  }

  async upload(
    cabinetId: number,
    patientId: number,
    userId: number,
    file: Express.Multer.File,
    dto: { type: TypeImagePatient; titre?: string; observation?: string; datePrise?: string },
  ) {
    await this.assertPatientDuCabinet(cabinetId, patientId);

    if (!file) {
      throw new BadRequestException('Aucun fichier reçu');
    }
    if (!MIME_AUTORISES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Format non supporté. Formats acceptés : JPEG, PNG, WEBP, PDF.',
      );
    }
    if (file.size > TAILLE_MAX_OCTETS) {
      throw new BadRequestException('Fichier trop volumineux (15 Mo maximum)');
    }

    const { url, serviceKey, bucket } = this.storageConfig();
    const extension = file.originalname.split('.').pop() || 'bin';
    const chemin = `cabinet-${cabinetId}/patient-${patientId}/${randomUUID()}.${extension}`;

    const res = await fetch(`${url}/storage/v1/object/${bucket}/${chemin}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': file.mimetype,
      },
      body: file.buffer as unknown as BodyInit,
    });

    if (!res.ok) {
      throw new BadRequestException("Erreur lors de l'envoi du fichier au stockage");
    }

    const created = await this.prisma.patientImage.create({
      data: {
        patientId,
        type: dto.type,
        titre: dto.titre,
        cheminFichier: chemin,
        tailleOctets: BigInt(file.size),
        mimeType: file.mimetype,
        datePrise: dto.datePrise ? new Date(dto.datePrise) : null,
        observation: dto.observation,
        uploadedById: userId,
      },
    });

    return { ...created, tailleOctets: created.tailleOctets ? created.tailleOctets.toString() : null };
  }

  async list(cabinetId: number, patientId: number) {
    await this.assertPatientDuCabinet(cabinetId, patientId);

    const images = await this.prisma.patientImage.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });

    const { url, serviceKey, bucket } = this.storageConfig();

    const avecUrls = await Promise.all(
      images.map(async (image) => {
        const res = await fetch(
          `${url}/storage/v1/object/sign/${bucket}/${image.cheminFichier}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ expiresIn: DUREE_URL_SIGNEE }),
          },
        );
        const data = res.ok ? ((await res.json()) as { signedURL?: string }) : null;
        return {
          ...image,
          tailleOctets: image.tailleOctets ? image.tailleOctets.toString() : null,
          url: data?.signedURL ? `${url}/storage/v1${data.signedURL}` : null,
        };
      }),
    );

    return avecUrls;
  }

  async delete(cabinetId: number, patientId: number, imageId: number) {
    await this.assertPatientDuCabinet(cabinetId, patientId);

    const image = await this.prisma.patientImage.findUnique({ where: { id: imageId } });
    if (!image || image.patientId !== patientId) {
      throw new NotFoundException('Fichier introuvable');
    }

    const { url, serviceKey, bucket } = this.storageConfig();
    await fetch(`${url}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: [image.cheminFichier] }),
    });

    await this.prisma.patientImage.delete({ where: { id: imageId } });
    return { success: true };
  }
}
