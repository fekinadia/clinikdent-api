import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PatientImagesService } from './patient-images.service';

// Pièces jointes rattachées à une consultation (2026-10-16).

const CABINET_A = 1;

function makeService({ patient, treatment, image }: { patient?: any; treatment?: any; image?: any }) {
  const prisma = {
    patient: { findUnique: jest.fn().mockResolvedValue(patient) },
    treatment: { findUnique: jest.fn().mockResolvedValue(treatment) },
    patientImage: {
      create: jest.fn(async ({ data }: any) => ({ id: 70, createdAt: new Date(), tailleOctets: BigInt(5), ...data })),
      findUnique: jest.fn().mockResolvedValue(image),
      update: jest.fn(async ({ data }: any) => ({ ...image, ...data, tailleOctets: null })),
    },
  } as any;
  const config = {
    get: jest.fn((k: string) => ({ SUPABASE_URL: 'https://sb.example', SUPABASE_SERVICE_ROLE_KEY: 'svc' } as any)[k]),
  } as any;
  return { service: new PatientImagesService(prisma, config), prisma };
}

const file = { originalname: 'radio.jpg', mimetype: 'image/jpeg', size: 10, buffer: Buffer.from('x') } as any;

beforeEach(() => {
  (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
});

describe('PatientImagesService — consultation', () => {
  it("enregistre la consultation quand elle appartient au patient", async () => {
    const { service, prisma } = makeService({
      patient: { id: 9, cabinetId: CABINET_A },
      treatment: { id: 3, patientId: 9 },
    });
    await service.upload(CABINET_A, 9, 7, file, { type: 'radio', treatmentId: 3 } as any);
    expect(prisma.patientImage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ treatmentId: 3, patientId: 9 }) }),
    );
  });

  it("sans consultation, le fichier est enregistré sans lien (comme avant)", async () => {
    const { service, prisma } = makeService({ patient: { id: 9, cabinetId: CABINET_A } });
    await service.upload(CABINET_A, 9, 7, file, { type: 'photo' } as any);
    expect(prisma.treatment.findUnique).not.toHaveBeenCalled();
    expect(prisma.patientImage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ treatmentId: null }) }),
    );
  });

  it("refuse une consultation d'un autre patient, sans rien envoyer au stockage", async () => {
    const { service, prisma } = makeService({
      patient: { id: 9, cabinetId: CABINET_A },
      treatment: { id: 3, patientId: 12 },
    });
    await expect(
      service.upload(CABINET_A, 9, 7, file, { type: 'radio', treatmentId: 3 } as any),
    ).rejects.toThrow(BadRequestException);
    expect((global as any).fetch).not.toHaveBeenCalled();
    expect(prisma.patientImage.create).not.toHaveBeenCalled();
  });

  it('rattache puis détache une pièce jointe existante', async () => {
    const { service, prisma } = makeService({
      patient: { id: 9, cabinetId: CABINET_A },
      treatment: { id: 3, patientId: 9 },
      image: { id: 70, patientId: 9, treatmentId: null },
    });
    await service.link(CABINET_A, 9, 70, 3);
    expect(prisma.patientImage.update).toHaveBeenLastCalledWith({ where: { id: 70 }, data: { treatmentId: 3 } });
    await service.link(CABINET_A, 9, 70, null);
    expect(prisma.patientImage.update).toHaveBeenLastCalledWith({ where: { id: 70 }, data: { treatmentId: null } });
  });

  it("refuse de rattacher le fichier d'un autre patient (404) ou d'un autre cabinet (403)", async () => {
    const autrePatient = makeService({
      patient: { id: 9, cabinetId: CABINET_A },
      image: { id: 70, patientId: 12 },
    });
    await expect(autrePatient.service.link(CABINET_A, 9, 70, 3)).rejects.toThrow(NotFoundException);

    const autreCabinet = makeService({ patient: { id: 9, cabinetId: 2 } });
    await expect(autreCabinet.service.link(CABINET_A, 9, 70, 3)).rejects.toThrow(ForbiddenException);
  });
});
