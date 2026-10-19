import { PatientsService } from './patients.service';
import { AuditLogService } from '../audit/audit-log.service';
import { parseBirthDateSearch } from './birth-date-search';

// Recherche de patients par date de naissance (2026-10-19).

const d = (y: number, m: number, j: number) => new Date(Date.UTC(y, m - 1, j));

describe('parseBirthDateSearch', () => {
  it.each([
    ['13/01/1990'],
    ['13-01-1990'],
    ['13.01.1990'],
    ['13 01 1990'],
    ['13 jan 1990'],
    ['13 janvier 1990'],
    ['13 Janvier 1990'],
    ['1990-01-13'],
    ['1990/01/13'],
    ['  13/1/1990 '],
  ])('« %s » = la date exacte du 13 janvier 1990', (saisie) => {
    expect(parseBirthDateSearch(saisie)).toEqual({ kind: 'exact', date: d(1990, 1, 13) });
  });

  it('comprend les mois en lettres avec accents et abréviations', () => {
    expect(parseBirthDateSearch('5 février 1985')).toEqual({ kind: 'exact', date: d(1985, 2, 5) });
    expect(parseBirthDateSearch('5 fev 1985')).toEqual({ kind: 'exact', date: d(1985, 2, 5) });
    expect(parseBirthDateSearch('12 août 2001')).toEqual({ kind: 'exact', date: d(2001, 8, 12) });
    expect(parseBirthDateSearch('3 déc. 1970')).toEqual({ kind: 'exact', date: d(1970, 12, 3) });
    expect(parseBirthDateSearch('1er mars 1999')).toEqual({ kind: 'exact', date: d(1999, 3, 1) });
  });

  it.each([['13/01'], ['13-01'], ['13 01'], ['13 jan'], ['13 janvier'], ['13 Janv.']])(
    '« %s » = le 13 janvier, toutes années (anniversaire)',
    (saisie) => {
      expect(parseBirthDateSearch(saisie)).toEqual({ kind: 'dayMonth', day: 13, month: 1 });
    },
  );

  it('accepte le 29 février sans année, mais pas le 30', () => {
    expect(parseBirthDateSearch('29/02')).toEqual({ kind: 'dayMonth', day: 29, month: 2 });
    expect(parseBirthDateSearch('30/02')).toBeNull();
  });

  it('une année seule couvre toute l\'année', () => {
    expect(parseBirthDateSearch('1990')).toEqual({ kind: 'range', from: d(1990, 1, 1), to: d(1991, 1, 1) });
  });

  it('mois + année couvre tout le mois (décembre bascule sur janvier suivant)', () => {
    expect(parseBirthDateSearch('01/1990')).toEqual({ kind: 'range', from: d(1990, 1, 1), to: d(1990, 2, 1) });
    expect(parseBirthDateSearch('jan 1990')).toEqual({ kind: 'range', from: d(1990, 1, 1), to: d(1990, 2, 1) });
    expect(parseBirthDateSearch('décembre 1990')).toEqual({ kind: 'range', from: d(1990, 12, 1), to: d(1991, 1, 1) });
  });

  it('refuse les dates impossibles', () => {
    expect(parseBirthDateSearch('31/02/1990')).toBeNull();
    expect(parseBirthDateSearch('29/02/1991')).toBeNull(); // 1991 non bissextile
    expect(parseBirthDateSearch('29/02/1992')).toEqual({ kind: 'exact', date: d(1992, 2, 29) });
    expect(parseBirthDateSearch('32/01/1990')).toBeNull();
    expect(parseBirthDateSearch('13/13/1990')).toBeNull();
    expect(parseBirthDateSearch('0/1/1990')).toBeNull();
  });

  it.each([[''], ['   '], ['karim'], ['karim benali'], ['21645123'], ['00012'], ['13'], ['1850'], ['2200'], ['jan'], ['13 1990'], ['13 14']])(
    '« %s » n\'est pas une date : la recherche normale (nom, GSM, dossier) reste inchangée',
    (saisie) => {
      expect(parseBirthDateSearch(saisie)).toBeNull();
    },
  );

  it('null / undefined sont ignorés', () => {
    expect(parseBirthDateSearch(undefined)).toBeNull();
    expect(parseBirthDateSearch(null)).toBeNull();
  });
});

describe('PatientsService.findAll — recherche par date de naissance', () => {
  function makeService(rawIds: { id: number }[] = []) {
    const prisma = {
      patient: {
        findMany: jest.fn(async () => []),
        count: jest.fn(async () => 0),
      },
      $queryRaw: jest.fn(async () => rawIds),
    } as any;
    const auditLog = { log: jest.fn() } as unknown as AuditLogService;
    return { service: new PatientsService(prisma, auditLog), prisma };
  }

  const whereOf = (prisma: any) => prisma.patient.findMany.mock.calls[0][0].where;

  it('date exacte : ajoute un filtre dateNaissance égal, toujours limité au cabinet', async () => {
    const { service, prisma } = makeService();
    await service.findAll(7, { search: '13/01/1990' } as any);
    const where = whereOf(prisma);
    expect(where.cabinetId).toBe(7);
    expect(where.OR).toContainEqual({ dateNaissance: d(1990, 1, 13) });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('année seule : filtre par intervalle', async () => {
    const { service, prisma } = makeService();
    await service.findAll(7, { search: '1990' } as any);
    expect(whereOf(prisma).OR).toContainEqual({ dateNaissance: { gte: d(1990, 1, 1), lt: d(1991, 1, 1) } });
  });

  it('jour + mois : récupère les identifiants du cabinet en SQL paramétré puis filtre dessus', async () => {
    const { service, prisma } = makeService([{ id: 5 }, { id: 9 }]);
    await service.findAll(7, { search: '13 jan' } as any);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = prisma.$queryRaw.mock.calls[0];
    expect(strings.join('?')).toContain('cabinet_id = ?');
    expect(values).toEqual([7, 1, 13]); // cabinetId, mois, jour — jamais concaténés dans le SQL
    expect(whereOf(prisma).OR).toContainEqual({ id: { in: [5, 9] } });
    expect(whereOf(prisma).cabinetId).toBe(7);
  });

  it('la recherche par nom reste inchangée (pas de requête SQL, pas de filtre date)', async () => {
    const { service, prisma } = makeService();
    await service.findAll(7, { search: 'karim benali' } as any);
    const where = whereOf(prisma);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(where.OR).toHaveLength(3); // nom/prénom, gsm, dossier
  });

  it('sans recherche : aucun filtre date', async () => {
    const { service, prisma } = makeService();
    await service.findAll(7, {} as any);
    expect(whereOf(prisma)).toEqual({ cabinetId: 7 });
  });
});
