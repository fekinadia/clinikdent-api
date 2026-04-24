# ClinikDent API — Backend

Backend REST API pour le logiciel de gestion de cabinet dentaire **ClinikDent**.

## 🛠️ Stack technique

- **NestJS 10** — Framework Node.js modulaire et scalable
- **TypeScript** — Typage strict pour éviter les bugs
- **Prisma** — ORM moderne avec migrations automatiques
- **PostgreSQL** — Base de données relationnelle
- **JWT + Passport** — Authentification sécurisée
- **bcrypt** — Hachage des mots de passe
- **Swagger** — Documentation API interactive auto-générée

## 📂 Structure du projet

```
clinikdent-api/
├── prisma/
│   ├── schema.prisma          → Modèle de données
│   └── seed.ts                → Données initiales
├── src/
│   ├── auth/                  → Authentification JWT
│   ├── patients/              → Gestion des patients
│   ├── appointments/          → Rendez-vous & agenda
│   ├── treatments/            → Soins + schéma dentaire
│   ├── prescriptions/         → Ordonnances
│   ├── prisma/                → Service Prisma global
│   ├── app.module.ts          → Module racine
│   └── main.ts                → Point d'entrée
├── .env.example
├── package.json
└── tsconfig.json
```

## 🚀 Installation

### Prérequis

- **Node.js** 20 ou plus
- **PostgreSQL** 14 ou plus
- **npm** ou **yarn**

### Étapes

#### 1. Installer les dépendances

```bash
cd clinikdent-api
npm install
```

#### 2. Configurer la base de données

Créer la base PostgreSQL :

```bash
psql -U postgres
CREATE DATABASE clinikdent;
\q
```

#### 3. Configurer l'environnement

```bash
cp .env.example .env
```

Éditer `.env` et remplacer :
- `VOTRE_MOT_DE_PASSE` par votre mot de passe PostgreSQL
- `JWT_SECRET` par une chaîne aléatoire de 32+ caractères

#### 4. Créer les tables (migration Prisma)

```bash
npx prisma migrate dev --name init
```

Cette commande génère les tables dans PostgreSQL depuis `schema.prisma`.

#### 5. Charger les données initiales

```bash
npm run prisma:seed
```

Cela crée :
- Un cabinet de démo
- Un utilisateur : `demo@clinikdent.tn` / `demo1234`
- Le catalogue de médicaments
- Les types de RDV
- Les actes du catalogue
- 3 patients d'exemple

#### 6. Démarrer le serveur

```bash
npm run start:dev
```

Le serveur tourne sur **http://localhost:3000**.

## 📚 Documentation API

Documentation Swagger interactive disponible sur :

**http://localhost:3000/api/docs**

Vous pouvez tester tous les endpoints directement depuis l'interface, après vous être authentifié avec le bouton `Authorize`.

## 🔐 Endpoints principaux

### Authentification

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Créer un compte (1er médecin + cabinet) |
| POST | `/api/v1/auth/login` | Se connecter |

### Patients

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/v1/patients` | Liste avec recherche & pagination |
| POST | `/api/v1/patients` | Créer un patient |
| GET | `/api/v1/patients/:id` | Fiche complète |
| PATCH | `/api/v1/patients/:id` | Modifier |
| DELETE | `/api/v1/patients/:id` | Supprimer |
| GET | `/api/v1/patients/stats` | Statistiques |

### Rendez-vous

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/v1/appointments` | Liste avec filtres date/patient/médecin |
| GET | `/api/v1/appointments/today` | RDV du jour |
| POST | `/api/v1/appointments` | Créer (avec détection de conflits) |
| PATCH | `/api/v1/appointments/:id` | Modifier statut/horaires |
| DELETE | `/api/v1/appointments/:id` | Supprimer |

### Soins & Schéma dentaire

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/v1/treatments` | Créer une séance avec actes |
| GET | `/api/v1/patients/:id/treatments` | Historique des soins |
| GET | `/api/v1/patients/:id/financial-summary` | Résumé financier |
| GET | `/api/v1/patients/:id/tooth-chart` | Récupérer schéma dentaire |
| PUT | `/api/v1/patients/:id/tooth-chart` | Modifier état d'une dent |

### Ordonnances

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/v1/prescriptions` | Créer une ordonnance |
| GET | `/api/v1/patients/:id/prescriptions` | Ordonnances du patient |
| GET | `/api/v1/medications?search=` | Catalogue médicaments |
| GET | `/api/v1/prescription-templates` | Ordonnances types |

## 🧪 Tester l'API

### Avec cURL

```bash
# 1. Se connecter
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@clinikdent.tn","password":"demo1234"}'

# Réponse : { "accessToken": "eyJhbGc...", "user": {...} }

# 2. Lister les patients (avec le token)
curl http://localhost:3000/api/v1/patients \
  -H "Authorization: Bearer VOTRE_TOKEN_ICI"
```

### Avec Postman / Insomnia / Thunder Client

Importez la documentation Swagger depuis `http://localhost:3000/api-json`.

## 🔧 Commandes utiles

```bash
npm run start:dev          # Démarrer en mode dev (hot-reload)
npm run start:prod         # Démarrer en production
npm run build              # Compiler pour la production

npm run prisma:studio      # Interface visuelle de la base
npm run prisma:migrate     # Créer une nouvelle migration
npm run prisma:generate    # Régénérer le client Prisma après modif schema
npm run prisma:seed        # Recharger les données initiales
```

## 🗂️ Modèle de sécurité

- **Multi-tenant** : chaque cabinet ne voit que ses propres données
- **JWT** : token signé valable 7 jours par défaut
- **bcrypt** : mots de passe hachés avec coût 10
- **Validation** : tous les inputs validés via class-validator
- **CORS** : origines autorisées configurables dans `.env`
- **Isolation** : chaque endpoint vérifie que la donnée appartient au cabinet de l'utilisateur connecté

## 🚧 Prochaines étapes

- [ ] Module **finances** (paiements, dépenses, statistiques)
- [ ] Module **stock** (gestion des consommables)
- [ ] Module **imagerie** (upload de radios + photos)
- [ ] Module **statistiques** (graphiques, rapports)
- [ ] Génération **PDF** (ordonnances, factures)
- [ ] Notifications **SMS** (rappels de RDV)
- [ ] Tests unitaires et e2e
- [ ] Dockerisation
- [ ] Déploiement (AWS / Railway / Vercel)
