# FreelanceInvoice

Branded invoices for freelancers, with a one-tap payment link and automatic
reminders that chase late payers for you.

The promise is **getting paid faster**, not bookkeeping. See [PLAN.md](./PLAN.md)
for the product strategy, data model rationale, and roadmap.

---

## What works today

| | |
|---|---|
| **Free invoice generator** | `/free-invoice-generator` — build and download a PDF with no account. The draft row is created on first save, not page load. |
| **Niche landing pages** | `/photography-invoice-template` and three more, statically generated from `src/niches/`. |
| **Passwordless auth** | Magic link with a one-tap confirm screen. Signing up claims the anonymous draft you were working on — including when you request the link on a laptop and open it on your phone. |
| **Invoices** | Create, edit, duplicate, per-user numbering, three themes, custom accent colour. |
| **Send** | Emailed from our domain with the freelancer's name and a Reply-To that reaches them, PDF attached. |
| **Snapshotting** | An invoice freezes on send. Editing a sent invoice is refused — duplicate instead. |
| **Status tracking** | Draft → Sent → Viewed → Overdue → Paid, with an append-only event timeline. |
| **Reminder ladder** | −3d, due date, +3d, +7d, +14d. On by default, friendly/firm tone, stops the instant it's paid. |
| **Payments** | Stripe Connect (direct charges) → Checkout → webhook auto-marks paid. Manual "mark as paid" and bank details as fallback. |
| **Freemium** | 3 sends/month free with reminders included; Stripe Billing checkout + hosted Customer Portal for Pro. |

Not built yet: recurring invoices, client management, quotes/proposals, partial
payments, multi-currency FX, custom sending domains. See PLAN.md §1.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill in DATABASE_URL and AUTH_SECRET
npm run db:migrate
npm run dev
```

**The app is fully usable with only `DATABASE_URL` and `AUTH_SECRET` set.**
Without a Resend key, emails print to the server console — including magic-link
sign-in URLs, so you can exercise the entire flow locally before signing up for
anything. Without Stripe keys, card payment is hidden and the bank-details plus
manual "mark as paid" path takes over.

```bash
npm run dev         # dev server
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm test            # unit tests (+ integration tests when DATABASE_URL is set)
npm run db:generate # regenerate migrations after editing src/db/schema.ts
npm run db:migrate  # apply migrations
```

---

## Accounts you need to create

Every service below is one **you** sign up for. No key is committed to this
repo; `.env*` is gitignored and `.env.example` carries names with empty values.

| Service | Why | Env vars |
|---|---|---|
| **Postgres** (Neon, Supabase, anything) | Database | `DATABASE_URL` |
| — | Signs session cookies. `openssl rand -base64 32` | `AUTH_SECRET` |
| **Resend** | Sending invoices and reminders | `RESEND_API_KEY`, `EMAIL_FROM` |
| **Stripe** | Connect (their payments) + Billing (your subscriptions) | see below |
| **Vercel** | Hosting + cron | `CRON_SECRET` |

### Stripe setup — two endpoints, two secrets

This is the easiest thing to get wrong. Stripe is used for **two unrelated
purposes** and they must not be conflated:

1. **Connect** — the freelancer's client pays the freelancer. Charges are
   created *on the connected account*, so money lands in their balance and
   never touches yours. Disputes, refunds, payouts and KYC are theirs and
   Stripe's.
2. **Billing** — your own subscription revenue, on your platform account.

Steps:

1. Create a Stripe account → **Settings → Connect** → enable it and complete the
   platform profile questionnaire.
2. Create two products under **Products** (monthly and annual) → copy the price
   IDs into `STRIPE_PRICE_ID_MONTHLY` / `STRIPE_PRICE_ID_ANNUAL`.
3. Create **webhook endpoint 1** → `https://yourdomain.com/api/webhooks/stripe/billing`
   Events: `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`
   → signing secret goes in `STRIPE_WEBHOOK_SECRET`.
4. Create **webhook endpoint 2** → `https://yourdomain.com/api/webhooks/stripe/connect`
   **Tick "Listen to events on Connected accounts."**
   Events: `checkout.session.completed`, `account.updated`, `charge.refunded`
   → signing secret goes in `STRIPE_CONNECT_WEBHOOK_SECRET`.

