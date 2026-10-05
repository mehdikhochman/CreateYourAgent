# CréeTonAgent backend

The server behind CréeTonAgent. A small shop in Abidjan connects its WhatsApp
number; when a customer writes, the backend receives the message from Meta, lets
the assistant (Tiko) answer from the shop's saved profile (products, prices,
delivery zones, payment methods), and sends the reply on WhatsApp. When a
customer wants to order, or asks something the assistant can't answer, the owner
gets a push notification on the CréeTonAgent app (`prototypes/v2`). The owner can
also take over a conversation and reply as the shop.

This is **stage 1**: a working demo on Meta's free WhatsApp test number. The full
design is in [docs/architecture/BACKEND_SYSTEM_DESIGN.md](../docs/architecture/BACKEND_SYSTEM_DESIGN.md)
(sections 4 to 7).

## How a customer message travels

1. The customer writes to the shop on WhatsApp; Meta sends it to `POST /webhooks/meta`.
2. The API checks Meta's signature, stores the message once (its WhatsApp id is unique), queues a reply job 4 seconds later and answers Meta at once.
3. The worker runs the job. Messages that arrived during those 4 seconds are answered together.
4. If the owner has taken over, the worker only notifies the owner. Otherwise the assistant picks an action (a learned answer first, then Claude or the keyword rules).
5. The reply text is built from the shop's saved data, sent through Meta and stored; Meta then reports sent → delivered → read.
6. Orders and questions the assistant can't answer open an alert and send a push notification to the owner's phone.

## Folder map

Everything is in `src/`. Each folder is one module; the files at the top tie them together.

| Folder | What it holds |
| --- | --- |
| `auth/` | Login with phone number + 6-digit code, sessions, access and refresh tokens. |
| `shop/` | The shop profile, catalogue, learned answers and corrections, the test chat, linking the WhatsApp number, and `GET /v1/sync`. |
| `conversations/` | The inbox: conversations and messages, owner replies, take over / give back, alerts, and the reply job the worker runs. |
| `jobs/` | The job queue (a Postgres table) and the worker loop that runs jobs, with retries. |
| `push/` | Push notifications to the owner's phone through Expo. |
| `whatsapp/` | Meta's webhook (check the signature, read the payload, store messages) and the sender that calls Meta's Graph API. |
| `engine/` | The assistant: chooses an action (Claude or keyword rules), builds the reply text, checks it. Also the eval set (`npm run eval`). |
| `domain/` | Shared types, Abidjan constants (zones, payment methods), text and phone helpers, and the JSON shapes sent to the app. |
| `db/` | Connection pool, SQL migrations (`migrations/001_init.sql` is the schema) and the migrate command. |
| `http/` | Builds the Hono app, error format, request validation. |
| `test/` | Test helpers: a fresh test database, fakes for the outside world, seed functions. |
| `scripts/` | `seed-demo.ts`, the demo shop (`npm run seed`). |

Top-level files: `config.ts` reads the environment variables, `deps.ts` lists what
the code needs from the outside world (database, clock, SMS, push, WhatsApp,
assistant, job queue), `wiring.ts` builds the real ones, `app.ts` assembles the
routes, `server.ts` starts the API and `worker.ts` starts the worker. Tests swap
the outside world for fakes (`test/fakes.ts`), so they never call Meta or Claude.

## Stack, and why

