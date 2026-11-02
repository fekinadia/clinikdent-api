import { HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PasDeFichierEnEssaiGuard } from '../auth/pas-de-fichier-en-essai.guard';
import { essaiTermine } from '../billing/plan-limits';
import { EssaiService } from './essai.service';

const FORMULAIRE = { prenom: ' Nour ', nom: 'Haddad', nomCabinet: ' Cabinet Test ', gsm: '22 000 800' };
const MAINTENANT = new Date('2026-11-02T10:00:00Z');

function makeService() {
  let idPatient = 100;
  let idActe = 200;
  const tx = {
    cabinet: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 7, ...data })),
      update: jest.fn().mockResolvedValue({}),
    },
    user: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 9, ...data })) },
    patient: { create: jest.fn().mockImplementation(() => Promise.resolve({ id: ++idPatient })) },
    appointment: { createMany: jest.fn().mockResolvedValue({}) },
    treatment: {
      create: jest.fn().mockImplementation(() => Promise.resolve({ acts: [{ id: ++idActe }] })),
    },
    payment: { createMany: jest.fn().mockResolvedValue({}) },
    toothState: { createMany: jest.fn().mockResolvedValue({}) },
    demandeRdv: { createMany: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    cabinet: { count: jest.fn().mockResolvedValue(0) },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
  } as any;
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const authService = {
    signToken: jest.fn().mockResolvedValue({ accessToken: 'jeton', user: { id: 9 } }),
  } as any;
  return { service: new EssaiService(prisma, authService, auditLog), prisma, tx, auditLog, authService };
}

describe('EssaiService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: MAINTENANT, doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('crée un cabinet de 7 jours et ouvre la session', async () => {
    const { service, tx, authService, auditLog } = makeService();
    const resultat = await service.creer(FORMULAIRE, '41.0.0.1');

    expect(tx.cabinet.create.mock.calls[0][0].data).toMatchObject({
      nom: 'Cabinet Test',
      telephone: '+21622000800',
      estDemo: true,
      demoExpiresAt: new Date('2026-11-09T10:00:00Z'),
      reservationActive: true,
      automationSettings: { create: { rappelsActifs: false, noShowActif: false, recallActif: false } },
    });
    expect(tx.cabinet.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { reservationSlug: 'essai-7' } });
    expect(tx.user.create.mock.calls[0][0].data).toMatchObject({
      prenom: 'Nour',
      nom: 'Haddad',
      telephone: '21622000800',
      cabinetId: 7,
      role: 'admin',
    });
    expect(resultat).toMatchObject({ accessToken: 'jeton', expireLe: new Date('2026-11-09T10:00:00Z') });
    expect(resultat.email).toMatch(/^essai-[0-9a-f]{10}@essai\.invalid$/);
    expect(authService.signToken).toHaveBeenCalledWith(9, resultat.email, 7, 'admin');
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'essai.creer', cabinetId: 7, ipAddress: '41.0.0.1' }),
    );
  });

  it('ne garde que le mot de passe chiffré, et le donne une fois au médecin', async () => {
    const { service, tx } = makeService();
    const { motDePasse } = await service.creer(FORMULAIRE);
    const { passwordHash } = tx.user.create.mock.calls[0][0].data;

    expect(passwordHash).not.toBe(motDePasse);
    await expect(bcrypt.compare(motDePasse, passwordHash)).resolves.toBe(true);
  });

  it('remplit le cabinet, avec le numéro du médecin sur chaque patient fictif', async () => {
    const { service, tx } = makeService();
    await service.creer(FORMULAIRE);

    expect(tx.patient.create).toHaveBeenCalledTimes(6);
    for (const [{ data }] of tx.patient.create.mock.calls) {
      expect(data).toMatchObject({ cabinetId: 7, gsm: '22000800' });
    }
    expect(tx.appointment.createMany.mock.calls[0][0].data).toHaveLength(9);
    expect(tx.appointment.createMany.mock.calls[0][0].data[0]).toMatchObject({
      dateDebut: new Date('2026-11-02T08:00:00Z'),
      medecinId: 9,
    });
    expect(tx.treatment.create).toHaveBeenCalledTimes(4);
    expect(tx.payment.createMany.mock.calls[0][0].data).toHaveLength(9);
    expect(tx.toothState.createMany).toHaveBeenCalledTimes(1);
    for (const demande of tx.demandeRdv.createMany.mock.calls[0][0].data) {
      expect(demande.gsm).toBe('21622000800');
    }
  });

  it('refuse un deuxième essai en cours pour le même numéro', async () => {
    const { service, prisma } = makeService();
    prisma.user.findFirst.mockResolvedValueOnce({ id: 3 });

    await expect(service.creer(FORMULAIRE)).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({
      telephone: '21622000800',
      cabinet: { estDemo: true, demoExpiresAt: { gt: MAINTENANT } },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('s’arrête quand trop d’essais sont en cours', async () => {
    const { service, prisma } = makeService();
    prisma.cabinet.count.mockResolvedValueOnce(200);

    await expect(service.creer(FORMULAIRE)).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuse un numéro trop court et le champ invisible rempli', async () => {
    const { service, prisma } = makeService();

    await expect(service.creer({ ...FORMULAIRE, gsm: '1234567' })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    await expect(service.creer({ ...FORMULAIRE, siteWeb: 'spam.example' })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('essaiTermine', () => {
  const passe = new Date(Date.now() - 1000);
  const futur = new Date(Date.now() + 60_000);

  it('vrai seulement pour un essai dont la date est passée', () => {
    expect(essaiTermine({ estDemo: true, demoExpiresAt: passe })).toBe(true);
    expect(essaiTermine({ estDemo: true, demoExpiresAt: futur })).toBe(false);
  });

  it('ne touche jamais un vrai cabinet', () => {
    expect(essaiTermine({ estDemo: false, demoExpiresAt: passe })).toBe(false);
    expect(essaiTermine({ estDemo: true, demoExpiresAt: null })).toBe(false);
    expect(essaiTermine(null)).toBe(false);
  });
});

describe('PasDeFichierEnEssaiGuard', () => {
  const contexte = {
    switchToHttp: () => ({ getRequest: () => ({ user: { cabinetId: 7 } }) }),
  } as any;

  it('refuse un fichier pendant un essai', async () => {
    const prisma = { cabinet: { findUnique: jest.fn().mockResolvedValue({ estDemo: true }) } } as any;
    await expect(new PasDeFichierEnEssaiGuard(prisma).canActivate(contexte)).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
    });
  });

  it('laisse passer un vrai cabinet', async () => {
    const prisma = { cabinet: { findUnique: jest.fn().mockResolvedValue({ estDemo: false }) } } as any;
    await expect(new PasDeFichierEnEssaiGuard(prisma).canActivate(contexte)).resolves.toBe(true);
  });
});
