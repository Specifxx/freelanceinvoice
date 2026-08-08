import type { Niche } from './types'

export const photography: Niche = {
  slug: 'photography',
  name: 'photographers',
  label: 'Photography',
  seo: {
    title: 'Photography Invoice Template — Free, Branded, Paid Faster',
    h1: 'Photography invoice template',
    metaDescription:
      'Create a branded photography invoice in under a minute. Free to download, no signup. Add a payment link and automatic reminders so shoots get paid without the awkward follow-up.',
    intro:
      'Built for photographers who would rather be editing than chasing a wedding client for the balance. Session fees, day rates, licensing and album line items are already set up — fill in the numbers and send.',
    faq: [
      {
        q: 'What should a photography invoice include?',
        a: 'Your business name and contact details, the client, an invoice number, the shoot date, itemised session or day-rate fees, any licensing or usage terms, expenses such as travel and second shooters, tax if you charge it, the total, and a clear due date. Usage rights in particular are worth stating on the invoice itself.',
      },
      {
        q: 'How do I invoice for a deposit and a balance?',
        a: 'Send a first invoice for the retainer with its own due date, then a second for the balance after delivery. Split invoices are supported today; automatic deposit-then-balance scheduling is on the roadmap.',
      },
      {
        q: 'When should a wedding photographer invoice the balance?',
        a: 'Most photographers invoice the balance two to four weeks before the wedding date, so it clears before delivery. Set the due date accordingly and the reminder ladder handles the follow-up for you.',
      },
    ],
  },
  defaults: {
    unitLabel: 'session',
    paymentTermsDays: 14,
    taxLabel: 'Tax',
    notes:
      'Image usage rights transfer on receipt of full payment. Files are delivered within the agreed turnaround once this invoice is settled.',
    themeId: 'bold',
  },
  lineItemPresets: [
    { description: 'Wedding photography — full day coverage', unit: 'day', defaultQuantity: 1, defaultRateCents: 250_000 },
    { description: 'Portrait session', unit: 'session', defaultQuantity: 1, defaultRateCents: 35_000 },
    { description: 'Half-day event coverage', unit: 'session', defaultQuantity: 1, defaultRateCents: 90_000 },
    { description: 'Additional edited images', unit: 'image', defaultQuantity: 10, defaultRateCents: 2_500 },
    { description: 'Second shooter', unit: 'day', defaultQuantity: 1, defaultRateCents: 45_000 },
    { description: 'Commercial usage licence — 12 months', unit: 'licence', defaultQuantity: 1, defaultRateCents: 60_000 },
    { description: 'Travel and expenses', unit: 'trip', defaultQuantity: 1, defaultRateCents: 0 },
    { description: 'Album design and print', unit: 'album', defaultQuantity: 1, defaultRateCents: 45_000 },
  ],
  reminderCopy: {
    before_3d: {
      friendly: {
        body: 'Hi {clientName},\n\nJust a heads-up that the balance for your shoot — invoice {invoiceNumber} for {amount} — is due on {dueDate}. Your gallery is ready to go once it clears.\n\nThanks,\n{businessName}',
      },
    },
  },
}
