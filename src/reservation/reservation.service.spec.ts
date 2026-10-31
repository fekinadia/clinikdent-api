import { HttpStatus } from '@nestjs/common';
import { instantTunis } from './creneaux';
import { ReservationService } from './reservation.service';

const CABINET_A = 1;
const CABINET_B = 2;
const SLUG = 'cabinet-test';
const LUNDI = '2026-11-02';

const CABINET = {
  id: CABINET_A,
  nom: 'Cabinet Test',
  adresse: '1 rue de Test',
  telephone: '71000000',
  reservationActive: true,
  reservationHoraires: { '1': [{ debut: '09:00', fin: '10:00' }] },
  reservationDureeCreneau: 30,
};

const DEMANDE = {
  id: 7,
  cabinetId: CABINET_A,
  prenom: 'Amira',
  nom: 'Test',
  gsm: '21622000800',
  motif: 'Détartrage',
  langue: 'ar',
  dateDebut: instantTunis(LUNDI, '09:00'),
  dateFin: instantTunis(LUNDI, '09:30'),
  statut: 'en_attente',
};

const ADMIN = { userId: 10, email: 'a@test.tn', cabinetId: CABINET_A, role: 'admin' as const };
const RECEPTION = { userId: 11, email: 'r@test.tn', cabinetId: CABINET_A, role: 'reception' as const };
const ACTEUR = { userId: 10, ipAddress: '1.2.3.4' };

const FORMULAIRE = {
  prenom: ' Amira ',
  nom: 'Test',
  gsm: '22 000 800',
  motif: 'Détartrage',
  date: LUNDI,
  heure: '09:00',
  langue: 'ar',
};

function makeService() {
  const prisma = {
    cabinet: {
      findUnique: jest.fn().mockResolvedValue(CABINET),
      update: jest.fn().mockResolvedValue({}),
    },
    appointment: { findMany: jest.fn().mockResolvedValue([]) },
    calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
    patient: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    demandeRdv: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(DEMANDE),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as any;
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const patientsService = { create: jest.fn().mockResolvedValue({ id: 50 }) } as any;
  const appointmentsService = {
    findConflict: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 80 }),
  } as any;
  const service = new ReservationService(prisma, auditLog, patientsService, appointmentsService);
  return { service, prisma, auditLog, patientsService, appointmentsService };
}

