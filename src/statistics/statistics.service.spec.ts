import { StatisticsService } from './statistics.service';

const CABINET_A = 1;

function makeService() {
  const prisma = {
    patient: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    appointment: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    payment: { findMany: jest.fn().mockResolvedValue([]) },
    treatmentAct: { findMany: jest.fn().mockResolvedValue([]) },
    noShowRecovery: { count: jest.fn().mockResolvedValue(0) },
  } as any;
  const service = new StatisticsService(prisma);
  return { service, prisma };
}

describe('StatisticsService.getOverview — suivi du statut no_show (STEP 4)', () => {
  it("compte séparément 'absent' (legacy) et 'no_show' (officiel), sans mélanger les deux compteurs bruts", async () => {
    const { service, prisma } = makeService();
    const now = new Date();
    prisma.appointment.findMany.mockResolvedValue([
      { dateDebut: now, statut: 'absent' },
      { dateDebut: now, statut: 'no_show' },
      { dateDebut: now, statut: 'no_show' },
      { dateDebut: now, statut: 'termine' },
    ]);

    const overview = await service.getOverview(CABINET_A, 6);

    // 1 'absent' / 4 RDV
    expect(overview.rendezVous.tauxAbsence).toBe(25);
    // 2 'no_show' / 4 RDV
    expect(overview.rendezVous.tauxNoShow).toBe(50);
    // vue combinée : (1 + 2) / 4
    expect(overview.rendezVous.tauxAbsenceGlobal).toBe(75);
  });

  it("ne casse pas tauxAbsence historique quand aucun no_show n'est présent (rétrocompatibilité)", async () => {
    const { service, prisma } = makeService();
    const now = new Date();
    prisma.appointment.findMany.mockResolvedValue([
      { dateDebut: now, statut: 'absent' },
      { dateDebut: now, statut: 'termine' },
      { dateDebut: now, statut: 'termine' },
      { dateDebut: now, statut: 'termine' },
    ]);

    const overview = await service.getOverview(CABINET_A, 6);

    expect(overview.rendezVous.tauxAbsence).toBe(25);
    expect(overview.rendezVous.tauxNoShow).toBe(0);
  });

  it('renvoie des taux à 0 quand il n\'y a aucun rendez-vous sur la période (pas de division par zéro)', async () => {
    const { service } = makeService();

    const overview = await service.getOverview(CABINET_A, 6);

    expect(overview.rendezVous.tauxAbsence).toBe(0);
    expect(overview.rendezVous.tauxNoShow).toBe(0);
    expect(overview.rendezVous.tauxAbsenceGlobal).toBe(0);
  });

  it('inclut un compteur no_show par mois dans parMois', async () => {
    const { service, prisma } = makeService();
    const now = new Date();
    prisma.appointment.findMany.mockResolvedValue([{ dateDebut: now, statut: 'no_show' }]);

    const overview = await service.getOverview(CABINET_A, 1);

    expect(overview.rendezVous.parMois[0].no_show).toBe(1);
  });
});

describe('StatisticsService.getAutomationOverview — compteurs du dashboard automatisation (STEP 4)', () => {
  it('agrège les no-show et les relances par statut, isolés par cabinet', async () => {
    const { service, prisma } = makeService();
    prisma.appointment.count.mockResolvedValue(7); // total no_show
    prisma.noShowRecovery.count
      .mockResolvedValueOnce(2) // en_attente
      .mockResolvedValueOnce(3) // recupere
      .mockResolvedValueOnce(1) // perdu
      .mockResolvedValueOnce(0); // annule

    const result = await service.getAutomationOverview(CABINET_A);

    expect(result).toEqual({
      noShows: 7,
      relances: { enAttente: 2, recupere: 3, perdu: 1, annule: 0 },
    });
    expect(prisma.appointment.count).toHaveBeenCalledWith({
      where: { cabinetId: CABINET_A, statut: 'no_show' },
    });
  });
});
