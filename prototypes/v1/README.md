# CréeTonAgent — prototype v1

> Premier prototype, conservé tel quel. Le prototype actuel est dans
> [`../v2`](../v2).

Prototype cliquable de l’app : un commerçant d’Abidjan crée son assistant
WhatsApp en quelques minutes.

> **Prototype :** aucune donnée n’est envoyée. Le code SMS, la lecture de photo,
> l’IA et la connexion WhatsApp sont **simulés** pour tester l’expérience avec de
> vrais commerçants avant de construire le backend.

## Parcours

1. **Bienvenue** → « Créer mon assistant »
2. **Numéro de téléphone** (+225) et code à 6 chiffres (n’importe quel code marche)
3. **Activité** : 🍽️ Restaurant / Maquis ou 🛍️ Boutique / Vente en ligne
4. **Questions guidées**, une par écran, adaptées à l’activité :
   - Boutique : où vendez-vous (boutique physique, TikTok, Instagram, Facebook,
     WhatsApp) → comptes en ligne → adresse *(seulement s’il y a une boutique
     physique)* → horaires → produits → zones et frais de livraison → paiement
     (Wave, Orange Money, MTN, Moov, espèces…) → ton
   - Restaurant : nom → adresse → horaires → sur place / à emporter / livraison →
     menu → livraison *(si proposée)* → paiement → ton
   - Produits/menu : **photo de la liste de prix** (extraction simulée) ou ajout à la main
5. **Animation 3D** : le robot assistant apparaît, salue et lance des confettis
   (three.js via react-three-fiber + expo-gl)
6. **Tester mon assistant** : on écrit comme un client. 👎🏾 sur une mauvaise
   réponse → on choisit ce que l’assistant aurait dû faire (montrer le
   catalogue, donner un prix, expliquer la livraison ou le paiement, prendre la
   commande, passer la main, ou écrire sa propre réponse) avec un aperçu
7. **Connecter WhatsApp** (QR code simulé)
8. **Accueil** : statistiques, conversations, badge « À traiter », et
   **« Je prends la main »** pour répondre soi-même à un client
9. **Mon assistant** (⚙️ sur l’accueil) : toutes les infos restent modifiables
   (nom, adresse, horaires, produits, livraison, paiement, ton…), avec
   Enregistrer / Annuler, plus la liste des **réponses apprises** à modifier ou
   supprimer

## Lancer l’app sur votre iPhone (sans Mac)

Prérequis : un ordinateur avec [Node.js](https://nodejs.org) 20+ et l’app
**Expo Go** sur l’iPhone (App Store).

```bash
cd prototypes/v1
npm install
npx expo start --clear
```

Scannez le QR code affiché avec l’appareil photo de l’iPhone → l’app s’ouvre
dans Expo Go. L’iPhone et l’ordinateur doivent être sur le même Wi-Fi (sinon :
`npx expo start --tunnel`).

## Envoyer une version de test via TestFlight

Nécessite un compte Apple Developer et un compte [Expo](https://expo.dev) (gratuit).

```bash
cd prototypes/v1
npx eas-cli@latest login
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios
```

EAS compile l’app dans le cloud (pas besoin de Mac), puis l’envoie sur App Store
Connect. Ajoutez ensuite les testeurs dans TestFlight.

## Développement

```bash
npm run typecheck   # TypeScript
npx expo lint       # ESLint
```

Structure :

- `src/app/` — écrans (Expo Router : un fichier = un écran)
- `src/data/categories.ts` — activités et questions du parcours (ajouter un métier ici)
- `src/lib/mock-assistant.ts` — assistant simulé, **à remplacer par l’appel au backend + IA**
- `src/components/robot-3d/` — scène 3D de l’animation de création
- `src/components/step-editor.tsx` — champs partagés entre le questionnaire et « Mon assistant »
- `src/state/` — état de l’app (en mémoire pour le prototype)
- `src/components/` — composants d’interface
