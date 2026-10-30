// Réservation en ligne (2026-10-30) : calcul des créneaux proposés au patient.
// Les dates et heures sont celles de Tunis, UTC+1 toute l'année (pas d'heure
// d'été), alors que le serveur tourne en UTC.

export const JOURS_MAX = 30;
export const DELAI_MIN_MINUTES = 120;
export const DUREES_CRENEAU = [15, 20, 30, 45, 60];
const PLAGES_MAX_PAR_JOUR = 2;

export interface Plage {
  debut: string;
  fin: string;
}

/** Clés '0' (dimanche) à '6' (samedi) ; un jour absent ou vide est fermé. */
export type Horaires = Record<string, Plage[]>;

export interface Periode {
  dateDebut: Date;
  dateFin: Date;
}

const matin = { debut: '09:00', fin: '13:00' };
const apresMidi = { debut: '15:00', fin: '18:00' };

export const HORAIRES_PAR_DEFAUT: Horaires = {
  '1': [matin, apresMidi],
  '2': [matin, apresMidi],
  '3': [matin, apresMidi],
  '4': [matin, apresMidi],
  '5': [matin, apresMidi],
  '6': [matin],
};

const FORMAT_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

function enMinutes(heure: string): number {
  const [h, m] = heure.split(':').map(Number);
  return h * 60 + m;
}

function enHeure(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function instantTunis(date: string, heure: string): Date {
  return new Date(`${date}T${heure}:00+01:00`);
}

export function dateTunis(instant: Date): string {
  return new Date(instant.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function ajouterJours(date: string, jours: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

/** Refuse aussi une date impossible comme le 31 février. */
export function estDateValide(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T12:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

export function heuresDuJour(horaires: Horaires, duree: number, date: string): string[] {
  const jour = new Date(`${date}T12:00:00Z`).getUTCDay();
  const heures: string[] = [];
  for (const plage of horaires[jour] ?? []) {
    const fin = enMinutes(plage.fin);
    for (let m = enMinutes(plage.debut); m + duree <= fin; m += duree) {
      heures.push(enHeure(m));
    }
  }
  return heures;
}

export function heuresLibres(
  heures: string[],
  date: string,
  duree: number,
  occupees: Periode[],
  maintenant: Date,
): string[] {
  const premierInstant = maintenant.getTime() + DELAI_MIN_MINUTES * 60_000;
  return heures.filter((heure) => {
    const debut = instantTunis(date, heure).getTime();
    const fin = debut + duree * 60_000;
    return (
      debut >= premierInstant &&
      !occupees.some((p) => p.dateDebut.getTime() < fin && p.dateFin.getTime() > debut)
    );
  });
}

/** Contrôle les horaires reçus et les range par ordre ; lève une Error lisible sinon. */
export function verifierHoraires(valeur: Record<string, unknown>): Horaires {
  const horaires: Horaires = {};
  for (const [jour, plages] of Object.entries(valeur)) {
    if (!/^[0-6]$/.test(jour) || !Array.isArray(plages)) {
      throw new Error('Horaires invalides');
    }
    if (plages.length > PLAGES_MAX_PAR_JOUR) {
      throw new Error(`${PLAGES_MAX_PAR_JOUR} plages horaires au maximum par jour`);
    }
    const triees = plages
      .map((p) => {
        const { debut, fin } = (p ?? {}) as Partial<Plage>;
        if (typeof debut !== 'string' || typeof fin !== 'string') {
          throw new Error('Horaires invalides');
        }
        if (!FORMAT_HEURE.test(debut) || !FORMAT_HEURE.test(fin) || enMinutes(debut) >= enMinutes(fin)) {
          throw new Error(`Plage horaire incorrecte : ${debut} - ${fin}`);
        }
        return { debut, fin };
      })
      .sort((a, b) => enMinutes(a.debut) - enMinutes(b.debut));
    triees.forEach((plage, i) => {
      if (i > 0 && enMinutes(plage.debut) < enMinutes(triees[i - 1].fin)) {
        throw new Error('Deux plages horaires se chevauchent');
      }
    });
    if (triees.length > 0) horaires[jour] = triees;
  }
  return horaires;
}

/** Numéro tunisien → 216XXXXXXXX, comme normaliserGsm côté web. */
export function normaliserGsm(gsm: string): string {
  let chiffres = gsm.replace(/\D/g, '');
  if (chiffres.startsWith('00')) chiffres = chiffres.slice(2);
  if (chiffres.startsWith('0')) chiffres = `216${chiffres.slice(1)}`;
  else if (chiffres.length <= 8) chiffres = `216${chiffres}`;
  return chiffres;
}

/** Adresse du lien public proposée à partir du nom du cabinet. */
export function slugDepuisNom(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
}
