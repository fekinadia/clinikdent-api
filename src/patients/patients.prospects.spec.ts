import { PATIENT_VISIBLE } from './patient-visible';
import { PatientsService } from './patients.service';

const CABINET = 1;

function makeService() {
  const prisma = {
    patient: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    cabinet: { findUnique: jest.fn().mockResolvedValue({ plan: 'starter' }) },
  } as any;
  const service = new PatientsService(prisma, { log: jest.fn() } as any);
  return { service, prisma };
}

describe('Prospects hors de la liste Patients', () => {
  it('garde visible un prospect qui a un soin ou un paiement', () => {
    expect(PATIENT_VISIBLE).toEqual({
      OR: [{ estProspect: false }, { treatments: { some: {} } }, { payments: { some: {} } }],
    });
  });

  it('retire les prospects de la liste Patients', async () => {
    const { service, prisma } = makeService();
    await service.findAll(CABINET, { estProspect: 'false' } as any);

    expect(prisma.patient.findMany.mock.calls[0][0].where).toEqual({
      cabinetId: CABINET,
      AND: [PATIENT_VISIBLE],
    });
    expect(prisma.patient.count.mock.calls[0][0].where).toEqual({
      cabinetId: CABINET,
      AND: [PATIENT_VISIBLE],
    });
  });

  it('combine ce filtre avec la recherche', async () => {
    const { service, prisma } = makeService();
    await service.findAll(CABINET, { estProspect: 'false', search: 'sami' } as any);

    const { where } = prisma.patient.findMany.mock.calls[0][0];
    expect(where.AND).toEqual([PATIENT_VISIBLE]);
    expect(where.OR.length).toBeGreaterThan(0);
  });

  it('peut lister seulement les prospects', async () => {
    const { service, prisma } = makeService();
    await service.findAll(CABINET, { estProspect: 'true' } as any);

    expect(prisma.patient.findMany.mock.calls[0][0].where).toEqual({
      cabinetId: CABINET,
      estProspect: true,
    });
  });

  it('garde les prospects dans la recherche du Nouveau RDV, pour éviter les doublons', async () => {
    const { service, prisma } = makeService();
    await service.findAll(CABINET, { search: 'sami' } as any);

    const { where } = prisma.patient.findMany.mock.calls[0][0];
    expect(where.AND).toBeUndefined();
    expect(where.estProspect).toBeUndefined();
  });

  it('ne compte pas les prospects dans les chiffres du tableau de bord', async () => {
    const { service, prisma } = makeService();
    await service.getStats(CABINET);

    expect(prisma.patient.count.mock.calls[0][0].where).toEqual({ cabinetId: CABINET, ...PATIENT_VISIBLE });
    expect(prisma.patient.count.mock.calls[1][0].where).toMatchObject({ cabinetId: CABINET, ...PATIENT_VISIBLE });
  });
});
