import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Démarrage du seed...');

  // 1. Cabinet de démo
  const cabinet = await prisma.cabinet.create({
    data: {
      nom: 'Cabinet ClinikDent Demo',
      adresse: 'Avenue Habib Bourguiba, Sfax',
      telephone: '+216 74 000 000',
      email: 'demo@clinikdent.tn',
    },
  });
  console.log(`✓ Cabinet créé : ${cabinet.nom}`);

  // 2. Utilisateur admin de démo
  const passwordHash = await bcrypt.hash('demo1234', 10);
  const admin = await prisma.user.create({
    data: {
      cabinetId: cabinet.id,
      email: 'demo@clinikdent.tn',
      passwordHash,
      nom: 'Demo',
      prenom: 'Médecin',
      specialite: 'Chirurgien-dentiste',
      role: 'admin',
    },
  });
  console.log(`✓ Utilisateur démo : ${admin.email} / mot de passe : demo1234`);

  // 3. Familles de médicaments
  const families = await Promise.all([
    prisma.medicationFamily.create({ data: { libelle: 'Antalgiques' } }),
    prisma.medicationFamily.create({ data: { libelle: 'Anti-inflammatoires' } }),
    prisma.medicationFamily.create({ data: { libelle: 'Antibiotiques oraux' } }),
    prisma.medicationFamily.create({ data: { libelle: 'Bains de bouche' } }),
  ]);
  console.log(`✓ ${families.length} familles de médicaments créées`);

  // 4. Médicaments
  await prisma.medication.createMany({
    data: [
      { familleId: families[0].id, nom: 'DOLIPRANE', dosage: '1G', forme: 'comprime', posologieDefaut: '1cp x3/j pdt 03 jours' },
      { familleId: families[0].id, nom: 'EFFERALGAN', dosage: '500MG', forme: 'comprime', posologieDefaut: '1cp x3/j pdt 03 jours' },
      { familleId: families[0].id, nom: 'ANALGAN EXTRA', dosage: '500MG', forme: 'comprime', posologieDefaut: '2cp x3/j pdt 03 jours' },
      { familleId: families[1].id, nom: 'ASTRADOL', dosage: '50MG', forme: 'gelule', posologieDefaut: '1gélule x3/j pdt 03 jours' },
      { familleId: families[1].id, nom: 'DI-ALGIREX', dosage: '500MG', forme: 'gelule', posologieDefaut: '2gélules x3/j pdt 03 jours' },
      { familleId: families[2].id, nom: 'AMOXICILLINE', dosage: '500MG', forme: 'gelule', posologieDefaut: '1gélule x3/j pdt 06 jours' },
      { familleId: families[2].id, nom: 'AUGMENTIN', dosage: '1G', forme: 'comprime', posologieDefaut: '1cp x2/j pdt 07 jours' },
      { familleId: families[3].id, nom: 'ELUDRIL', dosage: '', forme: 'solution', posologieDefaut: 'Bain de bouche 3x/j pdt 07 jours' },
    ],
  });
  console.log(`✓ 8 médicaments ajoutés au catalogue`);

  // 5. Types de RDV
  await prisma.appointmentType.createMany({
    data: [
      { cabinetId: cabinet.id, libelle: 'Consultation', dureeMinutes: 30, couleur: '#3b82f6' },
      { cabinetId: cabinet.id, libelle: 'Détartrage', dureeMinutes: 30, couleur: '#10b981' },
      { cabinetId: cabinet.id, libelle: 'Composite', dureeMinutes: 45, couleur: '#f59e0b' },
      { cabinetId: cabinet.id, libelle: 'Endodontie', dureeMinutes: 60, couleur: '#8b5cf6' },
      { cabinetId: cabinet.id, libelle: 'Couronne', dureeMinutes: 60, couleur: '#06b6d4' },
      { cabinetId: cabinet.id, libelle: 'Extraction', dureeMinutes: 45, couleur: '#ef4444' },
      { cabinetId: cabinet.id, libelle: 'Contrôle', dureeMinutes: 15, couleur: '#64748b' },
    ],
  });
  console.log(`✓ 7 types de RDV créés`);

  // 6. Catalogue des actes
  await prisma.actCatalog.createMany({
    data: [
      { cabinetId: cabinet.id, code: 'DETAR', libelle: 'Détartrage', tarifBase: 90, categorie: 'prevention' },
      { cabinetId: cabinet.id, code: 'OBT', libelle: 'Obturation (composite)', tarifBase: 80, categorie: 'conservation' },
      { cabinetId: cabinet.id, code: 'BIO-OBT', libelle: 'Biopulpectomie + Obturation', coefficient: 2, tarifBase: 180, categorie: 'endo' },
      { cabinetId: cabinet.id, code: 'COURON', libelle: 'Couronne céramo-métallique', tarifBase: 450, categorie: 'prothese' },
      { cabinetId: cabinet.id, code: 'EXTRAC', libelle: 'Extraction simple', tarifBase: 60, categorie: 'chirurgie' },
      { cabinetId: cabinet.id, code: 'PARAGE', libelle: 'Parage canalaire', tarifBase: 90, categorie: 'endo' },
    ],
  });
  console.log(`✓ 6 actes ajoutés au catalogue`);

  // 7. Patients de démo
  const patients = await Promise.all([
    prisma.patient.create({
      data: {
        cabinetId: cabinet.id, numeroDossier: '00001',
        nom: 'Zouabia', prenom: 'Raouda',
        dateNaissance: new Date('1986-03-30'),
        sexe: 'F', gsm: '22000800',
        adresse: 'El Manar, Tunis',
        antecedents: 'Grossesse en cours. Allergie pénicilline.',
      },
    }),
    prisma.patient.create({
      data: {
        cabinetId: cabinet.id, numeroDossier: '00002',
        nom: 'Chebbi', prenom: 'Samira',
        dateNaissance: new Date('1983-07-12'),
        sexe: 'F', gsm: '23123456',
      },
    }),
    prisma.patient.create({
      data: {
        cabinetId: cabinet.id, numeroDossier: '00003',
        nom: 'Torkhani', prenom: 'Taoufik',
        dateNaissance: new Date('1974-01-15'),
        sexe: 'M', gsm: '98765432',
      },
    }),
  ]);
  console.log(`✓ ${patients.length} patients de démo créés`);

  console.log('\n✅ Seed terminé avec succès !');
  console.log('\n📝 Connexion :');
  console.log('   Email    : demo@clinikdent.tn');
  console.log('   Password : demo1234');
}

main()
  .catch((e) => {
    console.error('❌ Erreur :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
