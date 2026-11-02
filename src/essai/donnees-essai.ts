import { Prisma } from '@prisma/client';
import { ajouterJours, dateTunis, instantTunis } from '../reservation/creneaux';

// Essai en un clic (2026-11-02) : patients inventés d'un cabinet d'essai. Tous
// portent le numéro du médecin : un rappel WhatsApp essayé arrive sur son propre
// téléphone, jamais chez un inconnu.

const PATIENTS: [string, string, 'F' | 'M', string][] = [
  ['Trabelsi', 'Rania', 'F', '1986-03-14'],
  ['Gharbi', 'Sami', 'M', '1979-07-02'],
  ['Mansour', 'Yosr', 'F', '1992-11-21'],
  ['Jelassi', 'Karim', 'M', '1968-05-09'],
  ['Bouzid', 'Ines', 'F', '2001-01-30'],
  ['Chaabane', 'Mehdi', 'M', '1975-09-17'],
];

// [jours après aujourd'hui, heure, durée en minutes, patient, statut]
const RENDEZ_VOUS: [number, string, number, number, string][] = [
  [0, '09:00', 30, 0, 'planifie'],
  [0, '10:00', 30, 1, 'arrive'],
  [0, '15:00', 30, 2, 'confirme'],
  [1, '09:30', 30, 3, 'planifie'],
  [1, '11:00', 60, 4, 'planifie'],
  [1, '15:30', 30, 5, 'confirme'],
  [2, '10:00', 30, 0, 'planifie'],
  [2, '16:00', 30, 2, 'planifie'],
  [3, '09:00', 60, 1, 'planifie'],
];

// [jours avant aujourd'hui, patient, acte, dent, coût, reçu]
const SOINS: [number, number, string, string | null, number, number][] = [
  [34, 0, 'Couronne céramo-métallique', '16', 450, 300],
  [20, 0, 'Détartrage', null, 60, 60],
  [6, 0, 'Obturation composite', '24', 80, 80],
  [12, 1, 'Extraction simple', '38', 70, 70],
];

const DENTS: [number, string][] = [
  [16, 'couronne'],
  [24, 'obturation'],
  [26, 'obturation'],
  [36, 'carie'],
  [46, 'endo'],
  [18, 'absente'],
  [37, 'a_traiter'],
];

interface CabinetEssai {
  cabinetId: number;
  medecinId: number;
  gsm: string;
  maintenant: Date;
}

export async function remplirCabinetEssai(
  tx: Prisma.TransactionClient,
  { cabinetId, medecinId, gsm, maintenant }: CabinetEssai,
) {
  const aujourdhui = dateTunis(maintenant);
  const jour = (n: number) => ajouterJours(aujourdhui, n);
  const gsmFiche = gsm.replace(/^216(?=\d{8}$)/, '');

  const patients: number[] = [];
  for (const [i, [nom, prenom, sexe, naissance]] of PATIENTS.entries()) {
    const patient = await tx.patient.create({
      data: {
        cabinetId,
        numeroDossier: String(i + 1).padStart(5, '0'),
        nom,
        prenom,
        sexe,
        gsm: gsmFiche,
        dateNaissance: new Date(naissance),
        createdById: medecinId,
      },
    });
    patients.push(patient.id);
  }

  await tx.appointment.createMany({
    data: RENDEZ_VOUS.map(([j, heure, duree, patient, statut]) => {
      const dateDebut = instantTunis(jour(j), heure);
      return {
        cabinetId,
        patientId: patients[patient],
        medecinId,
        dateDebut,
        dateFin: new Date(dateDebut.getTime() + duree * 60_000),
        statut,
        heureArrivee: statut === 'arrive' ? maintenant : null,
        createdById: medecinId,
      };
    }),
  });

  const actes: number[] = [];
  for (const [j, patient, libelle, dents, cout, montantRecu] of SOINS) {
    const soin = await tx.treatment.create({
      data: {
        patientId: patients[patient],
        medecinId,
        dateSoin: new Date(jour(-j)),
        acts: { create: { libelle, dents, cout, montantRecu } },
      },
      include: { acts: true },
    });
    actes.push(soin.acts[0].id);
  }

  const paiement = (
    patient: number,
    montant: number,
    modeReglement: string,
    date: string,
    treatmentActId?: number,
  ) => ({
    patientId: patients[patient],
    treatmentActId: treatmentActId ?? null,
    montant,
    modeReglement,
    datePaiement: new Date(date),
    createdById: medecinId,
  });

  await tx.payment.createMany({
    data: [
      paiement(0, 150, 'especes', jour(-34), actes[0]),
      {
        ...paiement(0, 150, 'cheque', jour(-20), actes[0]),
        numeroCheque: 'C-204518',
        banque: 'Banque du Centre',
        dateEcheance: new Date(jour(5)),
      },
      paiement(0, 60, 'd17', jour(-20), actes[1]),
      paiement(0, 80, 'cnam', jour(-6), actes[2]),
      paiement(1, 70, 'especes', jour(-12), actes[3]),
      paiement(2, 120, 'especes', aujourdhui),
      paiement(3, 60, 'd17', aujourdhui),
      paiement(4, 80, 'cnam', aujourdhui),
      {
        ...paiement(5, 200, 'cheque', aujourdhui),
        numeroCheque: 'C-118204',
        banque: 'Banque du Sahel',
        dateEcheance: new Date(jour(9)),
      },
    ],
  });

  await tx.toothState.createMany({
    data: DENTS.map(([dentNumero, etat]) => ({ patientId: patients[0], dentNumero, etat })),
  });

  const demande = (prenom: string, nom: string, motif: string, j: number, heure: string) => {
    const dateDebut = instantTunis(jour(j), heure);
    return {
      cabinetId,
      prenom,
      nom,
      gsm,
      motif,
      dateDebut,
      dateFin: new Date(dateDebut.getTime() + 30 * 60_000),
    };
  };

  await tx.demandeRdv.createMany({
    data: [
      demande('Salma', 'Dridi', 'Douleur dentaire', 2, '12:00'),
      demande('Anis', 'Mejri', 'Détartrage', 3, '11:30'),
    ],
  });
}
