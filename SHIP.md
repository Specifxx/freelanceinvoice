# Ship checklist

A linear runbook from an empty Vercel account to a live site. Follow in order.

**Ship in two stages.** The app runs with only a database and an auth secret —
Stripe is not required to go live. Stage 1 puts the free generator and the four
niche landing pages on the internet in about half an hour, which starts the SEO
clock (PLAN.md §9 risk 7: ranking takes months, so the pages need to exist
before you need them). Stage 2 turns on payments once your Stripe account is
approved for Connect.

---

## Stage 1 — get it live (~30 min, no Stripe needed)

### 1. Domain

Buy one. Point nothing yet; Vercel gives you the DNS records in step 5.

### 2. Database — Neon

1. neon.tech → new project → region closest to your users.
2. Copy the **pooled** connection string. It has `-pooler` in the hostname.
   Use the pooled one — the app sets `prepare: false` precisely so it works
   through a transaction-mode pooler, and serverless functions will exhaust a
   direct connection quickly.
3. Keep the **direct** (non-pooled) string too. Migrations want it.

### 3. Auth secret

```bash
openssl rand -base64 32
```

Save it. Rotating this later signs every user out.

### 4. Email — Resend

1. resend.com → **Domains** → add `mail.yourdomain.com` (a subdomain, not the
   apex — keeps invoice sending reputation separate from your personal mail).
2. Add the SPF, DKIM and DMARC records it gives you at your registrar.
3. Wait for verification (usually minutes).
4. **API Keys** → create one → `RESEND_API_KEY`.
5. `EMAIL_FROM` = `invoices@mail.yourdomain.com`.
6. **Webhooks** → add endpoint `https://yourdomain.com/api/webhooks/resend`,
   events `email.delivered`, `email.bounced`, `email.complained` → copy the
   signing secret into `RESEND_WEBHOOK_SECRET`. The endpoint verifies the Svix
   signature and returns **503 until this is set**, so delivery and bounce
   events simply will not record without it.

> If you skip this, the app still runs — every email prints to the Vercel
> function log instead, including sign-in links. Fine for a smoke test, useless
> for real users.

### 5. Deploy to Vercel

1. vercel.com → **Add New → Project** → import `Specifxx/freelanceinvoice`.
2. Framework preset: Next.js. No build command overrides.
3. Set environment variables (Production, Preview, Development):

   | Variable | Value |
   |---|---|
   | `APP_URL` | `https://yourdomain.com` — **no trailing slash** |
   | `AUTH_SECRET` | from step 3 |
   | `DATABASE_URL` | Neon **pooled** string |
   | `RESEND_API_KEY` | from step 4 |
   | `RESEND_WEBHOOK_SECRET` | from step 4.6 |
   | `EMAIL_FROM` | `invoices@mail.yourdomain.com` |
   | `CRON_SECRET` | `openssl rand -base64 32` (a second, different one) |
   | `CRON_BUDGET_MS` | `8000` on Hobby, `50000` on Pro — see "Which Vercel plan" |

   `APP_URL` is used to build every absolute link in emails and every Stripe
   redirect. If it is wrong or has a trailing slash, invoice links break.
4. Deploy.
5. **Settings → Domains** → add your domain, add the DNS records at your
   registrar.

### 6. Run migrations

Once, against production, from your machine:

```bash
git clone https://github.com/Specifxx/freelanceinvoice && cd freelanceinvoice
npm install
DATABASE_URL="<neon DIRECT string>" npm run db:migrate
```

Use the **direct** string here, not the pooled one — migrations run DDL in a
single session.

### 7. Smoke test stage 1

- [ ] `https://yourdomain.com` loads
- [ ] `/photography-invoice-template` loads and shows photography line items
- [ ] `/free-invoice-generator` — fill it in, preview updates live
- [ ] **Download PDF** returns a real PDF
- [ ] Enter your email → **Continue** → the sign-in email arrives (check spam;
      if it lands there, your DNS records in step 4 are not right yet)
- [ ] Click the link → a **Confirm sign-in** screen → tap it → you land on the
      invoice you were building, already yours
- [ ] **Do this one on your phone.** Build an invoice on your laptop, request
      the link there, open the email on your phone. The invoice must come with
      you. This is the single most important flow in the product and the one
      most likely to regress.
- [ ] `/sitemap.xml` lists the four niche pages
- [ ] `curl -I https://yourdomain.com/i/anything | grep -i x-robots` returns
      `noindex`

### 8. Search Console

Add the property, submit `https://yourdomain.com/sitemap.xml`. Do this on day
one — it is the whole distribution plan and it compounds slowly.

**You are live.** People can create and download invoices. Sending works. Stop
here if you want; the rest can wait.

---

