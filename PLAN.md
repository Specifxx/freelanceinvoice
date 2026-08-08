# FreelanceInvoice — Product & Build Plan

> Status: **planning**. No implementation code exists yet. Nothing in this document is
> committed to until the open questions at the end are answered.

## 0. What this product is

**FreelanceInvoice** helps solo freelancers create a branded invoice in under a minute, send it,
and get paid — with automated escalating reminders, a one-tap payment link, and honest
"viewed / paid" tracking.

Three commitments that constrain every decision below:

1. **The promise is getting paid faster.** Not bookkeeping. If a feature doesn't shorten
   days-to-payment or remove the awkward follow-up, it is not v1.
2. **Anti-QuickBooks.** Radically simple. First invoice in under 60 seconds, no signup required.
   Every feature added must survive the question "does this make the 60 seconds slower?"
3. **Niche-able by construction.** The same core app skins per profession via a data-driven
   niche layer. Adding "tutors" must be one file plus a redeploy, never a schema migration.

**North-star metric: median days-from-send-to-payment**, measured per account. It is
simultaneously the product goal, the marketing proof point, and the retention argument.

---

## 1. MVP scope vs. later phases

### v1 — the smallest lovable thing (target ~6–8 weeks solo, part-time)

**In:**

| Area | Scope |
|---|---|
| Anonymous invoice builder | No signup. Live preview. Download PDF free (with our small footer). |
| Accounts | Passwordless magic-link auth. Claims the anonymous draft on signup. |
| Invoices | Create / edit / duplicate / delete. Line items, flat tax rate, notes, due date, per-user invoice numbering, logo + accent colour. |
| Send | Email to client from our domain, freelancer's name in `From`, their address in `Reply-To`. |
| Public invoice page | Unguessable token URL. Branded. "Pay now" button. Download PDF. |
| **Get-paid hook** | Stripe Connect onboarding → Checkout → webhook auto-marks paid. Plus manual "mark as paid" and bank-transfer fallback for users who haven't connected Stripe. |
| **Status tracking** | Draft → Sent → Viewed → Paid / Overdue, with an append-only event timeline. |
| **Reminders** | Escalating automatic ladder (−3d, due date, +3d, +7d, +14d), on by default, one-click off, friendly/firm tone toggle. Stops instantly on payment. |
| Niche layer | Registry + 3–5 niche landing pages generated from it. |
| Billing | Free vs Paid, server-side entitlements, Stripe Billing checkout + hosted Customer Portal. |

**Ruthlessly cut from v1** (each is a real product, none is the promise):

Teams/multi-user · time tracking · expenses · any accounting or bookkeeping · tax engines,
VAT MOSS, or per-jurisdiction rules · multi-currency FX · partial payments and deposits ·
credit notes · purchase orders · contracts/e-signature · project management · native mobile
apps · i18n · custom domains · custom SMTP/from-address · public API and Zapier · analytics
dashboards and reports · client login portal · file attachments beyond a logo ·
**recurring invoices** · **proposals/quotes**.

> Two of those cuts hurt and are deliberate. **Recurring invoices** are the strongest retention
> feature we have — but they need the scheduler that Milestone 5 builds anyway, so they become
> ~2 days of work in phase 2 instead of ~1 week in v1. **Proposals** are cut from v1 but *not*
> from the data model (§3) — the schema carries them from day one so they cost a feature, not a
> migration.

### Phase 2 — retention and expansion (post first paying customers)

Recurring/retainer invoices (first, for retention) · client management (list, history,
per-client defaults, days-to-pay per client) · quotes/proposals → one-click convert to invoice ·
partial payments and deposits · multi-currency · custom sending domain with verified DKIM ·
late-fee rules · CSV/accounting export · 15–25 niche landing pages · Zapier.

### Phase 3 — only if the core is proven

Public API · team seats · lightweight expense capture · time tracking → invoice · SMS/WhatsApp
reminder escalation · white-label / custom domains · accountant read-only access · mobile app.

---

## 2. Core user flows

### 2a. The no-signup path (the top-of-funnel wedge)

```
/free-invoice-generator  (or /photography-invoice-template)
   │  form is visible immediately — no modal, no signup, no cookie banner
   │  defaults prefilled: today's date, due in 14 days, currency from locale, one empty line
   ▼
Type: your business · client name + email · one line item · amount
   │  live preview pane beside the form
   │  autosaved to localStorage on keystroke + debounced POST to /api/drafts
   │  (draft row keyed by an httpOnly anonymous session cookie)
   ▼
┌─────────────────────────────┬──────────────────────────────────┐
│  [Download PDF]             │  [Send & get paid →]             │
│  free, anonymous, our       │  requires email → magic link     │
│  small footer credit        │  → account created               │
│                             │  → draft claimed into it         │
└─────────────────────────────┴──────────────────────────────────┘
```

