import {
  ajouterJours,
  dateTunis,
  estDateValide,
  heuresDuJour,
  heuresLibres,
  instantTunis,
  normaliserGsm,
  slugDepuisNom,
  verifierHoraires,
} from './creneaux';

const LUNDI = '2026-11-02';
const DIMANCHE = '2026-11-01';
const horaires = {
  '1': [
    { debut: '09:00', fin: '13:00' },
    { debut: '15:00', fin: '16:00' },
  ],
};

describe('heuresDuJour', () => {
  it('découpe chaque plage selon la durée du créneau', () => {
    expect(heuresDuJour(horaires, 30, LUNDI)).toEqual([
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '15:00', '15:30',
    ]);
  });

  it('ne propose pas un créneau qui dépasserait la fin de la plage', () => {
    expect(heuresDuJour({ '1': [{ debut: '09:00', fin: '10:00' }] }, 45, LUNDI)).toEqual(['09:00']);
  });

  it("ne propose rien un jour de fermeture", () => {
    expect(heuresDuJour(horaires, 30, DIMANCHE)).toEqual([]);
  });
});

describe('heure de Tunis', () => {
  it('convertit en UTC avec le décalage de +1 h, sans heure d’été', () => {
    expect(instantTunis(LUNDI, '09:00').toISOString()).toBe('2026-11-02T08:00:00.000Z');
    expect(instantTunis('2026-07-15', '09:00').toISOString()).toBe('2026-07-15T08:00:00.000Z');
  });

  it('change de jour à minuit à Tunis, pas à minuit UTC', () => {
    expect(dateTunis(new Date('2026-11-01T22:59:00Z'))).toBe('2026-11-01');
    expect(dateTunis(new Date('2026-11-01T23:00:00Z'))).toBe('2026-11-02');
  });

  it('ajoute des jours en passant les fins de mois', () => {
    expect(ajouterJours('2026-10-30', 30)).toBe('2026-11-29');
  });
});

describe('heuresLibres', () => {
  const maintenant = new Date('2026-10-30T10:00:00Z');
  const periode = (debut: string, fin: string) => ({
    dateDebut: instantTunis(LUNDI, debut),
    dateFin: instantTunis(LUNDI, fin),
  });

  it('retire les heures qui chevauchent une période occupée, pas les heures voisines', () => {
    const heures = ['09:00', '09:30', '10:00', '10:30'];
    expect(heuresLibres(heures, LUNDI, 30, [periode('09:30', '10:15')], maintenant)).toEqual([
      '09:00',
      '10:30',
    ]);
  });

  it('retire aussi un créneau recouvert par un rendez-vous plus long', () => {
    const heures = ['09:00', '09:30', '10:00'];
    expect(heuresLibres(heures, LUNDI, 30, [periode('08:00', '11:00')], maintenant)).toEqual([]);
  });

  it('laisse au moins 2 heures au cabinet', () => {
    const aujourdhui = '2026-10-30';
    // Il est 11:00 à Tunis : le premier créneau possible est 13:00.
    expect(heuresLibres(['12:30', '13:00', '13:30'], aujourdhui, 30, [], maintenant)).toEqual([
      '13:00',
      '13:30',
    ]);
  });
});

describe('estDateValide', () => {
  it('refuse les dates impossibles et les formats inattendus', () => {
    expect(estDateValide('2026-11-02')).toBe(true);
    expect(estDateValide('2026-02-31')).toBe(false);
    expect(estDateValide('2026-13-01')).toBe(false);
    expect(estDateValide('demain')).toBe(false);
  });
});

describe('verifierHoraires', () => {
  it('range les plages et retire les jours vides', () => {
    expect(
      verifierHoraires({
        '1': [
          { debut: '15:00', fin: '18:00' },
          { debut: '09:00', fin: '13:00' },
        ],
        '2': [],
      }),
    ).toEqual({
      '1': [
        { debut: '09:00', fin: '13:00' },
        { debut: '15:00', fin: '18:00' },
      ],
    });
  });

  it.each([
    ['un jour inconnu', { '7': [] }],
    ['une liste absente', { '1': 'matin' }],
    ['une plage mal écrite', { '1': [{ debut: '9h', fin: '13:00' }] }],
    ['une plage sans champs', { '1': [null] }],
    ['une fin avant le début', { '1': [{ debut: '13:00', fin: '09:00' }] }],
    ['des plages qui se chevauchent', {
      '1': [
        { debut: '09:00', fin: '13:00' },
        { debut: '12:00', fin: '15:00' },
      ],
    }],
    ['trop de plages', {
      '1': [
        { debut: '08:00', fin: '09:00' },
        { debut: '10:00', fin: '11:00' },
        { debut: '12:00', fin: '13:00' },
        { debut: '14:00', fin: '15:00' },
      ],
    }],
  ])('refuse %s', (_cas, valeur) => {
    expect(() => verifierHoraires(valeur)).toThrow();
  });
});

describe('normaliserGsm', () => {
  it.each(['22 000 800', '22000800', '022000800', '+216 22 000 800', '0021622000800'])(
    'ramène %s au même numéro',
    (saisie) => {
      expect(normaliserGsm(saisie)).toBe('21622000800');
    },
  );

  it('garde un numéro étranger', () => {
    expect(normaliserGsm('+33 6 12 34 56 78')).toBe('33612345678');
  });
});

describe('slugDepuisNom', () => {
  it('écrit le nom sans accent ni espace', () => {
    expect(slugDepuisNom('Cabinet Dentaire  Dr. Hélène Ben Salem')).toBe('cabinet-dentaire-dr-helene-ben-salem');
  });

  it('ne garde rien d’un nom écrit en arabe', () => {
    expect(slugDepuisNom('عيادة الأسنان')).toBe('');
  });
});
