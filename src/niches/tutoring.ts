import type { Niche } from './types'

export const tutoring: Niche = {
  slug: 'tutoring',
  name: 'tutors and coaches',
  label: 'Tutoring & coaching',
  seo: {
    title: 'Tutoring Invoice Template — Free, Simple, Paid Faster',
    h1: 'Tutoring invoice template',
    metaDescription:
      'Create a clean tutoring invoice in under a minute. Free, no signup. Per-session and per-hour lines, block bookings, a one-tap payment link, and automatic reminders for late parents.',
    intro:
      'For tutors and coaches billing parents and clients for sessions. Per-session, per-hour and block-booking lines are built in, and reminders handle the follow-up so it never gets awkward at the next lesson.',
    faq: [
      {
        q: 'What should a tutoring invoice include?',
        a: 'Your name and contact details, the student or client name, the sessions covered with their dates, the rate per session or hour, the total, and the due date. Naming the specific sessions prevents most billing disputes with parents.',
      },
      {
        q: 'Should I invoice per session or per block?',
        a: 'Blocks paid in advance are better for cash flow and reduce no-shows. Invoice for a block of sessions with a due date before the first one, and let the reminders make sure it lands.',
      },
      {
        q: 'How do I handle cancellations on an invoice?',
        a: 'State your cancellation window in the notes field — it prints on every invoice. Bill for late cancellations as their own line so the charge is visible rather than buried in a total.',
      },
    ],
  },
  defaults: {
    unitLabel: 'session',
    paymentTermsDays: 7,
    taxLabel: 'Tax',
    notes:
      'Sessions cancelled with less than 24 hours notice are charged in full. Payment is due before the first session of the block.',
    themeId: 'minimal',
  },
  lineItemPresets: [
    { description: 'One-to-one tutoring session (60 min)', unit: 'session', defaultQuantity: 4, defaultRateCents: 4_500 },
    { description: 'One-to-one tutoring session (90 min)', unit: 'session', defaultQuantity: 4, defaultRateCents: 6_500 },
    { description: 'Block of 10 sessions', unit: 'block', defaultQuantity: 1, defaultRateCents: 40_000 },
    { description: 'Group session', unit: 'session', defaultQuantity: 4, defaultRateCents: 2_500 },
    { description: 'Exam preparation intensive', unit: 'hour', defaultQuantity: 6, defaultRateCents: 5_500 },
    { description: 'Coaching call', unit: 'call', defaultQuantity: 2, defaultRateCents: 12_000 },
    { description: 'Materials and workbooks', unit: 'set', defaultQuantity: 1, defaultRateCents: 0 },
    { description: 'Late cancellation', unit: 'session', defaultQuantity: 1, defaultRateCents: 4_500 },
  ],
}