## Stage 2 — turn on card payments (Stripe Connect)

This is what makes an invoice payable in one tap and self-marking as paid.

1. stripe.com → create account → complete your own business verification.
2. **Settings → Connect** → enable Connect → fill in the platform profile
   questionnaire. This is a manual Stripe review; it can take a day. Start it
   early.
3. **Developers → API keys** → copy the secret key → `STRIPE_SECRET_KEY`.
4. **Developers → Webhooks → Add endpoint**:
   - URL: `https://yourdomain.com/api/webhooks/stripe/connect`
   - **Tick "Listen to events on Connected accounts."** Miss this and invoices
     will never mark themselves paid.
   - Events: `checkout.session.completed`, `account.updated`, `charge.refunded`
   - Copy the signing secret → `STRIPE_CONNECT_WEBHOOK_SECRET`
5. Redeploy so the new env vars take effect.
6. In the app: **Settings → Connect Stripe** → complete hosted onboarding.

### Smoke test stage 2

- [ ] Settings shows "Connected and ready to accept payments"
- [ ] Send yourself an invoice from a second email address
- [ ] Open the public link → **Pay** button appears
- [ ] Pay with Stripe test card `4242 4242 4242 4242` (use test keys first)
- [ ] Invoice flips to **Paid** within seconds — this proves the webhook
- [ ] Its pending reminders show **cancelled**
- [ ] Stripe dashboard → the payment sits on the *connected* account, not your
      platform balance

> Until Connect onboarding is done, invoices show your bank details from
> Settings plus a **Mark as paid** button. That path is deliberate — it means
> the product works on day one while Stripe review is pending.

---

## Stage 3 — turn on the paywall (Stripe Billing)

Only worth doing once real people are using it. PLAN.md §9 risk 1 argues for
validating willingness to pay before building revenue infrastructure, which is
why this is last.

1. Stripe → **Products** → create one product with two prices: $12/month and
   $99/year. Copy both price IDs.
2. **Developers → Webhooks → Add endpoint** (a *second*, separate endpoint):
   - URL: `https://yourdomain.com/api/webhooks/stripe/billing`
   - Do **not** tick "connected accounts" this time.
   - Events: `checkout.session.completed`,
     `customer.subscription.created/updated/deleted`
   - Copy the signing secret → `STRIPE_WEBHOOK_SECRET`
3. Add `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_ANNUAL`. Redeploy.

### Smoke test stage 3

- [ ] Send 3 invoices on a free account → the 4th is blocked with an upgrade prompt
- [ ] Upgrade with a test card → send limit disappears
- [ ] The FreelanceInvoice credit is gone from the invoice footer
- [ ] **Manage subscription** opens Stripe's hosted portal

---

## Which Vercel plan

**Hobby works for launch**, with one caveat.

- Hobby caps function duration at **10 seconds**, whatever `maxDuration` says.
  The sweep budgets its own time via `CRON_BUDGET_MS` (default 8000) and stops
  cleanly before the platform kills it, reporting `remainingThisRun` in the
  response. Nothing is lost — the remainder is still due and goes out on the
  next run — but at real volume the tail would slip a day. Watch that field: if
  it is persistently non-zero, move to Pro and set `CRON_BUDGET_MS=50000`.
- Hobby crons run **once per day, at any point within the scheduled hour**.
  `0 9 * * *` is valid. Anything more frequent fails deployment.

Move to Pro when you are sending enough that one sweep can't clear the queue in
10 seconds — realistically a few hundred outstanding invoices.

## Before you tell anyone about it

- [ ] Privacy policy and terms pages (you are storing your users' clients' names
      and email addresses — GDPR applies from user one)
- [ ] `SENTRY_DSN` or equivalent, so you find out about errors from a dashboard
      rather than from a customer
- [ ] Analytics (`NEXT_PUBLIC_POSTHOG_KEY`) — PLAN.md §10 lists the funnel to
      instrument, and the days-to-payment number only exists if you measure it
      from the start
- [ ] Send yourself an invoice from a *different* email provider (Gmail →
      Outlook and vice versa) and confirm it does not land in spam

## If something breaks

| Symptom | Look at |
|---|---|
| Invoice links point at localhost | `APP_URL` is unset or wrong |
| Emails never arrive | `RESEND_API_KEY` unset → check Vercel function logs, the email body is printed there |
| Emails land in spam | SPF/DKIM/DMARC not verified on the sending subdomain |
| Paid invoices stay unpaid | Connect webhook missing "Listen to events on Connected accounts" |
| Upgrade does nothing | Billing webhook endpoint or price IDs missing |
| Reminders never send | `CRON_SECRET` mismatch between Vercel env and the cron caller |
| 500s on every page | Migrations not run against the production database |
