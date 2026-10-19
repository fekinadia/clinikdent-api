// Recherche de patients par date de naissance (2026-10-19).
//
// La barre de recherche de la liste des patients comprend maintenant des
// dates saisies "à la française", sans format imposé :
//   13/01/1990  13-01-1990  13.01.1990  13 01 1990  13 jan 1990  1990-01-13
//     → la date exacte
//   13/01  13 jan  13 janvier  1er mars
//     → le jour et le mois, quelle que soit l'année (anniversaires)
//   01/1990  jan 1990  janvier 1990
//     → tout le mois
//   1990
//     → toute l'année
// Tout ce qui ne ressemble pas à une date renvoie null : la recherche par
// nom / GSM / n° de dossier reste alors strictement inchangée.

export type BirthDateSearch =
  | { kind: 'exact'; date: Date }
  | { kind: 'range'; from: Date; to: Date } // `to` exclu
  | { kind: 'dayMonth'; day: number; month: number };

const MOIS: Record<string, number> = {
  janvier: 1, janv: 1, jan: 1,
  fevrier: 2, fevr: 2, fev: 2,
  mars: 3, mar: 3,
  avril: 4, avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7, juil: 7,
  aout: 8,
  septembre: 9, sept: 9, sep: 9,
  octobre: 10, oct: 10,
  novembre: 11, nov: 11,
  decembre: 12, dec: 12,
};

const ANNEE_MIN = 1900;
const ANNEE_MAX = 2100;

function jourValide(jour: number, mois: number, annee?: number): boolean {
  if (mois < 1 || mois > 12 || jour < 1) return false;
  // Sans année (anniversaire) : on accepte le 29 février.
  const maxJours = new Date(Date.UTC(annee ?? 2000, mois, 0)).getUTCDate();
  return jour <= maxJours;
}

function parseJour(token: string): number | null {
  const m = /^(\d{1,2})(?:er)?$/.exec(token);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 31 ? n : null;
}

function parseMois(token: string): number | null {
  if (/^\d{1,2}$/.test(token)) {
    const n = Number(token);
    return n >= 1 && n <= 12 ? n : null;
  }
  return MOIS[token] ?? null;
}

function parseAnnee(token: string): number | null {
  if (!/^\d{4}$/.test(token)) return null;
  const n = Number(token);
  return n >= ANNEE_MIN && n <= ANNEE_MAX ? n : null;
}

const utc = (annee: number, mois: number, jour: number) => new Date(Date.UTC(annee, mois - 1, jour));

export function parseBirthDateSearch(raw: string | undefined | null): BirthDateSearch | null {
  if (!raw) return null;
  const texte = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // février → fevrier, août → aout
    .trim();
  if (!texte) return null;

  const tokens = texte
    .replace(/[\/.\-,]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 1) {
    const annee = parseAnnee(tokens[0]);
    return annee ? { kind: 'range', from: utc(annee, 1, 1), to: utc(annee + 1, 1, 1) } : null;
  }

  if (tokens.length === 2) {
    const [a, b] = tokens;
    // "01/1990", "jan 1990" → tout le mois
    const anneeB = parseAnnee(b);
    const moisA = parseMois(a);
    if (anneeB && moisA) {
      return { kind: 'range', from: utc(anneeB, moisA, 1), to: utc(anneeB, moisA + 1, 1) };
    }
    // "13/01", "13 jan" → jour + mois, toutes années
    const jour = parseJour(a);
    const mois = parseMois(b);
    if (jour && mois && jourValide(jour, mois)) return { kind: 'dayMonth', day: jour, month: mois };
    return null;
  }

  if (tokens.length === 3) {
    const [a, b, c] = tokens;
    // jour mois année : 13 01 1990, 13 jan 1990
    let jour = parseJour(a);
    let mois = parseMois(b);
    let annee = parseAnnee(c);
    // année mois jour : 1990 01 13 (format ISO)
    if (!(jour && mois && annee)) {
      annee = parseAnnee(a);
      mois = parseMois(b);
      jour = parseJour(c);
    }
    if (jour && mois && annee && jourValide(jour, mois, annee)) {
      return { kind: 'exact', date: utc(annee, mois, jour) };
    }
    return null;
  }

  return null;
}