describe('ReservationService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-30T10:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('page publique', () => {
    it("répond « introuvable » si le lien n'existe pas ou si la réservation est désactivée", async () => {
      const { service, prisma } = makeService();

      prisma.cabinet.findUnique.mockResolvedValueOnce(null);
      await expect(service.infosPubliques(SLUG)).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });

      prisma.cabinet.findUnique.mockResolvedValueOnce({ ...CABINET, reservationActive: false });
      await expect(service.creneaux(SLUG, LUNDI)).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('ne renvoie que les infos du cabinet', async () => {
      const { service } = makeService();
      await expect(service.infosPubliques(SLUG)).resolves.toEqual({
        nom: 'Cabinet Test',
        adresse: '1 rue de Test',
        telephone: '71000000',
        joursOuverts: [1],
        aujourdhui: '2026-10-30',
        dernierJour: '2026-11-29',
      });
    });

    it('propose les créneaux libres, sans aucune donnée de patient', async () => {
      const { service } = makeService();
      await expect(service.creneaux(SLUG, LUNDI)).resolves.toEqual({
        date: LUNDI,
        heures: ['09:00', '09:30'],
      });
    });

    it('retire les créneaux pris par un rendez-vous, un blocage ou une demande en attente', async () => {
      const { service, prisma } = makeService();
      const periode = (debut: string, fin: string) => ({
        dateDebut: instantTunis(LUNDI, debut),
        dateFin: instantTunis(LUNDI, fin),
      });

      prisma.appointment.findMany.mockResolvedValueOnce([periode('09:00', '09:30')]);
      await expect(service.creneaux(SLUG, LUNDI)).resolves.toMatchObject({ heures: ['09:30'] });

      prisma.calendarEvent.findMany.mockResolvedValueOnce([periode('09:30', '10:00')]);
      await expect(service.creneaux(SLUG, LUNDI)).resolves.toMatchObject({ heures: ['09:00'] });

      prisma.demandeRdv.findMany.mockResolvedValueOnce([periode('09:00', '10:00')]);
      await expect(service.creneaux(SLUG, LUNDI)).resolves.toMatchObject({ heures: [] });

      expect(prisma.appointment.findMany.mock.calls[0][0].where).toMatchObject({
        cabinetId: CABINET_A,
        statut: { not: 'annule' },
      });
      expect(prisma.demandeRdv.findMany.mock.calls[0][0].where).toMatchObject({
        cabinetId: CABINET_A,
        statut: 'en_attente',
      });
    });

    it.each(['2026-10-29', '2026-12-01', '2026-02-31'])('ne propose rien pour le %s', async (date) => {
      const { service, prisma } = makeService();
      await expect(service.creneaux(SLUG, date)).resolves.toMatchObject({ heures: [] });
      expect(prisma.appointment.findMany).not.toHaveBeenCalled();
    });
  });

  describe('creerDemande', () => {
    it('enregistre la demande avec le numéro normalisé, sans toucher aux patients', async () => {
      const { service, prisma, patientsService } = makeService();
      await expect(service.creerDemande(SLUG, FORMULAIRE)).resolves.toEqual({ ok: true });

      expect(prisma.demandeRdv.create.mock.calls[0][0].data).toEqual({
        cabinetId: CABINET_A,
        prenom: 'Amira',
        nom: 'Test',
        gsm: '21622000800',
        motif: 'Détartrage',
        langue: 'ar',
        dateDebut: new Date('2026-11-02T08:00:00.000Z'),
        dateFin: new Date('2026-11-02T08:30:00.000Z'),
      });
      expect(patientsService.create).not.toHaveBeenCalled();
    });

    it('ne garde rien si le champ invisible est rempli, avec la même réponse', async () => {
      const { service, prisma } = makeService();
      await expect(service.creerDemande(SLUG, { ...FORMULAIRE, siteWeb: 'spam.example' })).resolves.toEqual({
        ok: true,
      });
      expect(prisma.demandeRdv.create).not.toHaveBeenCalled();
    });

    it("refuse une heure qui n'est pas proposée", async () => {
      const { service, prisma } = makeService();
      await expect(service.creerDemande(SLUG, { ...FORMULAIRE, heure: '09:15' })).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
      expect(prisma.demandeRdv.create).not.toHaveBeenCalled();
    });

    it("signale un créneau pris à l'instant par un autre patient", async () => {
      const { service, prisma } = makeService();
      prisma.demandeRdv.create.mockRejectedValueOnce({ code: 'P2002' });
      await expect(service.creerDemande(SLUG, FORMULAIRE)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
    });

    it('refuse un numéro trop court', async () => {
      const { service, prisma } = makeService();
      await expect(service.creerDemande(SLUG, { ...FORMULAIRE, gsm: '1234567' })).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
      expect(prisma.demandeRdv.create).not.toHaveBeenCalled();
    });

    it('limite les demandes en attente par numéro et par cabinet', async () => {
      const { service, prisma } = makeService();

      prisma.demandeRdv.count.mockResolvedValueOnce(3).mockResolvedValueOnce(3);
      await expect(service.creerDemande(SLUG, FORMULAIRE)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });

      prisma.demandeRdv.count.mockResolvedValueOnce(0).mockResolvedValueOnce(100);
      await expect(service.creerDemande(SLUG, FORMULAIRE)).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
      expect(prisma.demandeRdv.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmer', () => {
    it('crée le dossier puis le rendez-vous, et relie la demande', async () => {
      const { service, prisma, patientsService, appointmentsService, auditLog } = makeService();
      await service.confirmer(ADMIN, 7, {}, ACTEUR);

      expect(patientsService.create).toHaveBeenCalledWith(CABINET_A, 10, {
        nom: 'Test',
        prenom: 'Amira',
        gsm: '22000800',
        langueMessages: 'ar',
        estProspect: true,
      });
      expect(appointmentsService.create).toHaveBeenCalledWith(CABINET_A, 10, {
        patientId: 50,
        medecinId: 10,
        dateDebut: '2026-11-02T08:00:00.000Z',
        dateFin: '2026-11-02T08:30:00.000Z',
        observation: 'Réservation en ligne : Détartrage',
      });
      expect(prisma.demandeRdv.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: 7, cabinetId: CABINET_A, statut: 'en_attente' },
        data: { statut: 'confirmee', traiteePar: 10 },
      });
      expect(prisma.demandeRdv.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { appointmentId: 80 } });
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'reservation.confirmer', entityId: 7 }),
      );
    });

    it('garde un numéro étranger entier dans le dossier', async () => {
      const { service, prisma, patientsService } = makeService();
      prisma.demandeRdv.findUnique.mockResolvedValueOnce({ ...DEMANDE, gsm: '33612345678' });
      await service.confirmer(ADMIN, 7, {}, ACTEUR);

      expect(patientsService.create.mock.calls[0][2].gsm).toBe('33612345678');
    });

    it('utilise le dossier choisi sans en créer un autre', async () => {
      const { service, patientsService, appointmentsService } = makeService();
      await service.confirmer(ADMIN, 7, { patientId: 33 }, ACTEUR);

      expect(patientsService.create).not.toHaveBeenCalled();
      expect(appointmentsService.create.mock.calls[0][2].patientId).toBe(33);
    });

    it('attribue le rendez-vous au seul praticien quand la réception confirme', async () => {
      const { service, prisma, appointmentsService } = makeService();
      prisma.user.findMany.mockResolvedValueOnce([{ id: 10 }]);
      await service.confirmer(RECEPTION, 7, {}, ACTEUR);

      expect(appointmentsService.create.mock.calls[0][2].medecinId).toBe(10);
    });

    it('ne choisit pas de praticien quand le cabinet en a plusieurs', async () => {
      const { service, prisma, appointmentsService } = makeService();
      prisma.user.findMany.mockResolvedValueOnce([{ id: 10 }, { id: 12 }]);
      await service.confirmer(RECEPTION, 7, {}, ACTEUR);

      expect(appointmentsService.findConflict).not.toHaveBeenCalled();
      expect(appointmentsService.create.mock.calls[0][2].medecinId).toBeUndefined();
    });

    it("ne touche à rien si le praticien a déjà un rendez-vous à cette heure", async () => {
      const { service, prisma, patientsService, appointmentsService } = makeService();
      appointmentsService.findConflict.mockResolvedValueOnce({ patient: { prenom: 'Sami', nom: 'Test' } });

      await expect(service.confirmer(ADMIN, 7, {}, ACTEUR)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
      expect(prisma.demandeRdv.updateMany).not.toHaveBeenCalled();
      expect(patientsService.create).not.toHaveBeenCalled();
    });

    it('ne crée pas deux rendez-vous sur un double clic', async () => {
      const { service, prisma, patientsService, appointmentsService } = makeService();
      prisma.demandeRdv.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.confirmer(ADMIN, 7, {}, ACTEUR)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
      expect(patientsService.create).not.toHaveBeenCalled();
      expect(appointmentsService.create).not.toHaveBeenCalled();
    });

    it('remet la demande en attente si le rendez-vous échoue', async () => {
      const { service, prisma, appointmentsService } = makeService();
      appointmentsService.create.mockRejectedValueOnce(new Error('échec'));

      await expect(service.confirmer(ADMIN, 7, {}, ACTEUR)).rejects.toThrow('échec');
      expect(prisma.demandeRdv.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { statut: 'en_attente', traiteeAt: null, traiteePar: null },
      });
    });

    it("refuse la demande d'un autre cabinet", async () => {
      const { service, prisma } = makeService();
      prisma.demandeRdv.findUnique.mockResolvedValueOnce({ ...DEMANDE, cabinetId: CABINET_B });

      await expect(service.confirmer(ADMIN, 7, {}, ACTEUR)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
      expect(prisma.demandeRdv.updateMany).not.toHaveBeenCalled();
    });

    it('refuse une demande dont la date est passée', async () => {
      const { service, prisma } = makeService();
      prisma.demandeRdv.findUnique.mockResolvedValueOnce({
        ...DEMANDE,
        dateDebut: new Date('2026-10-29T08:00:00Z'),
      });

      await expect(service.confirmer(ADMIN, 7, {}, ACTEUR)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });
  });

  describe('refuser', () => {
    it('libère le créneau en marquant la demande refusée', async () => {
      const { service, prisma, auditLog } = makeService();
      await expect(service.refuser(CABINET_A, 7, ACTEUR)).resolves.toEqual({ ok: true });

      expect(prisma.demandeRdv.updateMany.mock.calls[0][0].data).toMatchObject({ statut: 'refusee' });
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'reservation.refuser' }));
    });

    it('refuse une demande déjà traitée', async () => {
      const { service, prisma } = makeService();
      prisma.demandeRdv.findUnique.mockResolvedValueOnce({ ...DEMANDE, statut: 'confirmee' });

      await expect(service.refuser(CABINET_A, 7, ACTEUR)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
    });
  });

  describe('demandes', () => {
    it('retrouve les dossiers du même numéro, quelle que soit son écriture', async () => {
      const { service, prisma } = makeService();
      prisma.demandeRdv.findMany.mockResolvedValueOnce([DEMANDE]);
      prisma.patient.findMany.mockResolvedValueOnce([
        { id: 1, nom: 'Test', prenom: 'Mère', numeroDossier: '00001', gsm: '22 000 800' },
        { id: 2, nom: 'Test', prenom: 'Fils', numeroDossier: '00002', gsm: '+216 22000800' },
        { id: 3, nom: 'Autre', prenom: 'Sami', numeroDossier: '00003', gsm: '55111222' },
      ]);

      const [demande] = await service.demandes(CABINET_A);

      expect(demande.patientsTrouves.map((p) => p.id)).toEqual([1, 2]);
      expect(prisma.patient.findMany.mock.calls[0][0].where.cabinetId).toBe(CABINET_A);
    });

    it('ne lit pas les patients quand il n’y a aucune demande', async () => {
      const { service, prisma } = makeService();
      await expect(service.demandes(CABINET_A)).resolves.toEqual([]);
      expect(prisma.patient.findMany).not.toHaveBeenCalled();
    });
  });

  describe('réglages', () => {
    const REGLAGES = {
      active: true,
      slug: SLUG,
      horaires: { '1': [{ debut: '09:00', fin: '13:00' }] },
      dureeCreneau: 30,
    };

    it('propose une adresse tirée du nom, et une autre si elle est prise', async () => {
      const { service, prisma } = makeService();
      const cabinet = {
        nom: 'Cabinet Hélène',
        reservationActive: false,
        reservationSlug: null,
        reservationHoraires: null,
        reservationDureeCreneau: 30,
      };

      prisma.cabinet.findUnique.mockResolvedValueOnce(cabinet).mockResolvedValueOnce(null);
      await expect(service.reglages(CABINET_A)).resolves.toMatchObject({ slug: 'cabinet-helene', active: false });

      prisma.cabinet.findUnique.mockResolvedValueOnce(cabinet).mockResolvedValueOnce({ id: 9 });
      await expect(service.reglages(CABINET_A)).resolves.toMatchObject({ slug: 'cabinet-helene-1' });
    });

    it("refuse d'activer sans aucune plage horaire", async () => {
      const { service, prisma } = makeService();
      await expect(
        service.modifierReglages(CABINET_A, { ...REGLAGES, horaires: {} }, ACTEUR),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
      expect(prisma.cabinet.update).not.toHaveBeenCalled();
    });

    it('signale une adresse déjà utilisée par un autre cabinet', async () => {
      const { service, prisma } = makeService();
      prisma.cabinet.update.mockRejectedValueOnce({ code: 'P2002' });

      await expect(service.modifierReglages(CABINET_A, REGLAGES, ACTEUR)).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
      });
    });

    it('enregistre les réglages et les trace', async () => {
      const { service, prisma, auditLog } = makeService();
      await service.modifierReglages(CABINET_A, REGLAGES, ACTEUR);

      expect(prisma.cabinet.update.mock.calls[0][0]).toEqual({
        where: { id: CABINET_A },
        data: {
          reservationActive: true,
          reservationSlug: SLUG,
          reservationHoraires: REGLAGES.horaires,
          reservationDureeCreneau: 30,
        },
      });
      expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'reservation.reglages' }));
    });

    it("enregistre l'adresse et le téléphone, et vide ceux laissés blancs", async () => {
      const { service, prisma } = makeService();
      await service.modifierReglages(
        CABINET_A,
        { ...REGLAGES, adresse: ' 12 rue de Test ', telephone: '   ' },
        ACTEUR,
      );

      expect(prisma.cabinet.update.mock.calls[0][0].data).toMatchObject({
        adresse: '12 rue de Test',
        telephone: null,
      });
    });

    it("ne touche ni à l'adresse ni au téléphone s'ils ne sont pas envoyés", async () => {
      const { service, prisma } = makeService();
      await service.modifierReglages(CABINET_A, REGLAGES, ACTEUR);

      expect(prisma.cabinet.update.mock.calls[0][0].data).not.toHaveProperty('adresse');
      expect(prisma.cabinet.update.mock.calls[0][0].data).not.toHaveProperty('telephone');
    });

    it("renvoie l'adresse et le téléphone du cabinet, vides s'ils manquent", async () => {
      const { service, prisma } = makeService();
      prisma.cabinet.findUnique.mockResolvedValueOnce({
        nom: 'Cabinet',
        adresse: null,
        telephone: '71000000',
        reservationActive: true,
        reservationSlug: SLUG,
        reservationHoraires: null,
        reservationDureeCreneau: 30,
      });

      await expect(service.reglages(CABINET_A)).resolves.toMatchObject({ adresse: '', telephone: '71000000' });
    });
  });

  describe('aPrevenir', () => {
    it('liste les réponses récentes du cabinet, pour des rendez-vous à venir', async () => {
      const { service, prisma } = makeService();
      await service.aPrevenir(CABINET_A);

      expect(prisma.demandeRdv.findMany.mock.calls[0][0]).toEqual({
        where: {
          cabinetId: CABINET_A,
          statut: { in: ['confirmee', 'refusee'] },
          traiteeAt: { gte: new Date('2026-10-27T10:00:00Z') },
          dateDebut: { gt: new Date('2026-10-30T10:00:00Z') },
        },
        orderBy: { traiteeAt: 'asc' },
      });
    });
  });
});