Test webhooks locally with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe/billing
stripe listen --forward-connect-to localhost:3000/api/webhooks/stripe/connect
```

> **Worth checking before you build on it:** Stripe shipped the Accounts V2 API
> (`/v2/core/accounts`) in late 2025 and now steers new platforms toward it over
> classic V1 Standard accounts. All Connect calls are funnelled through
> `src/lib/stripe.ts` so switching is a change in one file. Verify against the
> current Stripe docs rather than trusting this README.

### Email deliverability

If invoices land in spam the product does not work. Before launch:

- Verify a **dedicated subdomain** in Resend (e.g. `mail.yourdomain.com`).
- Add **SPF, DKIM and DMARC** records. Warm the domain gradually.
- Point a Resend webhook at `/api/webhooks/resend` for delivery and bounce
  events.

Users never set their own `From` address — that is spoofing and it destroys
domain reputation. Their name appears as the display name and their address as
`Reply-To`.

---

## Deploying to Vercel

1. Import the repo. Framework preset: Next.js. No build overrides needed.
2. Add every env var from `.env.example`. Set `APP_URL` to your real origin
   (no trailing slash) — emails and Stripe redirects build absolute URLs from it.
3. Run `npm run db:migrate` against your production database once.
4. `vercel.json` already registers the reminder cron for 09:00 UTC daily.
   Vercel calls it with `Authorization: Bearer $CRON_SECRET`.

The reminder sweep selects `scheduled_for <= now`, so a late or skipped cron run
catches up on the next run rather than silently dropping a reminder.

---

## Architecture notes

```
src/
├── app/
│   ├── (app)/          signed-in area — invoices, settings, billing
│   ├── [slug]/         niche landing pages (SSG, dynamicParams: false)
│   ├── i/[token]/      the public invoice your client sees (noindex)
│   └── api/            route handlers
├── components/         UI, including the shared InvoiceDocument renderer
├── db/                 Drizzle schema + migrations
├── lib/                domain logic — the interesting part
├── niches/             the niche registry (one file per profession)
├── pdf/                @react-pdf/renderer twin of InvoiceDocument
└── themes/             design tokens shared by the HTML and PDF renderers
```

Decisions that will otherwise look odd:

- **`documents`, not `invoices`.** A `kind` discriminator (`invoice` / `quote` /
  `proposal` / `receipt`) costs nothing today and saves a rename-everything
  migration when proposals land.
- **Money is integer cents, never floats.** Tax is applied once to the taxable
  subtotal rather than per line, so the printed total always equals
  subtotal + tax exactly.
- **Calendar dates are `YYYY-MM-DD` text anchored to 12:00 UTC.** "Due 14 March"
  means the same thing in Auckland and Los Angeles; a midnight anchor slides by
  a day for anyone west of UTC.
- **`reminders` has a unique index on `(document_id, rule_key)`.** That single
  constraint is what makes the daily sweep idempotent. A duplicate reminder is a
  customer-relationship bug, not a cosmetic one.
- **Overdue is derived, never stored.** A stored flag needs a job to flip it and
  is wrong for up to a day.
- **Snapshots freeze on send.** The public page and PDF render from the frozen
  copy, so a later edit cannot change what a client already received.
- **Email opens are treated as noise.** Apple Mail Privacy Protection prefetches
  images and Gmail proxies them, so opens over-report badly. Invoice *page
  views* are the source of truth and the only thing surfaced as fact.
- **Entitlements live in one module.** `src/lib/entitlements.ts` is the single
  source of truth; the UI renders lock badges from the same object the server
  enforces with.
- **The magic link is never spent by a GET.** Corporate mail gateways and inbox
  assistants routinely fetch every URL in a message to scan it. If that
  consumed the token, the human who clicks afterwards would be locked out with
  no password to fall back on — so `/api/auth/callback` only forwards to a
  confirm screen, and `/api/auth/confirm` (POST) does the actual sign-in.
- **The draft claim rides on the login token, not on a cookie.** The anonymous
  session id is captured when the link is *requested* and stored on the token
  row. Reading the opener's cookie instead would silently orphan the draft
  whenever someone requests the link on a laptop and opens it on a phone —
  which is most people.
- **Two rate limiters, deliberately.** `src/lib/rate-limit.ts` is an in-memory
  Map: on Vercel that is per-lambda, which is fine where abuse only costs our
  own CPU. `src/lib/rate-limit-shared.ts` is Postgres-backed and used for
  `/api/auth/magic-link`, which emails arbitrary addresses from the one
  verified domain every invoice depends on.
- **Ownership is in the WHERE clause.** `getOwnedDocument(id, ownerId)` is the
  only way app code loads an invoice. A forgotten owner comparison is how this
  product shape leaks every customer's invoices.

### Security

- **We never see card data.** All card entry happens on Stripe-hosted Checkout;
  we store only Stripe object IDs. This keeps the app at PCI SAQ A. Embedding a
  card field directly would leave SAQ A — treat any such proposal as that
  decision.
- Public invoice URLs use 128-bit tokens, never sequential IDs, and are
  `noindex` via both `next.config.ts` headers and page metadata.
- Session and magic-link tokens are stored as SHA-256 hashes; magic links are
  single-use with a 15-minute expiry.
- Webhook signatures are verified against the raw body and deduped through the
  `webhook_events` ledger. A failed handler releases its claim so Stripe's retry
  does real work. The Resend endpoint verifies its Svix signature and refuses to
  run at all without `RESEND_WEBHOOK_SECRET`; it returns an identical body for
  matched and unmatched recipients so it cannot be used as an "is this address
  someone's client?" oracle.
- Anonymous visitors can download but never send, which is both the conversion
  gate and what stops the free tool being used as a spam relay.
- IPs are hashed before being written to `document_events`.

---

## Testing

```bash
npm test                                     # unit tests only
DATABASE_URL=postgresql://... npm test       # + full lifecycle integration tests
```

Unit tests cover the three places bugs cost real money — money math, entitlement
gating, reminder scheduling. `src/db/lifecycle.integration.test.ts` drives the
whole lifecycle against a real Postgres: draft → save → number → snapshot →
send → reminders → view → paid → reminders cancelled, plus cross-user isolation,
webhook-redelivery idempotency, and real PDF generation. It skips automatically
when `DATABASE_URL` is unset.
