import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateAutomationSettingsDto } from './automation-settings.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateAutomationSettingsDto, payload);
  return validate(dto);
}

describe('UpdateAutomationSettingsDto.delaiNoShowHeures — validation (STEP 4)', () => {
  it('accepte un payload vide (tous les champs sont optionnels)', async () => {
    const errors = await errorsFor({});
    expect(errors).toHaveLength(0);
  });

  it('accepte la valeur par défaut documentée (24)', async () => {
    const errors = await errorsFor({ delaiNoShowHeures: 24 });
    expect(errors).toHaveLength(0);
  });

  it('rejette 0 (délai nul)', async () => {
    const errors = await errorsFor({ delaiNoShowHeures: 0 });
    expect(errors.some((e) => e.property === 'delaiNoShowHeures')).toBe(true);
  });

  it('rejette une valeur négative', async () => {
    const errors = await errorsFor({ delaiNoShowHeures: -5 });
    expect(errors.some((e) => e.property === 'delaiNoShowHeures')).toBe(true);
  });

  it('rejette une valeur non entière', async () => {
    const errors = await errorsFor({ delaiNoShowHeures: 12.5 });
    expect(errors.some((e) => e.property === 'delaiNoShowHeures')).toBe(true);
  });

  it('rejette une valeur au-delà de la borne supérieure (720h / 30 jours)', async () => {
    const errors = await errorsFor({ delaiNoShowHeures: 721 });
    expect(errors.some((e) => e.property === 'delaiNoShowHeures')).toBe(true);
  });

  it('accepte la borne supérieure exacte (720)', async () => {
    const errors = await errorsFor({ delaiNoShowHeures: 720 });
    expect(errors).toHaveLength(0);
  });

  it('accepte la borne inférieure exacte (1)', async () => {
    const errors = await errorsFor({ delaiNoShowHeures: 1 });
    expect(errors).toHaveLength(0);
  });
});