**Screens:** 1 (builder with split preview). **Acceptance criterion:** in a 5-person hallway
test, median time from landing to downloaded PDF is **under 60 seconds**. Measure it; don't
assume it.

Two deliberate design consequences:

- The anonymous path **can download but cannot send**. This is the conversion gate *and* it
  eliminates the spam-relay abuse vector entirely — we never send email on behalf of an
  unverified party.
- The 60-second promise covers *create and download/send*. It does **not** cover Stripe Connect
  onboarding, which involves Stripe's KYC and is not ours to shorten. Never market the two as
  one number.

### 2b. Signed-in flows

**Build invoice** — Invoice list → `New invoice` → same builder, prefilled with saved business
details, logo, and niche defaults → client picked from a datalist of prior clients or typed
fresh → Save draft.

**Send** — `Send` → review sheet (to, subject, message — all prefilled from niche copy, all
editable) → confirm. On send we **snapshot** the invoice (§3) so what the client sees can never
silently change, generate the public token URL, queue the email, and schedule the reminder
ladder.

**Client views** — Client receives email → taps the link → public invoice page at `/i/<token>`,
no login. Page load records a `viewed` event. Freelancer sees status flip to **Viewed**, and
optionally gets a "your invoice was opened" notification.

**Get paid** — Client taps `Pay now` → Stripe Checkout on the freelancer's connected account →
pays → redirected back to the invoice page, now stamped PAID. Money lands in the freelancer's
Stripe balance; it never touches ours.

**Status updates** — Stripe webhook `checkout.session.completed` marks the invoice paid,
cancels all pending reminders, writes a `paid` event, and emails the freelancer a confirmation.
Manual `Mark as paid` exists for bank transfer / cash and does the same thing minus the Stripe
record.

**Reminders** — Daily cron sweeps for due reminders on unpaid, sent invoices and sends them.
Every send is recorded so a reminder can never fire twice.

**Screen inventory for v1:** landing/niche pages · invoice builder · invoice list · invoice
detail with event timeline · send review sheet · public invoice page · settings (business
profile, branding, Stripe connection, reminder defaults) · billing/upgrade · auth
(email → check-your-inbox).

---

## 3. Data model

Postgres. Money is **always integer minor units** (`amount_cents`) plus an ISO-4217 currency
code — never floats. Quantities are `numeric(12,3)`; tax rates are basis points (`int`).

### Entities

```
users ──< documents ──< line_items
  │          │
  │          ├──< document_events      (append-only timeline)
  │          ├──< reminders            (one row per scheduled/sent reminder)
  │          └──< payments
  │
  ├──< clients ──< documents
  ├─── subscriptions          (our own billing; 1:1 in practice)
  └─── stripe_connections     (their Connect account)

niches      → static registry in code, not a table (see below)
themes      → static registry in code, not a table
webhook_events  → idempotency ledger, no FK
```

**`users`** — id, email (citext, unique), name, business_name, business_address, logo_url,
accent_color, theme_id, default_currency, default_payment_terms_days, default_tax_rate_bps,
niche_slug, plan, invoice_number_format, next_invoice_number, created_at.

**`clients`** — id, owner_id, name, email, company, address, notes, default_currency,
created_at. Unique `(owner_id, lower(email))`.

**`documents`** — the central table. Note the name.

id, owner_id, client_id (nullable), **kind** `enum('invoice','quote','proposal','receipt')`,
status `enum('draft','sent','viewed','partially_paid','paid','overdue','void')`, number,
currency, issue_date, due_date, subtotal_cents, tax_rate_bps, tax_cents, total_cents,
amount_paid_cents, notes, terms, niche_slug, theme_id, **public_token** (unique, ≥128-bit),
sent_at, first_viewed_at, paid_at, **snapshot** `jsonb`, anonymous_session_id (nullable),
created_at, updated_at.

> **Why `documents` and not `invoices`.** Proposals and quotes are an explicitly stated future
> requirement, and they share line items, PDF rendering, sending, viewing, and numbering with
> invoices. A `kind` column defaulting to `'invoice'` costs nothing today and saves a
> rename-everything migration later. This is the one piece of forward-modelling in the plan;
> everything else is built for today.

