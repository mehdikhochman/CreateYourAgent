# CreateYourAgent — GitHub Research & MVP Proposal

> Goal: a phone app that lets a business in Abidjan create its own AI assistant
> (chatbot) in minutes, with no technical knowledge, and put it on WhatsApp.

Research date: 2026-10-04. Star counts are from GitHub at that date.

---

## 1. Key takeaways (TL;DR)

1. **Nobody on GitHub does exactly what we want.** There are great *engines*
   (Dify, Flowise, Typebot) and great *WhatsApp connectors* (Evolution API, WAHA,
   Baileys), but they are all **web dashboards built for technical users**. A
   mobile-first, French-first, "3 taps and it works" app for small African
   businesses is an open space.
2. **WhatsApp is the product.** In Abidjan, customers talk to businesses on
   WhatsApp. The website widget that Chatbase-style tools focus on is secondary.
3. **Don't build a flow builder.** Drag-and-drop canvases (Flowise, Typebot,
   Dify) are what makes those tools hard to use. Our differentiator is: the owner
   *describes* the business, and the AI does the rest.
4. **Skip RAG/vector databases for the MVP.** A restaurant menu, price list,
   opening hours and 20 FAQs fit easily in a modern LLM's context window. A
   simple "business profile" + prompt is cheaper, faster and easier to debug.
5. **Reuse, don't fork.** Use proven open-source pieces as building blocks
   (WhatsApp gateway, chat UI component) and write a small custom backend. Forking
   a big platform like Dify or Chatwoot would bury a 2-person team.

---

## 2. Similar projects found

### A. AI agent / chatbot builders (the "brain")