| Choice | Why |
| --- | --- |
| **Node.js 22 + TypeScript** | Same language as the Expo app, so types can be shared. |
| **Hono** (web framework) + **Zod** (checks request bodies) | Small and fast; routes are easy to test without starting a server (`app.request(...)`). |
| **Postgres** for everything, **including the job queue** (`jobs` table) instead of Redis | One thing to install, back up and pay for. At 50 shops the load is about one message a minute, which Postgres handles easily. A unique `key` on a job gives the 4-second debounce for free. |
| **Claude Haiku 4.5** to choose the action | Fast and cheap (about 2–3 F per reply). The model only *chooses* (« price of the bag », « wants to order »); the text with prices comes from the database, so it can't invent a price. |
| **Offline keyword assistant** when there is no `ANTHROPIC_API_KEY` | Everything works on a laptop with no API key and no cost; same keyword rules as the prototype. |
| **Meta WhatsApp Cloud API** | The official API: no risk of the number being banned. |
| **Expo push** | Free, already part of the Expo app, one API for iPhone and Android. |
| **Vitest** + a real Postgres in tests | Tests run the real SQL, so they catch query bugs. |

## Quick start

You need **Node.js 22.9 or newer** (`node -v`; the current LTS is fine; the npm
scripts use Node's built-in `.env` loading, which 22.9 added), **Docker Desktop**
(it runs Postgres for you) and a terminal. Commands are for macOS / Linux, or Git
Bash on Windows.

**1. Start Postgres.** From the `backend/` folder:

```bash
cd backend
docker compose up -d
```

This runs Postgres 16 on `localhost:5432` (user, password and database are all
`cta`). Your data survives restarts. `docker compose down` stops it;
`docker compose down -v` also erases the data.

**2. Create your `.env` file** (your local settings; git ignores it):

```bash
cp .env.example .env
```

Open `.env` and fill in:

- `JWT_SECRET` and `OTP_SECRET`: two **different** long random strings (32
  characters minimum). Generate each one with
  `openssl rand -base64 48`, or, without openssl,
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`.
- `AUTH_TEST_CODES`: your phone number and a fixed code, e.g.
  `+2250700000000:123456`. That number can then always log in with `123456`.
  (Other numbers work too: stage 1 has no SMS provider, so their code is printed
  in the API logs.)
- Leave `DATABASE_URL` as it is if you use `docker compose`.
- `ANTHROPIC_API_KEY` is optional: empty = the free keyword assistant.
- The `META_*` values are only needed for real WhatsApp messages: see
  [docs/guides/WHATSAPP_TEST_NUMBER.md](../docs/guides/WHATSAPP_TEST_NUMBER.md).

All variables are listed in [Environment variables](#environment-variables).
The API, the worker, `migrate`, `seed` and `eval` read `backend/.env`; a variable
already set in your shell wins. Tests don't read it (see [Tests](#tests)).

**3. Install the packages and create the tables:**

```bash
npm install
npm run migrate
```

`migrate` applies the SQL files in `src/db/migrations/` that haven't run yet. It is
safe to run it again.

**4. Create the demo shop** « Awa Fashion » (owner Awa, 4 products, delivery to
Cocody and Yopougon, Wave and Orange Money):

```bash
npm run seed -- --phone +2250700000000
```

Use the same phone as in `AUTH_TEST_CODES`. Once your Meta test number is set up,
run it again with `--phone-number-id <id> --display-phone "<number>"` to link it
(see the WhatsApp guide). Running the seed again never duplicates anything; it
resets the demo profile and the 4 demo products and keeps everything else.

**5. Start the API and the worker**, each in its own terminal (both restart when
you save a file):

```bash
npm run dev          # terminal 1: the API on http://localhost:3000
npm run dev:worker   # terminal 2: the worker (assistant replies, sending, notifications)
```

Logs are one JSON object per line. At start-up the API and the worker say which
assistant they use: `assistant: Claude` or `assistant: offline keyword rules`.
Then, for each WhatsApp message, the API prints `meta webhook: received` and the
worker prints `reply: sent`. Anything else is a warning or an error that says
what went wrong.

**6. Check it's alive:** `curl http://localhost:3000/health` prints `{"ok":true}`.

### Try it

Log in with the fixed code, then call the API with the access token:

```bash
curl -X POST http://localhost:3000/v1/auth/otp \
  -H 'content-type: application/json' -d '{"phone":"+2250700000000"}'

curl -X POST http://localhost:3000/v1/auth/verify \
  -H 'content-type: application/json' \
  -d '{"phone":"+2250700000000","code":"123456","deviceName":"laptop","platform":"web"}'
# → {"accessToken":"eyJ…","refreshToken":"…",…}

TOKEN=eyJ…   # paste the accessToken (valid 1 hour)

curl http://localhost:3000/v1/shop -H "authorization: Bearer $TOKEN"

curl -X POST http://localhost:3000/v1/assistant/test \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"messages":[{"role":"customer","text":"Bonjour, le sac est combien ?"}]}'
# → {"reply":{"text":"…**8 500 F**…","confident":true},"meta":{"action":"price","source":"model"}}
```

The Expo app (`prototypes/v2`) still runs on its built-in simulation; it will use
these same endpoints. To reach your laptop from a phone, use your laptop's local IP
(`http://192.168.x.x:3000`, same Wi-Fi) or the tunnel URL from the WhatsApp guide.

**Real WhatsApp messages:** follow
[docs/guides/WHATSAPP_TEST_NUMBER.md](../docs/guides/WHATSAPP_TEST_NUMBER.md)
(Meta developer account, test number, Cloudflare tunnel, webhook).

### Tests

```bash
npm test                 # all tests
npx vitest run src/shop  # one folder
npm run typecheck        # TypeScript errors only
```

Tests need Postgres. They use the database in `TEST_DATABASE_URL`, default
`postgres://cta:cta@localhost:5432/cta_test` (works with `docker compose`, nothing to
set). **That database is dropped and recreated on every run**, so never point it at
a database you care about. Each test starts from empty tables. Tests never call
Meta, Claude or Expo: fakes stand in for them.

Tests don't read `.env`. To use another Postgres, set the variable in the shell:

```bash
TEST_DATABASE_URL=postgres://me:secret@localhost:5433/cta_test npm test
```

## Environment variables

| Variable | Needed? | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection. The `.env.example` value matches `docker compose`. |
| `PORT` | no (3000) | API port. |
| `JWT_SECRET` | yes | Signs access tokens. 32+ random characters. |
| `OTP_SECRET` | yes | Hashes login codes before they are stored. 32+ random characters, different from `JWT_SECRET`. |
| `AUTH_TEST_CODES` | no | `+225…:123456,+225…:654321`: numbers that log in with a fixed code and never get an SMS. For you, and later for App Store review. |
| `META_APP_SECRET` | for WhatsApp | Meta app secret; checks that webhooks really come from Meta. |
| `META_VERIFY_TOKEN` | for WhatsApp | Any string you choose; Meta sends it back once when you save the webhook URL. |
| `META_ACCESS_TOKEN` | for WhatsApp | Token that lets the worker send messages (use a system user token, it doesn't expire). |
| `META_GRAPH_VERSION` | no (`v24.0`) | Graph API version in Meta's URLs. |
| `ANTHROPIC_API_KEY` | no | Claude API key. Empty = offline keyword assistant. |
| `ASSISTANT_MODEL` | no (`claude-haiku-4-5`) | Claude model that chooses the action. |
| `EXPO_ACCESS_TOKEN` | no | Only if you turn on "enhanced push security" in Expo. |
| `REPLY_DEBOUNCE_SECONDS` | no (4) | How long to wait for more customer messages before answering. |
| `TEST_DATABASE_URL` | tests only | See [Tests](#tests). |

## API

JSON API. Routes under `/v1` (except `/v1/auth/*`) need
`Authorization: Bearer <access token>`. Errors always look like
`{"error":{"code":"not_found","message":"Not found"}}`. Ids of catalogue items,
learned answers and owner messages are made by the app, so the app can safely
retry a request after a dropped connection. A row of another shop answers `404`.

| Method & path | Purpose |
| --- | --- |
| **Auth** | |
| `POST /v1/auth/otp` | `{phone}` → `204`. Sends a 6-digit code (stage 1: printed in the API logs). At most 3 per 15 min per number and 10 per hour per IP. |
| `POST /v1/auth/verify` | `{phone, code, deviceName?, platform?}` → `{accessToken, refreshToken, expiresIn, isNew, owner, shopId}`. 5 tries per code. Creates the owner and an empty shop on first login. |
| `POST /v1/auth/refresh` | `{refreshToken}` → a new token pair. The old refresh token stops working. |
| `POST /v1/auth/logout` | `204`. Ends this session and stops its push notifications. |
| **Shop** | |
| `GET /v1/shop` · `PATCH /v1/shop` | Read or edit the profile (any field of « Mon assistant »). The next customer message uses the new values. |
| `PUT /v1/shop/catalog/:id` · `DELETE …` | Create or update a product (`{name, priceFcfa, available?, position?}`, `priceFcfa: null` = « prix sur demande »), or delete it. |
| `PUT /v1/shop/answers/:id` · `DELETE …` | Create, update or delete a learned answer (question → action). |
| `POST /v1/messages/:id/correction` | « Mauvaise réponse » on an assistant reply: `{action, productId?, answer?}` → a learned answer for the customer's question. |
| `POST /v1/assistant/test` | The test chat: `{messages: [{role, text}]}` → `{reply: {text, confident, alert?}, meta: {action, source}}`. Same engine as WhatsApp; 200 per shop per day. |
| `GET` · `PUT` · `DELETE /v1/channels/whatsapp` | Status of the WhatsApp link; link a number by its Meta `{phoneNumberId, displayPhone}` (stage 1, instead of Embedded Signup); unlink it. |
| `GET /v1/sync?cursor=<rev>` | Everything that changed since `cursor`: `{profile, catalog, answers, conversations, messages, alerts, cursor, hasMore}`. Called on app start, on resume and on each push. |
| **Conversations** | |
| `GET /v1/conversations?filter=attention\|all&before=` | The inbox (« À traiter » / « Toutes »), newest first: `{conversations, alerts, nextBefore}`. Pass `nextBefore` back as `before` for the next page. |
| `GET /v1/conversations/:id/messages?before=` | Older messages, page by page: `{messages, nextBefore}`. |
| `POST /v1/conversations/:id/messages` | `{clientId, text}`: the owner replies as the shop and the assistant stays paused. `409` when the customer's last message is more than 24 h old (WhatsApp's rule). |
| `POST /v1/conversations/:id/takeover` · `/release` · `/read` | « Je prends la main » (pause the assistant for this customer), « Rendre la main », mark as read. |
| `POST /v1/alerts/:id/done` | Remove an alert from « À traiter ». |
| `PUT /v1/devices/current` | `{pushToken, platform}`: where to send this phone's push notifications. |
| **Public** | |
| `GET /webhooks/meta` | Meta's one-time check when you save the webhook URL (answers `hub.challenge` if `hub.verify_token` matches). |
| `POST /webhooks/meta` | Messages, delivery statuses and echoes from Meta. Checked with `X-Hub-Signature-256`; raw payloads kept in `webhook_events`. |
| `GET /health` | `{"ok":true}`, for an uptime monitor. |

## The assistant

The assistant never writes prices itself. For every customer message:

1. **Learned answers first.** If the message matches a question the owner taught
   (same words, ignoring case, accents and punctuation), its action runs directly.
   No AI call, no cost.
2. **Otherwise a decider chooses an action** (`catalog`, `price`, `delivery`,
   `payment`, `hours`, `order`, `handoff`, …) plus the products or zone concerned:
   - **Claude** (`ASSISTANT_MODEL`, Haiku 4.5 by default) when `ANTHROPIC_API_KEY`
     is set. It reads the shop profile, the learned answers and the last messages.
   - **Offline keyword rules** when there is no key: free and instant, but they
     understand less (fixed word lists, like the prototype).
3. **The reply is built from the shop's data**, in the shop's tone. Before that,
   a guard checks the choice: products and zones that don't exist are dropped,
   and Claude's optional short opening line is removed if it contains a digit
   (a price or a delay could hide there) or a promise (« remise », « en stock »…).
4. **When in doubt, hand over:** the customer is told the owner will answer, and
   the owner gets an alert. Same if Claude is down or too slow.

`npm run eval` runs the eval set (« this message, this shop → this action ») on the
current decider and prints the score. Run it before and after changing the prompt
or the keyword rules. It needs no database. With `ANTHROPIC_API_KEY` set it calls
Claude (a few francs per run); without it, it scores the keyword rules.

When the owner taps « Mauvaise réponse », the correction becomes a learned answer
(`POST /v1/messages/:id/correction`) and applies from the next message.

## What stage 1 leaves out

On purpose, to get a working demo first (see the
[design doc](../docs/architecture/BACKEND_SYSTEM_DESIGN.md), sections 7 and 9):

- **Payments and subscriptions**: no Wave or Orange Money, no trial, no quotas or
  usage counting. Every shop is treated as active.
- **Real SMS**: login codes are printed in the API logs, or fixed with
  `AUTH_TEST_CODES`. The Orange SMS API comes later.
- **Meta Embedded Signup and coexistence**: a number is linked by its Phone number
  ID (with the seed or `PUT /v1/channels/whatsapp`) and one `META_ACCESS_TOKEN`
  serves every shop. Shops connecting their own number while keeping the WhatsApp
  Business app comes later; echo webhooks are already stored as owner messages.
- **Also later**: menu photo reading, shop logo, stats, the WhatsApp message to
  the owner when a push stays unseen, voice note transcription, admin endpoints.

## Known limitations

- **Text only**: the assistant doesn't understand voice notes, photos or stickers.
  The customer gets a short holding reply and the owner an alert
  (« Note vocale reçue »).
- **24-hour window**: WhatsApp refuses free-form replies more than 24 hours after
  the customer's last message (Meta error 131047). There are no paid template
  messages to restart a conversation.
- **Meta test number**: it can only message up to 5 phone numbers that you
  registered in Meta's dashboard.
- **Rate limits live in memory** (login codes per IP, test chat per day): they reset
  when the API restarts and are counted per process.
- **Sync edge case**: a change written in a slow transaction can, rarely, be
  missed by a sync that ran at the same moment (see the comment in
  `src/shop/sync.ts`). The next change to that row brings it back.
- **No clean-up yet**: `webhook_events`, failed jobs and old login codes are never
  deleted (finished jobs are).
- **No staff accounts**: one owner per shop.
- **Unsigned webhooks in development**: without `META_APP_SECRET`, the API accepts
  unsigned webhooks (with a warning) so you can test with curl. In production it
  refuses them.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Invalid configuration (check your .env)` | A required variable is missing or too short. The message names it. Check that `backend/.env` exists. |
| `ECONNREFUSED … 5432` / `Cannot reach Postgres` | Postgres isn't running: `docker compose up -d`, then `docker compose ps`. |
| Port 5432 already in use | Another Postgres runs on your laptop. Stop it, or change the port in `docker-compose.yml` (`"5433:5432"`) and in `DATABASE_URL`. |
| `relation "owners" does not exist` | Run `npm run migrate`. |
| Login code not received | Normal: there is no SMS in stage 1. Read it in the API logs (`sms (console, not sent)`), or use `AUTH_TEST_CODES`. |
| `401 unauthorized` from `/v1/...` | The access token expired (1 hour). Log in again or call `/v1/auth/refresh`. |
| WhatsApp messages get no reply | See the troubleshooting table in the [WhatsApp guide](../docs/guides/WHATSAPP_TEST_NUMBER.md#troubleshooting). |
