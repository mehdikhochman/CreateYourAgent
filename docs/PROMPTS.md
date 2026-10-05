# Prompts pour les skills Claude

Messages prêts à coller pour utiliser les plugins activés dans ce projet
(design, engineering, expo ; voir `.claude/settings.json`).

**Mode d’emploi :** ouvrez une **nouvelle session** Claude sur CreateYourAgent
(les skills se chargent au démarrage d’une session), collez un prompt, puis
envoyez. Remplacez ce qui est entre [crochets].

## Maintenant, avant les tests avec les commerçants

### 1. Préparer les entretiens

```
/design:user-research
Create a research plan and an interview guide to test the CréeTonAgent prototype (prototypes/v2) with real shop owners in Abidjan before we build the backend. Read README.md and docs/business/FONCTIONNEMENT_ET_BUSINESS_MODEL.md for context.
Participants: 8 people — 3 maquis/restaurants, 3 online sellers on TikTok/Instagram without a shop, 2 physical boutiques, mixed iPhone/Android.
We want to learn: (1) do they really lose sales because they answer WhatsApp too late, (2) can they create their assistant alone in the prototype, (3) would they let Tiko answer real customers, and when would they take over, (4) their reaction to 7,500 F/month paid by Wave or Orange Money.
Format: 50-minute in-person sessions. Write the questions and prototype tasks in simple French, and add a one-page note sheet to fill after each session.
```

### 2. Améliorer les textes de l’app

```
/design:ux-copy
Review all user-facing text in prototypes/v2: screens in src/app, components in src/components, and the assistant's replies in src/lib/mock-assistant.ts.
Users: small shop owners in Abidjan, many not comfortable with tech. French, simple words, friendly tone. The owner sees the mascot "Tiko"; customers see the shop's name.
Focus on buttons, error messages (SMS code, no connection), empty screens, confirmations and the onboarding questions.
Give me a table: screen · current text · proposed text · why. Don't change the code yet.
```

### 3. Avoir un avis sur les écrans

```
/design:design-critique
Critique the CréeTonAgent prototype screens in prototypes/v2/screenshots/ and compare them with the validated design in design/screens/.
Users: shop owners in Abidjan on mid-range phones, often in a hurry, sometimes outdoors in bright sun.
Look at clarity, visual hierarchy, consistency, tap targets, and anything that could confuse a first-time user. Rank the issues by severity and suggest a fix for each.
```

### 4. Vérifier l’accessibilité

```
/design:accessibility-review
Audit prototypes/v2 for WCAG 2.1 AA: colours in src/constants/theme.ts, components in src/components/ui.tsx and src/components/chat.tsx, and the images in prototypes/v2/screenshots/.
Check colour contrast (especially text on orange #F77F00 and grey text #5F6168), tap target sizes, screen-reader labels, and text size on small Android phones.
List each issue with its severity, file, and fix.
```

### 5. Publier le lien web pour les testeurs

```
/expo:eas-hosting
Help me publish the web version of prototypes/v2 (Expo SDK 57, static web output, installable-app files in public/) so I can send testers a link. I have a free Expo account.
Walk me through each command step by step, and explain how to update the link after I change the app.
```

## Après les entretiens

### 6. Analyser vos notes

```
/design:research-synthesis
Here are my notes from testing the CréeTonAgent prototype with [number] shop owners in Abidjan: [paste your notes or attach the files].
Group them into themes. List the main problems with the prototype and what people said about the price (7,500 F/month). Give prioritized recommendations ranked by impact versus effort, and keep participants' exact words as quotes.
```

## Quand on construira la vraie app

### 7. Choisir comment connecter WhatsApp

```
/engineering:architecture
Decision: how CréeTonAgent should connect to WhatsApp for the first 20–50 shops in Abidjan. Option A: an unofficial gateway that links by QR code (like Evolution API, which the prototype simulates). Option B: Meta's official WhatsApp Cloud API, directly or through a provider.
Compare: risk of the shop's number being banned, setup steps for a non-technical owner, cost per conversation, time to launch, and how to switch later.
Write it as a decision record with a recommendation.
```

### 8. Concevoir le backend

```
/engineering:system-design
Design the real backend for CréeTonAgent. Today prototypes/v2 is front-end only: the assistant is simulated in src/lib/mock-assistant.ts and data lives in memory in src/state.
Read docs/business/FONCTIONNEMENT_ET_BUSINESS_MODEL.md (especially the message flow) and docs/research/RESEARCH_AND_MVP.md.
Needs: a customer message reaches the shop's WhatsApp → the AI answers from the shop's profile and learned answers → the owner is notified for orders and questions it can't answer → the owner can take over. Plus login by phone number with an SMS code, and subscription payment by Wave or Orange Money.
Constraints: tiny team, small budget, 20–50 shops to start, unreliable mobile internet.
Give me the components, data model, API, a diagram, monthly costs, and what to build first.
```

### 9. Ajouter des tests automatiques

```
/engineering:testing-strategy
Propose a testing strategy for prototypes/v2 (Expo SDK 57, React Native, expo-router). There are no automated tests yet.
Start with the most valuable parts: src/lib/mock-assistant.ts (replies, delivery zones, learned answers) and src/data/categories.ts, then the onboarding screens.
Tell me which tools to use with Expo and which tests to write first, then write the first test file.
```