| Project | Stars | What it is | What we take from it |
|---|---|---|---|
| [langgenius/dify](https://github.com/langgenius/dify) | 158k | Most popular open-source LLM app builder: agents, RAG, workflows, API. Self-hostable. | Reference for features (knowledge base, prompt templates, conversation logs). Could serve as a backend engine later via its API. Too complex as a UI for our users. |
| [FlowiseAI/Flowise](https://github.com/FlowiseAI/Flowise) | 55k | Visual drag-and-drop agent builder. **Note: repo is now archived** — don't build on it. | Confirms that visual flow builders are for developers, not shop owners. |
| [baptisteArno/typebot.io](https://github.com/baptisteArno/typebot.io) | 10k | Self-hostable chatbot builder (forms + flows), has WhatsApp integration. French founder, good UX. | Excellent UI inspiration for chat bubbles, onboarding, and templates. |
| [Mintplex-Labs/anything-llm](https://github.com/Mintplex-Labs/anything-llm) | 67k | "Chat with your documents" app, workspaces, embeddable widget. | Document upload UX; per-workspace agents = per-business agents. |
| [infiniflow/ragflow](https://github.com/infiniflow/ragflow) | 92k | Heavy-duty RAG engine. | Only relevant later, for businesses with large catalogs/PDFs. |
| [simstudioai/sim](https://github.com/simstudioai/sim) | 30k | Workspace to build & deploy agents (Next.js). | Modern TypeScript code to read for agent deployment patterns. |
| [Tencent/WeKnora](https://github.com/Tencent/WeKnora) | 32k | Multi-tenant knowledge base → RAG agent. | Multi-tenant architecture (one platform, many businesses). |

### B. WhatsApp connectors (the "mouth")

| Project | Stars | Type | Notes |
|---|---|---|---|
| [evolution-foundation/evolution-api](https://github.com/evolution-foundation/evolution-api) | 9.8k | REST API over WhatsApp Web **and** official Cloud API | Already integrates with Dify, Typebot, Chatwoot, n8n, OpenAI. Very popular in Brazil for exactly our use case (SME chatbots). **Best candidate.** |
| [devlikeapro/waha](https://github.com/devlikeapro/waha) | 7.5k | WhatsApp HTTP API, multiple engines | Easy Docker setup; good alternative to Evolution API. |
| [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) | 11k | Low-level TS library (WhatsApp Web socket) | What Evolution/WAHA use under the hood. Use directly only if we want full control. |
| [wwebjs/whatsapp-web.js](https://github.com/wwebjs/whatsapp-web.js) | 23k | Node library via headless browser | Heavier (runs Chromium per number). |
| [rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA) | 15k | Self-hosted WhatsApp API gateway | Newer; worth watching. |
| [aldinokemal/go-whatsapp-web-multidevice](https://github.com/aldinokemal/go-whatsapp-web-multidevice) | 4.9k | Go REST API, multi-account | Low memory usage → cheap hosting for many businesses. |

> ⚠️ **Important risk — official vs unofficial WhatsApp.**
> Baileys / WAHA / whatsapp-web.js connect by "pretending" to be WhatsApp Web
> (scan a QR code). It's fast and free, but it is against WhatsApp's terms and
> **the business's number can be banned**. The **official WhatsApp Business
> Cloud API (Meta)** is safe but requires Meta business verification and has
> per-conversation fees.
> **Recommendation:** QR-code mode for the closed pilot (5–10 friendly
> businesses who accept the risk, ideally with a secondary number), then move to
> the official Cloud API before public launch. Evolution API supports both, so
> the switch is a config change, not a rewrite.

### C. Complete "AI + WhatsApp for businesses" products (closest to our idea)

| Project | Stars | Notes |
|---|---|---|
| [melgarafael/DeskcommCRM](https://github.com/melgarafael/DeskcommCRM) | 4.4k | Open-source AI sales CRM + WhatsApp (via WAHA), multi-tenant, Next.js + Supabase. **Closest existing product** — great to study its data model (tenants, conversations, agents, handoff). Brazilian market (similar informal-commerce dynamics to Abidjan). |
| [raphmwanza/RapidOS-open-source](https://github.com/raphmwanza/RapidOS-open-source) | new | WhatsApp AI bot + support dashboard for emerging markets, 15 languages, "bring your own WhatsApp number and AI key". Small, readable reference for an African context. |
| [yaasiin-ayeva/WhatsBot](https://github.com/yaasiin-ayeva/WhatsBot) | 53 | Simple WhatsApp AI bot with **voice-message** support. Useful because voice notes are very common in Abidjan. |

### D. Human inbox / customer support (for "take over the conversation")

| Project | Stars | Notes |
|---|---|---|
| [chatwoot/chatwoot](https://github.com/chatwoot/chatwoot) | 37.5k | Open-source Intercom/Zendesk with WhatsApp channel and mobile apps. Reference for the inbox UX and human handoff. Could be plugged in later for bigger clients. |
| [abhinavxd/libredesk](https://github.com/abhinavxd/libredesk) | 3k | Lightweight support desk in one Go binary, has AI agent. |

### E. Mobile app building blocks

| Project | Stars | Use |
|---|---|---|
| [FaridSafi/react-native-gifted-chat](https://github.com/FaridSafi/react-native-gifted-chat) | 14k | The standard chat UI component for React Native — for the "test your assistant" screen and the inbox. |
| [elie222/rakazo](https://github.com/elie222/rakazo) | 3.3k | Recent open-source Expo + TypeScript AI agent app — good modern reference for app structure. |
| [jorgenlt/smartbot](https://github.com/jorgenlt/smartbot) | 13 | Small Expo app chatting with several LLM providers — easy to read. |

### F. Local payments (Côte d'Ivoire)

- **CinetPay** (Orange Money, MTN MoMo, Moov, Wave, cards) is the most common
  aggregator in CI; community SDKs exist, e.g.
  [agazinakou/cinetpay](https://github.com/agazinakou/cinetpay) (TypeScript).
  Check the official CinetPay docs for the current API before integrating.
- Payment is **not** needed in the MVP (manual billing for pilot customers), but
  the subscription should later be payable by mobile money, in FCFA.

---

## 3. Proposed MVP

### Target user
The owner (or manager) of a small business in Abidjan — restaurant/maquis,
boutique, salon de coiffure, pharmacie, agence immobilière, auto-école —
who gets many repetitive WhatsApp questions ("C'est combien ?", "Vous êtes
ouverts ?", "Vous livrez à Cocody ?") and can't answer them all fast.

### Core promise
**"Votre assistant WhatsApp qui répond à vos clients 24h/24 — prêt en 5 minutes."**

### MVP user journey (the whole app in 5 screens)

1. **Inscription** — phone number + SMS/WhatsApp OTP (no email, no password).
2. **"Parlez-nous de votre business"** — pick a category (icons: 🍽️ Restaurant,
   👗 Boutique, 💇 Salon, 💊 Pharmacie, 🏠 Immobilier, ➕ Autre). Each category
   pre-fills smart questions and a ready-made assistant personality.
3. **Remplir les infos** (guided form, one question per screen):
   - Name, commune/quartier, Google Maps location, opening hours
   - Products/services & prices → **take a photo of your menu or price list and
     the AI extracts it** (big "wow" moment, avoids typing)
   - Delivery zones & fees, payment methods (Wave, Orange Money, cash…)
   - Optional: 3–5 common questions with answers
   - Tone: "Formel" / "Amical" / "Ivoirien décontracté"
4. **Tester mon assistant** — chat with it inside the app, as if you were a
   customer. Thumbs-down on a bad answer → "Quelle était la bonne réponse ?" →
   saved as a new FAQ. This is how the owner "trains" it without knowing it.
5. **Connecter WhatsApp** — one big button, scan QR (pilot) / Meta signup
   (later). Then the assistant is live.

After launch, the home screen shows:
- **Conversations** — list of WhatsApp chats handled by the assistant, with a
  red badge when the AI wasn't sure or the customer asked for a human.
- **"Je prends la main"** button per conversation — pauses the AI for that
  customer so the owner can answer personally (human handoff).
- **Simple stats** — messages answered today, customers served, time saved.
- **Notification** when a customer wants to order / book / speak to a human.

### In scope for MVP
- **iOS first** (pilot distributed via TestFlight), built with Expo React Native
  so the Android version comes almost free later (Android is the majority in CI)
- French UI, assistant answers in the customer's language (French, English;
  understands Nouchi/informal French reasonably well with modern LLMs)
- One business = one assistant = one WhatsApp number
- Category templates (5–6 categories)
- Photo → products/prices extraction
- In-app test chat + correction loop
- WhatsApp connection + conversation inbox + human takeover
- Push notifications
- Light on data: small screens, few images, works on low-end phones

### Out of scope for MVP (later versions)
- Visual flow builder (never, probably)
- Website widget, Facebook/Instagram channels
- Taking payments or orders inside the chat
- Large document / PDF knowledge bases (RAG)
- Multiple staff accounts, multiple assistants per business
- In-app subscription payment (bill pilot customers manually)
- Voice-note replies (but **transcribing incoming voice notes** is a strong
  "v1.1" candidate — very common usage in Abidjan)

### Success criteria for the pilot
- A non-technical owner sets up a working assistant in **under 10 minutes**
  without help.
- ≥ 70% of incoming customer questions answered correctly without owner
  intervention.
- ≥ 5 of 10 pilot businesses still using it after 4 weeks and willing to pay.

---

## 4. Suggested technical architecture (simple)

```
 ┌─────────────────────┐        ┌──────────────────────────────┐
 │  Mobile app (Expo)  │  HTTPS │  Backend (Node/TypeScript)   │
 │  - onboarding       │◄──────►│  - auth (phone OTP)          │
 │  - test chat        │        │  - business profiles         │
 │  - inbox / takeover │        │  - agent: prompt + LLM call  │
 └─────────────────────┘        │  - webhook from WhatsApp     │
                                └───────┬──────────────┬───────┘
                                        │              │
                         ┌──────────────▼───┐   ┌──────▼─────────┐
                         │ Postgres         │   │ LLM API        │
                         │ (e.g. Supabase)  │   │ (chat + vision │
                         └──────────────────┘   │  for menu OCR) │
                                        ▲       └────────────────┘
                                        │
                         ┌──────────────┴───────────────┐
                         │ Evolution API (self-hosted)  │◄──► WhatsApp
                         │ QR mode → Cloud API later    │
                         └──────────────────────────────┘
```

- **Mobile:** Expo (React Native + TypeScript), `react-native-gifted-chat`,
  Expo Notifications.
- **Backend:** Node.js + TypeScript (Fastify or Hono), or Supabase Edge
  Functions to move faster. Postgres via Supabase (auth, DB, storage, realtime
  for the inbox).
- **Agent logic:** for each incoming message → load business profile + last N
  messages → build system prompt from the profile → call LLM → reply via
  Evolution API. If the model signals low confidence or the customer asks for a
  human → flag the conversation and notify the owner.
- **LLM:** any strong hosted model with vision (for menu photos). Use a fast,
  cheap model for customer replies and a stronger one only for the one-off menu
  extraction. Keep the provider behind one small module so it can be swapped.
- **Hosting:** one small VPS (Docker: Evolution API + backend) is enough for the
  pilot.

### Data model (first draft)
- `users` (phone, name)
- `businesses` (owner_id, name, category, location, hours, tone, whatsapp_status)
- `catalog_items` (business_id, name, price_fcfa, description, available)
- `faqs` (business_id, question, answer, source: manual | correction)
- `conversations` (business_id, customer_phone, ai_paused, needs_attention)
- `messages` (conversation_id, role: customer | ai | owner, text, created_at)

---

## 5. Suggested roadmap

| Week | Deliverable |
|---|---|
| 0 | Apple Developer account opened (start now — an organization account needs a D-U-N-S number, which can take 1–2 weeks); Expo + EAS project set up |
| 1 | Clickable Expo prototype of the 5 screens on TestFlight; test it with 3–5 real business owners in Abidjan who use an iPhone |
| 2–3 | Backend + business profile + test chat working in the app (no WhatsApp yet) |
| 4 | Evolution API connection, real WhatsApp replies, inbox + takeover |
| 5 | Menu-photo extraction, push notifications (APNs via Expo), polish; onboard 5–10 pilot businesses via TestFlight |
| 6–9 | Pilot: measure answer quality, fix, add voice-note transcription; prepare Meta Cloud API migration and pricing in FCFA |

---

### iOS-specific notes
- **No Mac required:** Expo EAS Build compiles the iOS app in the cloud and
  uploads it to TestFlight.
- **Apple Developer Program** (paid yearly) is mandatory, even for TestFlight.
  Individual account = fast; organization account = app published under the
  company name but needs a D-U-N-S number.
- **TestFlight** is enough for the whole pilot (up to 10,000 testers, builds
  valid 90 days) — no App Store review needed beyond a light beta review.
- **App Store review later:** phone-number OTP login is fine; "Sign in with
  Apple" is only required if we add Google/Facebook login. Provide a demo
  account for reviewers.
- **Pilot recruiting:** make sure the pilot businesses' owners use an iPhone.

## 6. Open questions to decide together

1. **Pricing model:** monthly subscription in FCFA? Free tier with N messages?
2. **WhatsApp mode for the pilot:** accept QR-code risk, or go official from day 1?
3. ~~Which 1–2 business categories to start with?~~ **Decided:** restaurants /
   maquis, and boutiques — including online sellers (TikTok, Instagram,
   Facebook, WhatsApp status) with or without a physical shop.
4. ~~Brand name~~ **Decided: CréeTonAgent.** Tone is chosen by each business
   (professional / friendly / Ivorian casual).
