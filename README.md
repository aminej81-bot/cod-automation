# COD Automation — Plateforme d'automatisation eCommerce Maroc

Plateforme Node.js/TypeScript complète pour automatiser la gestion des commandes Cash on Delivery (COD) au Maroc, avec intégration Shopify, WhatsApp, Google Sheets et OzonExpress.

---

## Fonctionnalités

| Feature | Description |
|---------|-------------|
| **F1** | Webhook Shopify → confirmation WhatsApp + Google Sheets |
| **F2** | Auto-réponse WhatsApp IA (détection d'intention + Claude) |
| **F3** | Synchronisation Google Sheets toutes les 5 min |
| **F4** | Rappels WhatsApp NRP/INJ (10h, 14h, 20h) |
| **F5** | Suivi OzonExpress + notifications client |
| **F6** | Traitement des messages WhatsApp programmés |
| **F7** | Rapports journaliers (21h) et hebdomadaires (lundi 8h) |

---

## Prérequis

- Node.js ≥ 20
- PostgreSQL ≥ 15
- Docker & Docker Compose (recommandé)
- Compte Shopify avec webhooks configurés
- Compte WhatsApp Business (Meta Cloud API)
- Compte Google Cloud (Service Account + Sheets API)
- Clé API Claude (Anthropic)
- Compte OzonExpress avec accès API

---

## Installation rapide

### 1. Cloner et installer les dépendances

```bash
git clone <votre-repo>
cd cod-automation
npm install
```

### 2. Configurer les variables d'environnement

```bash
cp .env.example .env
```

Éditez `.env` avec vos vraies valeurs (voir section ci-dessous).

### 3. Configurer le compte de service Google

1. Créez un projet dans [Google Cloud Console](https://console.cloud.google.com)
2. Activez l'API **Google Sheets**
3. Créez un **Compte de Service** et téléchargez le fichier JSON
4. Placez le fichier JSON dans `config/service-account.json`
5. Partagez votre Google Sheet avec l'email du compte de service (éditeur)
6. Notez l'ID de votre feuille (dans l'URL: `spreadsheets/d/**ID**/edit`)

### 4. Préparer la base de données et lancer

```bash
# Avec Docker Compose (recommandé)
docker compose up -d

# OU sans Docker
npx prisma migrate deploy
npm run build
npm start
```

### 5. Configurer le webhook Shopify

Dans votre admin Shopify : **Paramètres → Notifications → Webhooks**

- Événement : `Création de commande`
- URL : `https://votre-domaine.com/webhooks/shopify/orders/create`
- Format : JSON

Copiez le **Secret de signature** dans `SHOPIFY_WEBHOOK_SECRET`.

### 6. Configurer le webhook WhatsApp

Dans [Meta for Developers](https://developers.facebook.com) → votre App → WhatsApp → Configuration :

- URL de rappel : `https://votre-domaine.com/webhooks/whatsapp`
- Token de vérification : la valeur de `WHATSAPP_VERIFY_TOKEN`
- Abonnez-vous à l'événement : `messages`

---

## Variables d'environnement

| Variable | Description | Exemple |
|----------|-------------|---------|
| `DATABASE_URL` | URL PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `SHOPIFY_SHOP_DOMAIN` | Domaine de votre boutique | `ma-boutique.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | Token d'accès Shopify | `shpat_xxx` |
| `SHOPIFY_WEBHOOK_SECRET` | Secret de signature webhook | |
| `WHATSAPP_PHONE_NUMBER_ID` | ID du numéro WhatsApp Business | |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | ID du compte WhatsApp Business | |
| `WHATSAPP_ACCESS_TOKEN` | Token d'accès Meta | `EAAx...` |
| `WHATSAPP_VERIFY_TOKEN` | Token de vérification webhook | chaine aléatoire |
| `MY_WHATSAPP_NUMBER` | Votre numéro WhatsApp (propriétaire) | `212600000000` |
| `GOOGLE_SHEETS_ID` | ID de votre feuille Google | |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Chemin vers le fichier JSON | `/app/config/service-account.json` |
| `OZON_API_URL` | URL de l'API OzonExpress | `https://api.ozonexpress.com/v1` |
| `OZON_API_KEY` | Clé API OzonExpress | |
| `OZON_API_SECRET` | Secret API OzonExpress | |
| `CLAUDE_API_KEY` | Clé API Anthropic | `sk-ant-...` |
| `CLAUDE_MODEL` | Modèle Claude à utiliser | `claude-sonnet-4-6` |
| `INTERNAL_WEBHOOK_SECRET` | Secret pour les routes internes | chaine aléatoire |
| `REMINDER_TIME_1` | Heure du 1er rappel | `10:00` |
| `REMINDER_TIME_2` | Heure du 2ème rappel | `14:00` |
| `REMINDER_TIME_3` | Heure du 3ème rappel | `20:00` |
| `CLIENT_NOTIFY_START_HOUR` | Début fenêtre notification client | `9` |
| `CLIENT_NOTIFY_END_HOUR` | Fin fenêtre notification client | `20` |
| `PORT` | Port du serveur | `3000` |
| `TZ` | Fuseau horaire | `Africa/Casablanca` |

---

## Structure Google Sheets

La feuille doit s'appeler **Commandes** avec les colonnes dans cet ordre :

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| N° commande | Nom client | Téléphone | Produit | Montant | **Statut** | Ville | Date |

Valeurs de statut reconnues dans la colonne F :
- `Confirmé` → vert
- `NRP` → jaune (déclenche rappels)
- `INJ` → orange (déclenche rappels)
- `Annulé` → rouge
- `Expédié` → bleu
- `Livré` → vert foncé
- `Retour` → violet

---

## Routes API

### Publiques

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/health` | Vérification de santé |
| `GET` | `/webhooks/whatsapp` | Vérification webhook Meta |
| `POST` | `/webhooks/whatsapp` | Messages WhatsApp entrants |
| `POST` | `/webhooks/shopify/orders/create` | Nouvelles commandes Shopify |

### Internes (header `X-Internal-Secret` requis)

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/orders` | Liste des commandes |
| `GET` | `/api/orders/:id` | Détail d'une commande |
| `POST` | `/api/orders/:id/ship` | Créer une expédition OzonExpress |

---

## Déploiement sur Railway

### 1. Installer Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### 2. Créer le projet

```bash
railway init
railway add postgresql
```

### 3. Configurer les variables

```bash
# Copier toutes les variables de votre .env vers Railway
railway variables set SHOPIFY_WEBHOOK_SECRET=xxx WHATSAPP_ACCESS_TOKEN=yyy ...
```

Ou utilisez le dashboard Railway pour les saisir une par une.

### 4. Déployer

```bash
railway up
```

Railway détecte automatiquement le `Dockerfile`. La variable `DATABASE_URL` est injectée automatiquement depuis le service PostgreSQL.

### 5. Obtenir l'URL publique

```bash
railway domain
```

Utilisez cette URL pour configurer vos webhooks Shopify et WhatsApp.

---

## Développement local

```bash
# Démarrer PostgreSQL
docker compose up postgres -d

# Appliquer les migrations
npx prisma migrate dev

# Lancer en mode développement (hot-reload)
npm run dev

# Explorer la base de données
npx prisma studio
```

---

## Ajouter des produits avec FAQ

Insérez directement en base :

```sql
INSERT INTO "Product" (id, title, sku, "imageUrl", "audioUrl", faq)
VALUES (
  gen_random_uuid(),
  'Mon Produit',
  'PROD-001',
  'https://exemple.com/image.jpg',
  'https://exemple.com/audio.mp3',
  '{"Délai de livraison": "3 à 5 jours ouvrables", "Retours": "30 jours"}'::jsonb
);
```

Ou via Prisma Studio : `npx prisma studio`

---

## Logs

Les logs sont écrits dans `logs/` :
- `logs/app-YYYY-MM-DD.log` — tous les logs
- `logs/error-YYYY-MM-DD.log` — erreurs uniquement

Conservation : 14 jours (app), 30 jours (erreurs).

---

## Sécurité

- HMAC-SHA256 vérifié sur chaque webhook Shopify
- Routes internes protégées par `X-Internal-Secret`
- Rate limiting par groupe de routes
- Headers de sécurité via Helmet.js
- Processus non-root dans le conteneur Docker
- Arrêt gracieux sur SIGTERM

---

## Licence

MIT