> **Why `snapshot`.** The moment an invoice is sent it becomes a quasi-legal artifact. We freeze
> the rendered line items, totals, and business details into `snapshot` at send time. The public
> page and PDF render from the snapshot, so a later edit can never silently change what a client
> already saw. Post-send edits create a new snapshot version and prompt to notify the client.

**`line_items`** — id, document_id, position, description, quantity, unit, unit_price_cents,
taxable, amount_cents. `unit` is free text seeded from the niche ("hour", "session", "room").

**`document_events`** — id, document_id, type, occurred_at, ip_hash, user_agent, meta jsonb.
Append-only, never updated. Types: `created · sent · delivered · bounced · complained ·
email_opened · viewed · pdf_downloaded · payment_started · paid · marked_paid_manually ·
reminder_sent · reminder_skipped · voided`. The invoice timeline UI is a plain read of this
table, and every analytics question we'll want to ask later is answerable from it.

**`reminders`** — id, document_id, rule_key, scheduled_for, status
`enum('pending','sent','cancelled','failed')`, sent_at, channel, provider_message_id.
**Unique `(document_id, rule_key)`** — this constraint is what makes the cron idempotent and is
the single most important index in the schema. A duplicate reminder is a customer-relationship
bug, not a cosmetic one.

**`payments`** — id, document_id, provider `enum('stripe','manual')`, stripe_payment_intent_id,
stripe_checkout_session_id, amount_cents, currency, status, method, paid_at, raw jsonb. One row
per payment, so partial payments in phase 2 need no migration.

**`stripe_connections`** — user_id, stripe_account_id, charges_enabled, payouts_enabled,
details_submitted, onboarded_at, last_synced_at. We store the **account id** — not card data,
and not (if we use hosted onboarding) OAuth tokens.

**`subscriptions`** — user_id, stripe_customer_id, stripe_subscription_id, plan, status,
current_period_start, current_period_end, cancel_at_period_end.

**`webhook_events`** — provider, event_id (PK), type, received_at, processed_at. Insert-then-
process; a duplicate insert means we've already handled it. Stripe *will* redeliver.

### The niche / template layer

Two **orthogonal** axes. Conflating them is the mistake to avoid.

- **Niche** = *what it says and what it defaults to.* Photography vs. cleaning vs. tutoring.
- **Theme** = *what it looks like.* Minimal vs. Bold vs. Classic.

A niche *points at* a default theme, but any user in any niche can pick any theme.

Both live as **typed static files in the repo**, not database rows:

```
src/niches/photography.ts   src/themes/minimal.ts
src/niches/cleaning.ts      src/themes/bold.ts
src/niches/tutoring.ts      src/themes/classic.ts
src/niches/index.ts         src/themes/index.ts
```

```ts
type Niche = {
  slug: string
  name: string
  seo: { title, h1, metaDescription, intro, faq: { q, a }[] }
  defaults: {
    unitLabel: string          // "session" | "hour" | "room"
    paymentTermsDays: number
    taxLabel: string           // "VAT" | "Sales tax" | "GST"
    notes: string              // default footer/terms copy
    themeId: ThemeId
  }
  lineItemPresets: { description, unit, defaultQty, defaultRate }[]
  reminderCopy: { friendly: Ladder, firm: Ladder }
}
```

**Adding a niche = add one file + one registry line + redeploy.** The landing page
(`/[niche]-invoice-template`), the builder's line-item presets, the default terms, and the
reminder wording all derive from that file. No schema change, no code branching, no
rearchitecting — which is exactly the requirement.

`documents.niche_slug` is stamped at creation so an invoice keeps its niche's wording even if
the user later switches niches. Themes are consumed as **design tokens** by both the HTML
invoice page and the PDF renderer, which is what keeps the two renderers visually in sync
without duplicating layout logic twice per theme.

---

## 4. Tech stack

### Option A — boring/safe

**Next.js 15 (App Router) + TypeScript + Postgres (Neon) + Drizzle + Tailwind + shadcn/ui +
Auth.js (magic link) + Resend + Stripe + Vercel (incl. Vercel Cron) + `@react-pdf/renderer`.**

One language across the whole app. Static generation gives us fast, indexable niche landing
pages for free — which matters more here than usual, because SEO *is* the distribution plan.
Stripe and Resend both ship first-class TS SDKs. Cron is a line of config, not a service.

Trade-offs: serverless cold starts; no long-running background jobs (mitigated — a daily cron
plus short handlers is genuinely all this product needs); Vercel gets expensive at scale, but
"at scale" is a good problem we do not have.

### Option B — lighter-weight

**SvelteKit or Remix + SQLite (Turso/libSQL) on Fly.io.**

