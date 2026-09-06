import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateActDto } from './act.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateActDto, payload);
  return validate(dto);
}

describe('CreateActDto — validation', () => {
  const valid = { libelle: 'Détartrage', tarifBase: 90 };

  it('accepte un payload minimal valide', async () => {
    const errors = await errorsFor(valid);
    expect(errors).toHaveLength(0);
  });

  it('rejette un libellé vide', async () => {
    const errors = await errorsFor({ ...valid, libelle: '' });
    expect(errors.some((e) => e.property === 'libelle')).toBe(true);
  });

  it('rejette un libellé manquant', async () => {
    const { libelle, ...rest } = valid;
    const errors = await errorsFor(rest);
    expect(errors.some((e) => e.property === 'libelle')).toBe(true);
  });

  it('rejette un tarif négatif', async () => {
    const errors = await errorsFor({ ...valid, tarifBase: -10 });
    expect(errors.some((e) => e.property === 'tarifBase')).toBe(true);
  });

  it('rejette une durée négative ou nulle', async () => {
    const errors = await errorsFor({ ...valid, dureeMinutes: 0 });
    expect(errors.some((e) => e.property === 'dureeMinutes')).toBe(true);
  });

  it('rejette une durée non entière', async () => {
    const errors = await errorsFor({ ...valid, dureeMinutes: 12.5 });
    expect(errors.some((e) => e.property === 'dureeMinutes')).toBe(true);
  });

  it('rejette une durée déraisonnablement longue', async () => {
    const errors = await errorsFor({ ...valid, dureeMinutes: 10000 });
    expect(errors.some((e) => e.property === 'dureeMinutes')).toBe(true);
  });

  it('accepte une durée valide', async () => {
    const errors = await errorsFor({ ...valid, dureeMinutes: 30 });
    expect(errors).toHaveLength(0);
  });
});
