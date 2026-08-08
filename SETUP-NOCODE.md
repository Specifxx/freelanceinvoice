# Getting your app online — no coding

This gets FreelanceInvoice running at a real web address you can open on your
phone. Everything happens in your browser. You will not open a terminal or
write a line of code.

**Time:** about 20 minutes. **Cost:** nothing — all three services have free
plans that are plenty to start.

You will create three free accounts:

| | What it does |
|---|---|
| **Neon** | Stores your invoices |
| **Resend** | Sends the emails |
| **Vercel** | Runs the website |

Keep a notes file open. You will copy five values as you go, and paste them all
in at the end.

---

## Step 1 — Neon (the database)

1. Go to **neon.tech** and sign up (use "Continue with GitHub" — it's fastest).
2. Create a project. Any name. Pick the region closest to you.
3. On the project page you'll see a **Connection string** box. Click the copy
   icon.
   → **Save this as `DATABASE_URL`.** It starts with `postgresql://`.
   *(If offered a choice, take the **pooled** one.)*
4. In the left sidebar click **SQL Editor**.
5. Open the file **`setup.sql`** from this repository
   ([view it here](./setup.sql)), select all of it, and copy it.
6. Paste it into the SQL Editor and click **Run**.

You should see it finish without red errors. That created the 13 tables your
app needs. You never have to do this again.

---

## Step 2 — Resend (the emails)

The app signs people in by emailing them a link, so it needs a way to send mail.

1. Go to **resend.com** and sign up.
2. Click **API Keys** → **Create API Key**. Name it anything, permission
   "Sending access".
   → **Save this as `RESEND_API_KEY`.** It starts with `re_`.

That's it for now. You'll use Resend's built-in test address to begin with:

→ **Save `onboarding@resend.dev` as `EMAIL_FROM`.**

> **Important limitation of the test address:** it can only send email to the
> address you signed up to Resend with. That's fine for trying the app on
> yourself. To email real clients you'll need to verify your own domain in
> Resend — that's Step 5, and you can do it later.

---

## Step 3 — Two passwords for the app

The app needs two long random strings. They're just passwords it uses
internally; you never type them again.

Make up two different strings of at least 40 random characters — mash the
keyboard, or use a password generator set to 40 characters.

→ **Save one as `AUTH_SECRET`.**
→ **Save the other as `CRON_SECRET`.**

---

## Step 4 — Vercel (put it online)

1. Go to **vercel.com** and sign up **with GitHub**.
2. Click **Add New…** → **Project**.
3. Find **freelanceinvoice** in the list and click **Import**.
4. Leave every build setting alone. Do not change the framework or commands.
5. Expand **Environment Variables** and add these five:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | from Step 1 |
   | `RESEND_API_KEY` | from Step 2 |
   | `EMAIL_FROM` | `onboarding@resend.dev` |
   | `AUTH_SECRET` | from Step 3 |
   | `CRON_SECRET` | from Step 3 |

   Type the names exactly — capitals and underscores included.

6. Click **Deploy** and wait a couple of minutes.

When it finishes Vercel shows you a link like
`freelanceinvoice-xxxx.vercel.app`. **That's your app.** Open it.

> You don't need to set a web address anywhere — the app works out its own
> Vercel address automatically.

---

## Step 5 — Try it

1. Open your new address. You'll see the landing page.
2. Click **Create an invoice — free**. Fill in a client name and one line item.
3. Click **Download PDF**. That works without an account at all.
4. Click **Send & get paid**, enter **the email address you signed up to Resend
   with** (the test address can only reach that one).
5. Check your inbox, click the link, then click **Sign in** on the confirm
   screen. Your invoice comes with you.
6. Go to **Settings** and fill in your business name and bank details.
7. Send the invoice to yourself. You'll get it as a real email with a PDF
   attached.
8. Open that invoice link — back in the app, its status flips to **Viewed**.
9. Click **Mark as paid**. The scheduled reminders all switch to *cancelled*.

That's the whole product working.

---

## What to do next, in order

**Use your own email domain.** In Resend, click **Domains** → add yours → it
gives you three DNS records to add at whoever you bought the domain from. Once
verified, change `EMAIL_FROM` in Vercel to `invoices@yourdomain.com`. Until you
do this you can only email yourself.

**Turn on card payments.** Follow Stage 2 in [SHIP.md](./SHIP.md). It's the same
kind of copy-and-paste, but Stripe has a review step that can take a day, so
start the application early.

**Use your own web address.** In Vercel: **Settings → Domains** → add it, then
add the records it gives you. After that, add one more environment variable
`APP_URL` set to `https://yourdomain.com` (no slash at the end).

---

## If something goes wrong

| What you see | What to do |
|---|---|
| Deploy fails immediately | An environment variable name is misspelled. They're case-sensitive. |
| Every page shows an error | The `setup.sql` step didn't finish. Re-run it in Neon's SQL Editor. |
| No sign-in email arrives | With the test address you can only email the account you signed up to Resend with. Check spam too. |
| Invoice links point at the wrong address | You added a custom domain — set `APP_URL` in Vercel to match, then redeploy. |
| Something else | In Vercel open your project → **Logs**. The most recent red line usually names the problem. |

To change any environment variable later: Vercel → your project → **Settings**
→ **Environment Variables** → edit → then **Deployments** → **⋯** on the newest
one → **Redeploy**.