Smaller bundles, less framework churn, cheaper (~$5/mo), real long-running processes so
scheduling is trivial. Trade-offs: smaller component ecosystem (shadcn/ui alone probably saves
a week of UI work); fewer copy-pasteable answers when stuck at 11pm; SQLite replication adds a
concept to learn at exactly the wrong moment.

### Option C — worth naming: Rails 8

If you already know Ruby, this is arguably the fastest path. ActiveJob + Solid Queue,
ActionMailer, and Kamal deploy to a $10 VPS cover jobs, email, and ops with no extra services.
Only choose it on existing familiarity — learning Rails in order to ship faster is a
contradiction.

### Recommendation: **Option A**

For a solo builder shipping fast with low ops burden, Option A wins on ecosystem and on SEO
ergonomics, and its weaknesses (cold starts, no long jobs) don't bite this particular product.

Supporting choices:

- **Drizzle over Prisma** — lighter serverless bundle, faster cold starts, SQL-first migrations.
  Prisma is a perfectly fine substitute with better beginner docs; this choice will not decide
  the product's fate, so don't spend a day on it.
- **PDF: `@react-pdf/renderer`.** No Chromium in serverless, deterministic output, fast. The
  cost is honest: PDF layout is written separately from the HTML invoice page, so each theme is
  authored twice. That's acceptable at 2–3 themes with shared design tokens. **Escape hatch** if
  themes proliferate: switch to headless Chromium (`@sparticuz/chromium`) or a hosted HTML→PDF
  API and render the HTML template directly, deleting the duplication.
- **Testing, kept small.** Vitest on the three places where bugs cost real money — money math,
  entitlement gating, reminder scheduling. Playwright on three E2E flows — create→PDF,
  send→view→pay, reminder fires. Stripe CLI for local webhook replay. Nothing else.

---

## 5. Payments & integrations

### The critical structural point

Money flows **from the freelancer's client to the freelancer**. It must never land in our
balance. That single fact dictates **Stripe Connect** and rules out the simpler options:

| Option | Verdict |
|---|---|
| Payment Links | Simple, but static per-product and not per-invoice-amount without API work anyway. And without Connect, funds land in *our* account — wrong, and a money-transmission problem. ❌ |
| Checkout, no Connect | Same fatal flaw: we'd be receiving our users' revenue. ❌ |
| **Connect + direct charges + Checkout Session** | Funds go straight to the freelancer's balance. Disputes, refunds, payouts, and KYC are Stripe's and theirs — not ours. ✅ |
| Stripe Invoicing on the connected account | Stripe hosts and brands the invoice, so we lose the branded page, view tracking, and the reminder ladder — i.e. the entire differentiator. ❌ |

