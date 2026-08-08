import type { Niche } from './types'

export const design: Niche = {
  slug: 'design',
  name: 'designers and developers',
  label: 'Design & development',
  seo: {
    title: 'Freelance Design Invoice Template — Free, Branded, Paid Faster',
    h1: 'Freelance design invoice template',
    metaDescription:
      'Create a branded freelance design or development invoice in under a minute. Free, no signup. Day rates, milestones and retainers, a one-tap payment link, and automatic reminders on net-30 clients.',
    intro:
      'For freelance designers and developers invoicing agencies and startups. Day rates, sprint milestones and retainers are set up, and the reminder ladder handles net-30 clients who need three nudges.',
    faq: [
      {
        q: 'What should a freelance design invoice include?',
        a: 'Your business details, the client and their billing contact, a purchase-order reference if the client uses one, itemised work by day rate or milestone, the total, tax if you charge it, and payment terms. Agencies routinely reject invoices missing a PO number, so add it as a line in your notes.',
      },
      {
        q: 'How do I chase a late invoice without damaging the relationship?',
        a: 'Consistency beats confrontation. An automatic reminder on a schedule reads as process rather than personal, which is exactly why automating it works better than remembering to send one yourself.',
      },
      {
        q: 'Should I invoice a deposit up front?',
        a: 'For new clients, yes — commonly 30 to 50 per cent before work starts. Send it as its own invoice with a due date before the kickoff date.',
      },
    ],
  },
  defaults: {
    unitLabel: 'day',
    paymentTermsDays: 14,
    taxLabel: 'Tax',
    notes:
      'Payment due within 14 days. Intellectual property transfers to the client on receipt of full payment.',
    themeId: 'classic',
  },
  lineItemPresets: [
    { description: 'Design and development — day rate', unit: 'day', defaultQuantity: 5, defaultRateCents: 55_000 },
    { description: 'Discovery and scoping', unit: 'day', defaultQuantity: 2, defaultRateCents: 55_000 },
    { description: 'Brand identity package', unit: 'project', defaultQuantity: 1, defaultRateCents: 350_000 },
    { description: 'Website design — milestone 1 of 3', unit: 'milestone', defaultQuantity: 1, defaultRateCents: 150_000 },
    { description: 'Monthly retainer', unit: 'month', defaultQuantity: 1, defaultRateCents: 200_000 },
    { description: 'Hourly consulting', unit: 'hour', defaultQuantity: 8, defaultRateCents: 9_500 },
    { description: 'Revisions beyond agreed scope', unit: 'hour', defaultQuantity: 2, defaultRateCents: 9_500 },
    { description: 'Third-party licences and assets', unit: 'item', defaultQuantity: 1, defaultRateCents: 0 },
  ],
  reminderCopy: {
    after_7d: {
      firm: {
        body: 'Hi {clientName},\n\nInvoice {invoiceNumber} for {amount} is now {daysOverdue} days past its due date of {dueDate}. Could you confirm it has been entered for payment, and let me know the expected payment run date?\n\n{businessName}',
      },
    },
  },
}
