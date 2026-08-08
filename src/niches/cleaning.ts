import type { Niche } from './types'

export const cleaning: Niche = {
  slug: 'cleaning',
  name: 'cleaners',
  label: 'Cleaning & trades',
  seo: {
    title: 'Cleaning Invoice Template — Free, Professional, Paid Faster',
    h1: 'Cleaning invoice template',
    metaDescription:
      'Make a professional cleaning invoice in under a minute. Free, no signup. Per-room and per-hour line items, a one-tap payment link, and automatic reminders that chase late payers for you.',
    intro:
      'For cleaners and domestic trades invoicing a lot of small jobs. Per-hour, per-room and per-visit lines are ready to go, and reminders chase the slow payers so you do not have to text a client twice.',
    faq: [
      {
        q: 'What should a cleaning invoice include?',
        a: 'Your business name and contact details, the client and the property address, the service date, what was cleaned and on what basis (hourly, per room, or a flat visit rate), any materials charged, tax if applicable, the total, and the due date with your payment terms.',
      },
      {
        q: 'How do I invoice regular weekly clients?',
        a: 'Duplicate the previous invoice and change the dates — two taps. Fully automatic recurring invoices for weekly and fortnightly rounds are the next feature on the roadmap.',
      },
      {
        q: 'What payment terms should a cleaner use?',
        a: 'Seven days is typical for domestic work and keeps cash flowing; commercial contracts often run to 14 or 30. Shorter terms plus automatic reminders beat long terms and manual chasing.',
      },
    ],
  },
  defaults: {
    unitLabel: 'hour',
    paymentTermsDays: 7,
    taxLabel: 'VAT',
    notes:
      'Payment due within 7 days of the service date. Please include the invoice number as your payment reference.',
    themeId: 'minimal',
  },
  lineItemPresets: [
    { description: 'Standard domestic clean', unit: 'hour', defaultQuantity: 3, defaultRateCents: 3_000 },
    { description: 'Deep clean', unit: 'hour', defaultQuantity: 6, defaultRateCents: 3_500 },
    { description: 'End of tenancy clean', unit: 'job', defaultQuantity: 1, defaultRateCents: 22_000 },
    { description: 'Oven clean', unit: 'appliance', defaultQuantity: 1, defaultRateCents: 6_500 },
    { description: 'Window cleaning — exterior', unit: 'window', defaultQuantity: 8, defaultRateCents: 500 },
    { description: 'Carpet clean', unit: 'room', defaultQuantity: 2, defaultRateCents: 4_500 },
    { description: 'Office clean — regular visit', unit: 'visit', defaultQuantity: 4, defaultRateCents: 5_500 },
    { description: 'Materials and consumables', unit: 'job', defaultQuantity: 1, defaultRateCents: 0 },
  ],
  reminderCopy: {
    after_3d: {
      friendly: {
        body: "Hi {clientName},\n\nInvoice {invoiceNumber} for {amount} was due on {dueDate}. No rush if it's already on its way — the payment link below is the quickest option if not.\n\nThanks,\n{businessName}",
      },
    },
  },
}