**Recommended: Connect with Standard-equivalent accounts, hosted onboarding, direct charges.**
The freelancer gets their own Stripe dashboard and owns compliance; we create Checkout Sessions
against their account and take **no** application fee (we monetise by subscription, which keeps
our pricing legible and avoids competing with Stripe's own cut).

> ⚠️ **Open decision to confirm against live Stripe docs at build time.** Stripe shipped the
> Accounts V2 API (`/v2/core/accounts`) in late 2025 and now steers *new* platforms toward it
> rather than classic V1 Standard + OAuth. V2 is the cleaner long-term model; V1 has far more
> community answers when you're stuck. Recommendation: build the Connect integration behind a
> thin internal interface (`connectAccount()`, `createCheckoutForInvoice()`) so the choice is
> reversible, and pick whichever path the Stripe dashboard presents at signup. Do not design
> around remembered API details here — verify first.

### Two Stripe surfaces, and they are easy to confuse

| | Freelancer gets paid | We get paid |
|---|---|---|
| Product | Connect + Checkout | Stripe Billing |
| Account | Connected account | Our platform account |
| Webhook endpoint | `/api/webhooks/stripe/connect` | `/api/webhooks/stripe/billing` |
| Key events | `checkout.session.completed`, `payment_intent.payment_failed`, `charge.refunded`, `account.updated` | `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_failed` |
| Signing secret | `STRIPE_CONNECT_WEBHOOK_SECRET` | `STRIPE_WEBHOOK_SECRET` |

Two endpoints, two secrets. Both verify signatures and both dedupe via `webhook_events`.

**Auto-marking paid:** `checkout.session.completed` → verify signature → dedupe on `event.id` →
match `metadata.document_id` → insert `payments` row → set `status='paid'`, `paid_at` → cancel
all `pending` reminders → write `paid` event → notify freelancer. The redirect back from
Checkout is *not* the source of truth (users close tabs); the webhook is.

**Fallback for un-onboarded users:** show bank-transfer details on the invoice plus a "Mark as
paid" button. This matters — it means the app is useful on day one while Stripe KYC is pending,
which removes the single biggest activation cliff.

### Email

**Resend** (Postmark is an equally good swap; both have strong deliverability and webhooks).

- Send from **our** verified domain, freelancer's name in `From`, their address in `Reply-To`.
  Never let users set an arbitrary `From` — that's a spoofing and deliverability disaster.
  Verified custom sending domains are a phase-2 feature.
- DNS on a dedicated subdomain (`mail.yourdomain.com`): **SPF, DKIM, DMARC**. Warm it gradually.
- Consume delivery webhooks (`delivered`, `bounced`, `complained`) into `document_events`.

### View tracking — be honest about what we can actually measure

- **Invoice page views are the reliable signal.** Client opens `/i/<token>` → we record `viewed`
  with a hashed IP and user agent. Trustworthy, and it's what the freelancer actually cares
  about. **This is our source of truth and what the UI shows.**
- **Email open pixels are noise.** Apple Mail Privacy Protection prefetches images and Gmail
  proxies them, so opens over-report badly. Store them as a weak secondary signal if at all;
  never surface a bare "opened" count as fact. Prompting someone to chase a client based on a
  false open is a real harm to the user's relationship with their customer.

Suppress self-views: ignore hits carrying the owner's session cookie, so previewing your own
invoice doesn't fake a "Viewed".

### Third-party accounts and API keys

**You create all of these.** No account will be created on your behalf and no key will ever be
committed to this repo.

| Service | Purpose | Tier to start | Env vars |
|---|---|---|---|
| **Stripe** | Connect (their payments) + Billing (our subscriptions). Requires enabling Connect and completing the platform-profile questionnaire. | Free until revenue | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_ANNUAL` |
| **Neon** (or Supabase) | Postgres | Free | `DATABASE_URL`, `DIRECT_URL` |
| **Resend** (or Postmark) | Transactional email + delivery webhooks | Free → ~$20/mo | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` |
| **Vercel** | Hosting, env vars, cron | Free → $20/mo | `CRON_SECRET` |
| **Domain registrar** | Domain + DNS records for email auth | ~$12/yr | — |
| **Vercel Blob** (or Cloudflare R2) | Logo uploads | Free tier | `BLOB_READ_WRITE_TOKEN` |
| **Upstash Redis** | Rate limiting on anonymous + send endpoints | Free | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| **PostHog** or **Plausible** | Funnel analytics — genuinely required to validate §10 | Free → $9/mo | `NEXT_PUBLIC_POSTHOG_KEY` |
| **Sentry** | Error monitoring | Free | `SENTRY_DSN` |
| **Google Search Console** | SEO — the whole GTM depends on it | Free | — |

Self-generated, not third-party: `AUTH_SECRET`, `APP_URL`.

The repo carries a `.env.example` with **names and empty values only**. `.env*` is gitignored
from the first commit. Secrets live in Vercel's env store.

---

## 6. Freemium enforcement

**Single source of truth:** `src/lib/entitlements.ts` exposing `getEntitlements(userId)` →
`{ plan, limits, features }`. Every gate calls it. No feature checks scattered through route
handlers, and **no gate that exists only in the UI** — the client renders lock badges from the
same entitlements object, but the server always re-checks.

**Proposed tiers** (to validate against §9's pricing risk):

| | Free | Paid (~$12/mo, ~$99/yr) |
|---|---|---|
| Invoices **sent** / month | 3 | Unlimited |
| Drafts & PDF downloads | Unlimited | Unlimited |
| Payment link + auto-mark-paid | ✅ | ✅ |
| Status tracking | ✅ | ✅ |
| Automatic reminders | ✅ default ladder | ✅ custom schedules + tone |
| Our branding on invoice/PDF | Shown | Removed |
| Recurring / retainer (phase 2) | ❌ | ✅ |
| Client management (phase 2) | ❌ | ✅ |
| Export (phase 2) | ❌ | ✅ |

> **Deliberate call: the free tier keeps reminders and the payment link.** Gating the
> differentiator would mean free users never experience the thing we're selling. Let them feel
> an invoice get paid without a chase, on three invoices a month; sell them volume, branding
> removal, and recurring. This is the highest-leverage assumption in the pricing model and the
> first thing to A/B once there's traffic.

**Counting.** Count on **send**, never on create — drafting must stay free and unlimited or the
60-second promise dies. Compute with an indexed query rather than a maintained counter, which
cannot drift:

```sql
SELECT count(*) FROM documents
WHERE owner_id = $1 AND kind = 'invoice' AND sent_at >= $period_start;
```

Period = calendar month (free) or Stripe billing period (paid). Add a cached counter only if
this ever shows up as slow, which it won't.

**Gate locations** (server-side, all of them): `POST /api/documents/:id/send` · recurring
creation · branding-removal toggle · custom reminder-schedule save · export · bulk client
import.

**Conversion moment.** At the limit, do **not** fail mid-flow. Let them build the whole invoice;
block at *Send* with an upgrade sheet naming exactly what they get and a one-tap Stripe
Checkout. Someone with a finished invoice and a client waiting is the most motivated buyer this
product will ever have.

Use Stripe's **hosted Customer Portal** for cancel/update/payment-method — self-serve billing
support for free is a large ops saving for a solo dev.

---

## 7. Auth & security

**Auth:** passwordless magic link (Auth.js + Postgres adapter). No password storage, no reset
flow, lowest friction — it fits the 60-second promise and reuses email infrastructure we already
need. Google OAuth in phase 2. Sessions in httpOnly, Secure, SameSite=Lax cookies.

**Card data is never ours.** All card entry happens on Stripe-hosted Checkout. We store only
Stripe object IDs. No PAN, CVV, or expiry ever reaches our servers, logs, or database. This
keeps us at **PCI SAQ A**, the lightest scope there is. Any future proposal to embed a card
field directly is a decision to leave SAQ A — treat it as such.

**Public invoice links:** ≥128-bit tokens (`crypto.randomBytes(16).toString('base64url')`),
never sequential IDs. Support revoking/rotating a token. Serve `X-Robots-Tag: noindex` on
`/i/*` — client invoices must never appear in search results.

**Authorization:** every query scoped by owner through a shared helper, never ad-hoc `where`
clauses. IDOR on an invoice list is the classic failure mode for this exact product shape; one
helper, plus a test asserting a second user gets 404 on the first user's invoice.

**Webhooks:** verify Stripe/Resend signatures against the raw body, dedupe by event id, return
2xx fast, process idempotently.

**Abuse:** anonymous users cannot send email at all (§2a). Rate-limit draft creation, PDF
generation, magic links, and sends per IP and per account.

**Data handling:** TLS everywhere; encryption at rest via the DB provider; hash IPs in
`document_events` rather than storing them raw; PII limited to what an invoice genuinely needs.
Provide account deletion and data export from the start — cheap now, painful to retrofit, and
required by GDPR/CCPA. Keep a subprocessor list (Stripe, Neon, Resend, Vercel) and a plain
privacy policy before launch. Secrets live in Vercel's env store only; rotate if ever exposed.

---

## 8. Differentiation & go-to-market

### The wedge

1. **Free, no-signup invoice generator as SEO top-of-funnel.** It ranks, it's genuinely useful,
   and its PDF footer is a soft viral loop: every invoice is seen by a client who might be a
   freelancer too. It costs almost nothing to run.
2. **Per-niche landing pages** generated from the niche registry (§3). Head terms like "invoice
   template" are owned by enormous incumbents; long-tail ("invoice template for wedding
   photographers", "cleaning invoice template with GST") is winnable. Each page is one file.
3. **"Get paid faster" hooks** as the paid pitch: escalating reminders, real view tracking,
   one-tap payment. Marketed with our own data — *"invoices with reminders on get paid N days
   sooner"* — which we can only claim because §3's event model measures it from day one.

### Competitors, honestly assessed

| Competitor | Position | How we stay distinct |
|---|---|---|
| **Zoho Invoice** | Free forever, 500 invoices/yr, *already has reminders and a client portal* | The most dangerous competitor. Beat on speed, no-signup entry, and niche fit — not on feature count. |
| **Wave** | Free unlimited invoicing, monetises payments at ~2.9% + $0.60 | Bundled with accounting they don't want; we're faster and single-purpose. |
| **Stripe Invoicing** | ~$0.50/invoice, or ~$6/mo unlimited on Plus | **Sends only one reminder per unpaid invoice — no escalating cadence.** Our ladder sits exactly in that gap, with a far better builder. |
| **PayPal / Square Invoices** | Free, universal trust | Generic, unbranded, no niche wording, no real chase automation. |
| **QuickBooks / FreshBooks / Xero** | $20–60/mo accounting suites | The whole anti-positioning. They sell bookkeeping; we sell getting paid. |
| **Bonsai** | $21+/mo freelancer suite | Broader and pricier; we're the cheap sharp tool. |
| **invoice-generator.com et al.** | Free SEO tools | Same funnel entry, but no send, no tracking, no reminders, no account. That's our upgrade path and their dead end. |

**Say the quiet part plainly: the feature moat is thin.** Reminders and payment links are all
copyable, and two competitors already ship a version of them. The defensible assets are
**distribution** (niche SEO pages compounding over time), **UX speed**, and **niche-specific
wording that generic tools structurally won't write**. Plan accordingly — which means shipping
the SEO surface early (Milestone 1) so it has months to rank, rather than polishing the app
first.

**First 100 users:** niche subreddits and Facebook groups (r/freelance, photography and cleaning
business groups), Indie Hackers, Product Hunt, and direct outreach to freelancers visibly
complaining about chasing payment. Answer "how do I chase an unpaid invoice" wherever it's
asked — that's the exact moment of pain.

---

## 9. Key risks & unknowns

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Free-tool price anchoring.** Zoho (free, 500/yr, with reminders), Wave (free unlimited), PayPal/Square (free), Stripe Plus (~$6/mo) make ~$12/mo a genuinely hard sell. | **High** | Don't compete on "make a PDF" — that's free forever in our own product too. Sell recovered time and faster cash: one invoice paid a week sooner outearns a year of subscription. **Validate willingness to pay before building the paywall** (M7 is deliberately late). Consider $9/mo entry, or annual-only pricing, if conversion stalls. |
| 2 | **Low switching costs / churn.** An invoicing tool is trivially abandoned; users may subscribe for one busy month and cancel. | **High** | Stickiness comes from accumulated state, not features: client list, payment history, per-client days-to-pay, and above all **recurring/retainer invoices** — set-and-forget is the stickiest thing we can build. That's why recurring is the *first* phase-2 item. Track cohort retention from the first paying customer. |
| 3 | **The feature moat is thin** (§8). | High | Compete on distribution and niche fit, not features. Ship SEO early so it compounds. |
| 4 | **Email deliverability.** If invoices land in spam, the product does not work. | **High** | Reputable ESP, dedicated sending subdomain, SPF/DKIM/DMARC, gradual warm-up, plain-text-ish templates, monitor bounce/complaint rates, and surface delivery status honestly to the freelancer. |
| 5 | **Stripe Connect onboarding friction.** KYC drop-off at exactly the activation moment. | Medium-High | Bank-details + manual "mark as paid" fallback means the app works before Stripe is connected; nudge to connect after the first invoice is sent. Measure the drop-off explicitly. |
| 6 | **Client trust.** A client is paying via a domain they've never heard of. | Medium | Freelancer's branding dominant, ours minimal; clear business details; HTTPS; recognisable Stripe Checkout; custom domains in phase 3. |
| 7 | **SEO is slow and competitive.** Months to rank, and head terms are locked up. | Medium | Ship the free tool in week 1 so the clock starts early. Long-tail niche + jurisdiction/currency modifiers. Treat SEO as a compounding bet, not a launch channel — communities carry the first 100 users. |
| 8 | **Tax/VAT complexity.** Real invoicing spans jurisdictions, reverse charge, VAT numbers, e-invoicing mandates. | Medium | v1 supports a single flat tax rate and a custom tax label — and says so plainly. Do not half-build a tax engine. |
| 9 | **Abuse of the free/anonymous tier** (spam relay, PDF-generation cost). | Medium | Anonymous users cannot send email at all; rate limits per IP and per account. |
| 10 | **Stripe Connect V1 vs V2** (§5). | Medium | Thin internal interface so the choice is reversible; verify against live docs before writing the integration. |
| 11 | **Solo-dev bandwidth.** The cut list in §1 exists because scope creep is the most likely cause of death. | Medium | Milestones are independently shippable; nothing in phase 2 starts before a real user has paid. |

### Open unknowns to resolve with users, not in a document

- Do freelancers actually *want* automatic reminders, or is there a fear of seeming pushy? (The
  friendly/firm tone toggle is a hedge; the answer changes the marketing headline.)
- Is niche-specific wording a real purchase driver, or just an SEO device?
- Which niche has the best pain-to-reachability ratio?
- Is $12/mo credible against free alternatives, or is annual-only the right shape?

---

## 10. Build order

Each milestone is independently shippable and carries a validation question. Nothing later
starts before the earlier one is deployed.

- [ ] **M0 — Skeleton (1–2 days).** Next.js + TS + Tailwind + Drizzle + Neon. Deployed to Vercel
      on a real domain. CI: typecheck, lint, test. `.env.example`, `.gitignore`, `README`.
      *Validation: a green deploy on push.*

- [ ] **M1 — Free anonymous invoice generator + PDF (week 1). Ship publicly and start the SEO
      clock.** Builder, live preview, PDF download, draft autosave, analytics instrumented.
      *Validation: does anyone use it? What is landing→PDF conversion?*

- [ ] **M2 — Auth + accounts (week 2).** Magic link, draft claiming, invoice list, business
      profile and branding settings, numbering.
      *Validation: what fraction of PDF downloaders create an account?*

- [ ] **M3 — Send + public invoice page + view tracking (week 3).** Email send, snapshotting,
      token URLs, `document_events` timeline, Sent/Viewed statuses, delivery webhooks.
      *Validation: do sent invoices get viewed? Is deliverability holding?*

- [ ] **M4 — Get paid (week 4).** Stripe Connect onboarding, Checkout per invoice, Connect
      webhooks, auto-mark-paid, manual mark-paid, bank-details fallback.
      *Validation: does a real invoice get paid end to end? Establish baseline days-to-payment.*

- [ ] **M5 — Reminder ladder (week 5).** Reminder scheduling on send, daily Vercel Cron,
      idempotent sends, cancel-on-paid, friendly/firm tone, per-invoice off switch.
      *Validation: **does days-to-payment drop vs. the M4 baseline?** This is the product thesis —
      if it doesn't move, rethink the positioning before building the paywall.*

- [ ] **M6 — Niche layer + landing pages (week 6).** Niche registry, 3–5 static niche pages,
      presets and copy wired through, Search Console, sitemap, schema.org markup.
      *Validation: impressions appearing in Search Console.*

- [ ] **M7 — Paywall (week 7).** Entitlements module, usage counting, upgrade sheet at the send
      gate, Stripe Billing checkout, billing webhooks, Customer Portal, branding removal.
      *Validation: **first paying customer.***

- [ ] **M8 — Launch polish.** Onboarding, empty states, Sentry, privacy policy and terms,
      transactional email polish, Product Hunt + niche community launch.
      *Validation: 10 paying customers; inspect week-4 retention.*

- [ ] **Phase 2 begins only after M8.** Recurring/retainer first (retention), then client
      management.

### Instrument from M1, not later

Landing → invoice started → PDF downloaded → signup → first send → viewed → paid;
**median days-to-payment (with vs. without reminders)**; reminder→payment conversion; Connect
onboarding completion; free→paid conversion; week-4 retention.

The with/without-reminders comparison is both the product's proof and its advertisement. It only
exists if `document_events` is populated from the first week.

---

## Assumptions

Flagged, not decided. Each one is a place this plan could be wrong.

1. Solo developer, part-time, comfortable with TypeScript/React. *(If not, §4 Option C changes.)*
2. Launching English-first, USD/GBP/EUR, single flat tax rate.
3. No Stripe, DB, or email accounts exist yet; you create all of them.
4. No existing brand, domain, or audience.
5. $12/mo is a starting hypothesis, not a decision — §9 risk 1 may move it.
6. The free tier keeps reminders and payment links (§6) — the highest-leverage pricing
   assumption in the plan.
7. The reminder ladder default (−3d / due / +3d / +7d / +14d) is a guess to be tuned with data.
8. Web-only. No mobile app in any phase.
9. Legal and tax compliance for invoices is the freelancer's responsibility; we surface fields,
   not advice.

---

## Open questions before any code is written

1. **Stack.** Confirm Option A (Next.js + Postgres + Vercel), or pick B/C? Option A is the
   recommendation, but Option C beats it outright if you already know Ruby.

2. **First niche.** Which one seeds the registry and the first landing pages?
   - *Photographers* — high invoice values, strong branding motivation, very reachable. But
     deposits/milestones are common there and those are cut from v1.
   - *Cleaners / trades* — frequent invoices and genuinely painful chasing, so reminders land
     hardest. Recurring work makes them stickier. Harder to reach online.
   - *Tutors / coaches* — recurring sessions, simple flat-rate items, low tax complexity.
     Smallest invoice values, so willingness to pay is weakest.
   - *Designers / developers* — easiest for you to reach and understand, most saturated with
     existing tools.

3. **Which accounts already exist?** Stripe (note: Connect needs enabling separately, plus a
   platform-profile questionnaire, even on an existing account) · database · email sending ·
   domain and hosting. This changes M0 sequencing.

4. **Free-tier shape**, given the price anchoring in §9 risk 1 — free reminders as recommended,
   reminders gated to paid, $9/mo instead of $12, or defer the decision to M7 and validate with
   real users first?

5. **Reminder default.** On by default for every invoice (recommended — it is the product), or
   opt-in per invoice? This is the single biggest tone decision in the product.
