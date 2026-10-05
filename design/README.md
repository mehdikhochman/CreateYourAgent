# Design — CréeTonAgent

Maquettes validées de l’app (octobre 2026).

**Version en ligne (modifiable et commentable) :**
https://claude.ai/artifact/StVa3cWdXKfXCSoDvFv4qG

Ce dossier en garde une copie dans le dépôt, pour ne rien perdre.

## Écrans

Les images sont dans `screens/` (rendu 2×, police Plus Jakarta Sans).

| # | Écran | Image | Source |
| --- | --- | --- | --- |
| 1 | Bienvenue (Tiko se présente) | [Main.png](screens/Main.png) | `canvas/Main.dc.html` |
| 2 | Activité | [Category.png](screens/Category.png) | `canvas/Category.dc.html` |
| 3 | Où vendez-vous | [Channels.png](screens/Channels.png) | `canvas/Channels.dc.html` |
| 4 | Paiement | [Payments.png](screens/Payments.png) | `canvas/Payments.dc.html` |
| 5 | Assistant créé (« Tiko est prêt ! ») | [Celebration.png](screens/Celebration.png) | `canvas/Celebration.dc.html` |
| 6 | Tester (style WhatsApp) | [TestChat.png](screens/TestChat.png) | `canvas/TestChat.dc.html` |
| 7 | Correction par action | [Correction.png](screens/Correction.png) | `canvas/Correction.dc.html` |
| 8 | Accueil | [Home.png](screens/Home.png) | `canvas/Home.dc.html` |
| 9 | Mon assistant | [Settings.png](screens/Settings.png) | `canvas/Settings.dc.html` |
| — | Tiko, fiche personnage | [MascotSheet.png](screens/MascotSheet.png) | `canvas/MascotSheet.dc.html` |
| — | Système visuel (couleurs, police, boutons, états) | [System.png](screens/System.png) | `canvas/System.dc.html` |

`canvas/` contient les fichiers bruts de la page de design (`canvas.json` donne
la position et le titre de chaque écran). Ils s’ouvrent correctement depuis la
version en ligne. En local, les logos et la mascotte n’y apparaissent pas : ils
sont chargés par la page en ligne.

## Tiko, la mascotte

`mascot/` contient Tiko en SVG, dans ses six humeurs :

| Fichier | Humeur | Quand l’utiliser |
| --- | --- | --- |
| `tiko-hello.svg` | Coucou | Accueil, intro |
| `tiko-think.svg` | Réfléchit | « Il écrit… », chargement |
| `tiko-happy.svg` | Content | Assistant créé, commande reçue |
| `tiko-wink.svg` | Clin d’œil | Correction enregistrée |
| `tiko-surprised.svg` | Surpris | Erreur, pas de connexion |
| `tiko-sleep.svg` | En pause | Le commerçant a pris la main |

Le nom « Tiko » n’apparaît que côté commerçant. Les clients voient le nom du
commerce.

## Système visuel

- Police : Plus Jakarta Sans (500, 600, 700, 800)
- Texte `#15161A`, texte secondaire `#5F6168`, fond `#F7F7F9`, bordures `#E4E4E8`
- Orange `#F77F00` (texte sur orange `#1A1206`), orange doux `#FFF4E8`, liens `#A34F00`
- Vert `#00875A` (WhatsApp, succès)
- Discussion : fond `#EFEAE2`, bulle client `#D9FDD3`, coches lues `#2F8FD8`
- Icônes : [Lucide](https://lucide.dev) (pas d’emoji dans l’interface)

## Logos

`logos/` contient les logos utilisés dans l’app :

| Fichier | Marque | Origine |
| --- | --- | --- |
| `whatsapp.svg`, `instagram.svg`, `facebook.svg`, `tiktok.svg`, `orange.svg` | WhatsApp, Instagram, Facebook, TikTok, Orange | [Simple Icons](https://simpleicons.org) (CC0), couleurs de marque ajoutées |
| `wave.png` | Wave | Icône fournie par le porteur du projet |
| `orange-money.png`, `orange-money-icon.svg`, `orange-money-full.svg` | Orange Money | Dépôt public GitHub `socialincome-san/public` |
| `mtn.png` | MTN Mobile Money | Dépôt public GitHub `alexiskadje-ai/rh_platform`, converti en PNG |

Moov Money : aucun logo officiel trouvé, l’app affiche une icône de
portefeuille neutre.

Ces logos appartiennent à leurs marques. Ils servent à montrer au commerçant les
moyens de paiement et les réseaux qu’il utilise. Avant la sortie publique, il
faudra vérifier les règles d’usage de chaque marque.
