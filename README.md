# CréeTonAgent

App mobile qui permet à un petit commerce d’Abidjan (restaurant, maquis,
boutique, vendeuse TikTok/Instagram/Facebook) de créer en quelques minutes un
assistant qui répond à ses clients sur WhatsApp, 24h/24.

L’assistant s’appelle **Tiko** côté commerçant ; les clients voient le nom du commerce.

## Organisation du dépôt

| Dossier | Contenu |
| --- | --- |
| [`prototypes/v2/`](prototypes/v2) | **Prototype actuel.** Nouveau design, Tiko, vrais logos, discussion style WhatsApp, version web installable (PWA) et Android (APK). |
| [`prototypes/v1/`](prototypes/v1) | Premier prototype (conservé tel quel) : parcours complet, robot 3D, corrections, « Mon assistant ». |
| [`design/`](design) | Maquettes validées : images des écrans, fichiers de la page de design, Tiko en SVG, logos. |
| [`docs/business/`](docs/business) | Fonctionnement de l’app et business model. |
| [`docs/research/`](docs/research) | Recherche de projets similaires sur GitHub et définition du MVP. |

## Liens

- Design en ligne (commentable) : https://claude.ai/artifact/StVa3cWdXKfXCSoDvFv4qG
- Fonctionnement & business model en ligne : https://claude.ai/code/artifact/31fffaaf-8ba0-4db6-be95-62693ad3e428

## Lancer le prototype

```bash
cd prototypes/v2
npm install
npx expo start --clear
```

Scannez le QR code avec l’iPhone (app **Expo Go**). Détails, version web et APK
Android : voir [`prototypes/v2/README.md`](prototypes/v2/README.md).

## Plugins Claude du projet

`.claude/settings.json` active trois plugins pour chaque session Claude Code
ouverte sur ce dépôt :

- **design** : `/design:ux-copy`, `/design:design-critique`, `/design:accessibility-review`,
  `/design:user-research`, `/design:research-synthesis`, `/design:design-system`, `/design:design-handoff`
- **engineering** : `/engineering:system-design`, `/engineering:architecture`, `/engineering:testing-strategy`,
  `/engineering:debug`, `/engineering:deploy-checklist`, `/engineering:code-review`, …
- **expo** (par l’équipe Expo) : Expo Router, animations, publication web (`eas-hosting`),
  mises à jour, App Store et Play Store

Tapez `/` dans Claude pour voir la liste.
