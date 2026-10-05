# Connect Meta's free WhatsApp test number to your local backend

At the end of this guide you send a WhatsApp message from your own phone to a test
number, and the assistant running on your laptop answers it.

Meta gives every developer a free **test number** (a US number like `+1 555 …`).
It can talk to **up to 5 phone numbers** that you register. That's all stage 1
needs: no business verification, no payment, no real shop number.

**Time:** about 45 minutes the first time, then 2 minutes each day (see
[Every time you come back](#every-time-you-come-back)).

**You need:**

- A Facebook account, and a phone with WhatsApp (your "customer" phone).
- The backend running on your laptop: follow the Quick start in
  [backend/README.md](../../backend/README.md) first (Postgres, `.env`,
  `npm run migrate`, `npm run seed`).
- `cloudflared`, to make your laptop reachable from the internet (step 10).

> **Meta's dashboard changes often.** Steps marked *(Meta dashboard)* follow
> Meta's screens as of October 2026. **Menu names may differ slightly**, and
> buttons move. Look for the closest wording: the values you need (Phone number
> ID, App secret, access token) are always there somewhere.

## How it fits together

```
your phone (WhatsApp)
   │  "Bonjour, vous livrez à Cocody ?"
   ▼
Meta's test number ──► Meta Cloud API ──► https://<random>.trycloudflare.com/webhooks/meta
                                                      │ (Cloudflare tunnel)
                                                      ▼
                                          your laptop: API on localhost:3000
                                                      │ stores the message, queues a reply job
                                                      ▼
                                          worker: assistant → reply ──► Meta ──► your phone
```

Meta must reach your API over **public HTTPS**. Your laptop has no public address,
so a **tunnel** gives it a temporary one: Cloudflare receives the request on a
public URL and forwards it to `localhost:3000`.

## 1. Create a Meta developer account *(Meta dashboard)*

1. Go to <https://developers.facebook.com> and log in with Facebook.
2. Click **Get started** (or **My Apps**), accept the terms and confirm your
   phone number or e-mail if asked.

## 2. Create a Business app *(Meta dashboard)*

1. **My Apps → Create app**.
2. When asked what the app is for, pick the WhatsApp use case
   (« Connect with customers through WhatsApp ») or **Other**, then the app type
   **Business**.
3. Name it, e.g. `CreeTonAgent Dev`, and give your e-mail.
4. If Meta asks for a **business portfolio**, pick yours or create one (a name is
   enough; no verification is needed for the test number).

You don't need to switch the app to **Live** mode for the test number (but see
[Troubleshooting](#troubleshooting) if webhooks never arrive).

## 3. Add the WhatsApp product *(Meta dashboard)*

In the app dashboard, find **WhatsApp** (under **Add products**, or already there
if you chose the WhatsApp use case) and click **Set up**.

Meta creates for you a test **WhatsApp Business Account** (WABA, the container for
WhatsApp numbers) and a **test phone number**.

## 4. Find the Phone number ID *(Meta dashboard)*

Open **WhatsApp → API Setup** (sometimes called **Getting started** or **Quickstart**).

- The **From** field shows the test number, e.g. `+1 555 012 3456`. Note it: it's
  your `--display-phone`.
- Just below it: **Phone number ID**, a long number like `123456789012345`. Copy
  it: it's your `--phone-number-id`. It is **not** the phone number itself.
- Also note the **WhatsApp Business Account ID**: you may need it for
  troubleshooting.

## 5. Register your phone as a recipient *(Meta dashboard)*

Still on **API Setup**, in the **To** field, choose **Manage phone number list**
(or **Add phone number**):

1. Add your phone number with the country code (`+225 07 …`).
2. Meta sends a code to that phone on WhatsApp (or by SMS). Enter it.
3. Repeat for other test phones: **5 numbers maximum**.

The test number can only exchange messages with these numbers.

## 6. Check with the hello_world template *(Meta dashboard)*

On **API Setup**, pick your phone in **To** and click **Send message**. It sends
Meta's ready-made `hello_world` template using a **temporary access token** shown
on the same page.

Your phone should receive « Hello World » from the test number within seconds.
Save that number in your contacts as « Awa Fashion (test) ». If nothing arrives,
fix this first (check the number in the recipient list): nothing below can work
until it does.

## 7. Create a permanent access token *(Meta dashboard)*

The temporary token from step 6 expires after about 24 hours. The worker needs a
token that doesn't expire: a **system user** token (a "robot" user that belongs to
your business, not to you).

1. Go to <https://business.facebook.com/settings> (**Business settings**; in the
   newer **Meta Business Suite** it is under **Settings → Users**).
2. **Users → System users → Add**. Name: `cta-dev`. Role: **Admin**. Create.
3. With the system user selected, click **Assign assets** (or **Add assets**):
   - **Apps** → your app → **Full control** (or **Manage app**). Save.
   - If **WhatsApp accounts** lists your test account, assign it too with full
     control.
4. Click **Generate new token**:
   - App: your app.
   - Expiration: **Never**.
   - Permissions: tick **`whatsapp_business_messaging`** and
     **`whatsapp_business_management`**.
   - **Generate**, then **copy the token now**: Meta shows it only once.

Put it in `backend/.env`:

```
META_ACCESS_TOKEN=EAAG…the long token…
```

## 8. Copy the App secret *(Meta dashboard)*

In the app dashboard: **App settings → Basic → App secret → Show** (Meta asks for
your password). Copy it into `backend/.env`:

```
META_APP_SECRET=0123456789abcdef…
```

Meta signs every webhook with this secret (the `X-Hub-Signature-256` header).
The API checks the signature, so nobody else can post fake messages to your URL.
Don't confuse it with the **App ID** shown just above.

## 9. Choose a verify token

`META_VERIFY_TOKEN` is a password **you invent**. Meta sends it back once, when you
save the webhook URL (step 11), so the API knows the request comes from your setup.
Generate one, for example with `openssl rand -hex 16`, and put it in `.env`:

```
META_VERIFY_TOKEN=3f9c2b7a1d4e…
```

Your `.env` now has the four Meta values:

```
META_APP_SECRET=…
META_VERIFY_TOKEN=…
META_ACCESS_TOKEN=…
META_GRAPH_VERSION=v24.0
```

**Restart the API and the worker** (Ctrl+C, then `npm run dev` and
`npm run dev:worker` again): they read `.env` only when they start.

## 10. Start a Cloudflare quick tunnel

Install `cloudflared` (free; no Cloudflare account needed for a quick tunnel):

- macOS: `brew install cloudflared`
- Windows: `winget install --id Cloudflare.cloudflared`
- Linux: download the package for your distribution from
  <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>

In a **third terminal** (keep the API and the worker running):

```bash
cloudflared tunnel --url http://localhost:3000
```

After a few seconds it prints a box with a URL like
`https://random-words-here.trycloudflare.com`. Check that it reaches your API by
opening `https://random-words-here.trycloudflare.com/health` in a browser: you
should see `{"ok":true}`.

Keep this terminal open. **The URL changes every time you restart `cloudflared`**
(and when your laptop sleeps for long), and you then have to update it in Meta
(step 11).

## 11. Set the webhook *(Meta dashboard)*

First check the verification yourself (replace `<token>` with your
`META_VERIFY_TOKEN`):

```bash
curl "https://random-words-here.trycloudflare.com/webhooks/meta?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=42"
```

It must print `42`. `Forbidden` means the token doesn't match what the API read
from `.env`.

Then in the app dashboard, open **WhatsApp → Configuration** and edit **Webhook**:

1. **Callback URL**: `https://random-words-here.trycloudflare.com/webhooks/meta`
   (your tunnel URL + `/webhooks/meta`).
2. **Verify token**: your `META_VERIFY_TOKEN`.
3. Click **Verify and save**. Meta calls your API once; the API answers with the
   challenge and Meta saves the URL.
4. Under **Webhook fields**, click **Manage** and **Subscribe** to **`messages`**
   (customer messages and delivery statuses).

Later, when a real shop number is connected with coexistence (the owner keeps the
WhatsApp Business app), also subscribe to **`smb_message_echoes`**: it sends a copy
of what the owner types in the app. The test number doesn't need it.

Meta's **Test** button next to a field sends a fake example. The API then logs
`whatsapp: event for an unknown or disconnected number, skipped`: that's normal,
the example uses a made-up Phone number ID.

## 12. Link the test number to the demo shop

From `backend/`, with the values from step 4:

```bash
npm run seed -- --phone +2250700000000 --phone-number-id 123456789012345 --display-phone "+1 555 012 3456"
```

`--phone` is the owner's login phone (the one in `AUTH_TEST_CODES`), not the
test number. The script links the Phone number ID to « Awa Fashion » and prints
what it did. Safe to run again.

## 13. Send a message

From a phone registered in step 5, send to the test number on WhatsApp:

> Bonjour, vous livrez à Cocody ?

What happens:

1. Meta calls your API through the tunnel. The API stores the raw payload (table
   `webhook_events`) and the message (table `messages`), and prints:
   ```
   {"level":"info","msg":"meta webhook: received","webhookEventId":1,"events":1,"newMessages":1}
   ```
2. About 4 seconds later (`REPLY_DEBOUNCE_SECONDS`) the worker runs the reply job
   and prints:
   ```
   {"level":"info","msg":"reply: sent","conversationId":"…","messageId":"…"}
   ```
3. Your phone receives the answer, with the delivery fee from the shop profile.

Then Meta reports the reply as sent, delivered and read: each report is one more
`meta webhook: received` line in the API terminal, with `"newMessages":0`. That's
normal.

Any other line is a warning or an error that says what went wrong: keep an eye
on the worker terminal, and see [Troubleshooting](#troubleshooting).

Try also « Le sac est combien ? », « Je veux payer la robe » (an order: the owner
gets an alert) and two quick messages in a row (one answer for both).

To look inside the database (from `backend/`):

```bash
docker compose exec postgres psql -U cta -d cta -c \
  "SELECT role, status, error, left(text, 60) AS text FROM messages ORDER BY created_at DESC LIMIT 6"
```

A customer message is `received`; a reply goes `queued → sent → delivered → read`,
or `failed` with the reason in the `error` column (the owner sees this text in the
app: a short French sentence for the common cases, otherwise Meta's message). Two
more useful queries, to run the same way
(`docker compose exec postgres psql -U cta -d cta -c "…"`):

```sql
-- Did Meta's webhooks arrive? (processed_at is set when it went fine, error when it failed)
SELECT id, received_at, processed_at, error FROM webhook_events ORDER BY id DESC LIMIT 5;
-- Jobs that failed for good, with the reason
SELECT kind, attempts, last_error FROM jobs WHERE failed_at IS NOT NULL;
```

## Every time you come back

1. `docker compose up -d`, then `npm run dev` and `npm run dev:worker`.
2. `cloudflared tunnel --url http://localhost:3000`: **new URL**.
3. In Meta: **WhatsApp → Configuration → Webhook → Edit**, paste the new
   `https://…/webhooks/meta`, same verify token, **Verify and save**. The
   `messages` subscription stays.

Meta retries for some time the webhooks it couldn't deliver while your laptop was
off, so old messages may arrive when you come back. Replies to messages older than 24
hours fail with error 131047 (see below).

## Troubleshooting

Start from what the API and worker terminals print (step 13). The lines quoted
below are the `msg` of those JSON lines.

| What you see | Likely cause | Fix |
| --- | --- | --- |
| **Verify and save** fails ("callback URL or verify token couldn't be validated") | API not running, tunnel stopped, old tunnel URL, `/webhooks/meta` missing, or the token differs | Run the `curl` check of step 11. Make sure the API was restarted after editing `.env`, and that `META_VERIFY_TOKEN` is not empty. |
| You send a message and **nothing** appears in the API terminal (no `meta webhook: received`, no new row in `webhook_events`) | 1. A wrong `META_APP_SECRET`: the API answers Meta `401 invalid_signature` (bad signature) and drops the request **without printing or storing anything**. 2. Or Meta doesn't call you at all. | **Test the secret first:** empty `META_APP_SECRET` in `.env` and restart the API. If messages now arrive (the API warns `accepting an unsigned payload`), the secret was wrong: copy it again from **App settings → Basic → App secret** (not the App ID, and from the same app as the webhook), put it back and restart. |
| Still nothing with the secret test above | Meta doesn't send: `messages` field not subscribed, the Callback URL is an old tunnel URL, or the app isn't subscribed to the WhatsApp account | Check step 11. Then subscribe the app to the WABA (ID from step 4): `curl -X POST "https://graph.facebook.com/v24.0/<WABA_ID>/subscribed_apps" -H "Authorization: Bearer <META_ACCESS_TOKEN>"` must print `{"success":true}`. Last resort: switch the app to **Live** mode (needs a privacy policy URL in **App settings → Basic**). |
| API logs `whatsapp: event for an unknown or disconnected number, skipped` | The Phone number ID isn't linked to a shop (or it's Meta's **Test** button example) | Run the seed with the right `--phone-number-id` (step 12). |
| API logs `meta webhook: received` with `"newMessages":1`, but no reply and nothing in the worker terminal | The worker isn't running | Start `npm run dev:worker` in its own terminal, from `backend/`. It picks up the waiting reply at once. |
| Worker logs `reply: the shop has no connected WhatsApp number` | The number was unlinked after the message arrived (`DELETE /v1/channels/whatsapp`, or the seed moved it to another shop) | Run the seed again with `--phone-number-id` (step 12), then send a new message. |
| Worker logs `job failed, will retry` | Meta refused the reply, or couldn't be reached. The worker tries 5 times (waiting 5, 10, 20 then 40 seconds), then logs `reply: could not send on WhatsApp`, marks the reply `failed` and alerts the owner (« Réponse non envoyée ») | Read the `error` in that line: it is Meta's message, usually one of the rows below. |
| Error `META_ACCESS_TOKEN is not set` | Token missing in `.env` (the worker also warns about it at start-up) | Add it (step 7) and restart the worker. |
| Error **131030** "Recipient phone number not in allowed list"; the reply's `error` says « Numéro non autorisé… » | The test number can only write to registered numbers. No retry for this one | Add and verify the phone in step 5. If it's there, compare it with the `from` number in the webhook (`webhook_events`): they must match. |
| Error **131047** "Re-engagement message"; the reply's `error` says « Plus de 24 h : le client doit réécrire ». The API may log it as `whatsapp: message delivery failed` with `"metaCode":131047` | More than 24 hours since the customer's last message: WhatsApp refuses free-form replies | Send a new message from the phone; the reply then works. |
| Error **190** "Session has expired" / "Error validating access token" | You used the temporary token from step 6 (it lasts about 24 h) | Use the system user token (step 7), restart the worker. |
| Error **100**, **10** or **200** (object doesn't exist / permission) | Wrong Phone number ID, or the token lacks a permission, or the system user isn't assigned to the app / WhatsApp account | Check step 4; generate the token again with both permissions and the assets of step 7. |
| API logs `whatsapp: message delivery failed` with another `metaCode` | Meta accepted the reply, then couldn't deliver it (it tells us later, by webhook) | Look the code up in Meta's list below. |
| Replies sound basic; at start-up the API and worker log `assistant: offline keyword rules` | No `ANTHROPIC_API_KEY`: the free keyword assistant answers | That's fine for testing. For Claude, add the key to `.env` and restart the API and the worker. |
| No reply, but the owner gets a notification | The owner took over this conversation (« Je prends la main ») | `POST /v1/conversations/:id/release`, or wait (2 hours by default). |
| The tunnel URL stopped working | `cloudflared` restarted or the laptop slept | Start it again and update the Callback URL ([Every time you come back](#every-time-you-come-back)). |

Meta's full list of error codes:
<https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes>
