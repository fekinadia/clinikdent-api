import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExpensesService } from './expenses.service';

// Pièce jointe sur les dépenses (facture, reçu — 2026-10-09).

const CABINET_A = 1;
const CABINET_B = 2;

function makeService(expense: any) {
  const prisma = {
    expense: {
      findUnique: jest.fn().mockResolvedValue(expense),
      update: jest.fn(async ({ data }: any) => ({ ...expense, ...data })),
      delete: jest.fn().mockResolvedValue(expense),
    },
  } as any;
  const auditLog = { log: jest.fn() } as any;
  const config = {
    get: jest.fn((k: string) =>
      ({ SUPABASE_URL: 'https://sb.example', SUPABASE_SERVICE_ROLE_KEY: 'svc' } as any)[k],
    ),
  } as any;
  return { service: new ExpensesService(prisma, auditLog, config), prisma, auditLog };
}

const baseExpense = (extra: any = {}) => ({
  id: 5,
  cabinetId: CABINET_A,
  categorie: 'Matériel',
  libelle: 'Fauteuil',
  montant: 1200,
  dateDepense: new Date('2026-10-09'),
  fournisseur: null,
  justificatif: null,
  pieceJointeChemin: null,
  pieceJointeNom: null,
  pieceJointeMime: null,
  createdById: 3,
  createdAt: new Date(),
  ...extra,
});

const file = (size = 1000) =>
  ({ originalname: 'facture.PDF', mimetype: 'application/pdf', size, buffer: Buffer.from('x') }) as any;

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn(async (_url: string, init: any) => ({
    ok: true,
    json: async () => ({ signedURL: '/object/sign/patient-files/abc?token=t' }),
    init,
  }));
  (global as any).fetch = fetchMock;
});

describe('ExpensesService — pièce jointe', () => {
  it('envoie le fichier dans le dossier du cabinet et enregistre nom + type, sans exposer le chemin', async () => {
    const { service, prisma, auditLog } = makeService(baseExpense());

    const res: any = await service.uploadPieceJointe(CABINET_A, 5, file(), { userId: 3 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/sb\.example\/storage\/v1\/object\/patient-files\/cabinet-1\/depenses\/5\/.+\.pdf$/);
    expect(init.method).toBe('POST');
    expect(prisma.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({ pieceJointeNom: 'facture.PDF', pieceJointeMime: 'application/pdf' }),
      }),
    );
    expect(res.aPieceJointe).toBe(true);
    expect(res.pieceJointeChemin).toBeUndefined();
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'expense.attachment_uploaded' }));
  });

  it("remplace l'ancienne pièce jointe et la retire du stockage", async () => {
    const { service } = makeService(baseExpense({ pieceJointeChemin: 'cabinet-1/depenses/5/old.jpg' }));

    await service.uploadPieceJointe(CABINET_A, 5, file(), { userId: 3 });

    const deleteCall = fetchMock.mock.calls.find(([, init]) => init.method === 'DELETE');
    expect(JSON.parse(deleteCall![1].body)).toEqual({ prefixes: ['cabinet-1/depenses/5/old.jpg'] });
  });

  it('refuse un fichier de plus de 15 Mo', async () => {
    const { service } = makeService(baseExpense());
    await expect(
      service.uploadPieceJointe(CABINET_A, 5, file(16 * 1024 * 1024), { userId: 3 }),
    ).rejects.toThrow(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuse (404) la dépense d'un autre cabinet", async () => {
    const { service } = makeService(baseExpense({ cabinetId: CABINET_B }));
    await expect(service.uploadPieceJointe(CABINET_A, 5, file(), { userId: 3 })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.getPieceJointeUrl(CABINET_A, 5)).rejects.toThrow(NotFoundException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renvoie un lien signé temporaire', async () => {
    const { service } = makeService(
      baseExpense({ pieceJointeChemin: 'cabinet-1/depenses/5/a.pdf', pieceJointeNom: 'facture.pdf', pieceJointeMime: 'application/pdf' }),
    );
    const res = await service.getPieceJointeUrl(CABINET_A, 5);
    expect(res).toEqual({
      url: 'https://sb.example/storage/v1/object/sign/patient-files/abc?token=t',
      nom: 'facture.pdf',
      mime: 'application/pdf',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ expiresIn: 300 });
  });

  it('404 si la dépense n’a pas de pièce jointe', async () => {
    const { service } = makeService(baseExpense());
    await expect(service.getPieceJointeUrl(CABINET_A, 5)).rejects.toThrow(NotFoundException);
  });

  it('retire la pièce jointe (base + stockage)', async () => {
    const { service, prisma } = makeService(baseExpense({ pieceJointeChemin: 'cabinet-1/depenses/5/a.pdf' }));
    const res: any = await service.deletePieceJointe(CABINET_A, 5, { userId: 3 });
    expect(prisma.expense.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { pieceJointeChemin: null, pieceJointeNom: null, pieceJointeMime: null },
    });
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(res.aPieceJointe).toBe(false);
  });

  it('supprimer la dépense supprime aussi son fichier du stockage', async () => {
    const { service, prisma } = makeService(baseExpense({ pieceJointeChemin: 'cabinet-1/depenses/5/a.pdf' }));
    await service.delete(CABINET_A, 5, { userId: 3 });
    expect(prisma.expense.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ prefixes: ['cabinet-1/depenses/5/a.pdf'] });
  });
});
