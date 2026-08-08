import type { BuilderItem, BuilderState } from '@/components/InvoiceBuilder'
import type { DocumentWithItems } from './invoices'
import { addDaysIso, todayIso } from './dates'
import { centsToInput } from './money'
import { bpsToPercent } from './totals'
import { getNiche } from '@/niches'
import type { User } from '@/db/schema'

let seed = 0
function key() {
  seed += 1
  return `init-${seed}`
}

/** Blank invoice, pre-filled from the niche so the form starts useful. */
export function defaultBuilderState(options: {
  nicheSlug?: string | null
  user?: User | null
}): BuilderState {
  const niche = getNiche(options.nicheSlug)
  const user = options.user
  const issueDate = todayIso()
  const termsDays =
    user?.defaultPaymentTermsDays ?? niche?.defaults.paymentTermsDays ?? 14

  const firstPreset = niche?.lineItemPresets[0]

  return {
    businessName: user?.businessName ?? '',
    businessEmail: user?.businessEmail ?? user?.email ?? '',
    businessAddress: user?.businessAddress ?? '',
    clientName: '',
    clientEmail: '',
    clientAddress: '',
    issueDate,
    dueDate: addDaysIso(issueDate, termsDays),
    currency: user?.defaultCurrency ?? 'USD',
    taxPercent: String(bpsToPercent(user?.defaultTaxRateBps ?? 0)),
    taxLabel: user?.taxLabel ?? niche?.defaults.taxLabel ?? 'Tax',
    notes: niche?.defaults.notes ?? '',
    themeId: user?.themeId ?? niche?.defaults.themeId ?? 'minimal',
    accentColor: user?.accentColor ?? '#0f172a',
    remindersEnabled: user?.remindersEnabledByDefault ?? true,
    reminderTone: user?.reminderTone ?? 'friendly',
    // One empty row, pre-labelled with the niche's unit so the first thing the
    // user sees already looks like their kind of invoice.
    items: [
      {
        key: key(),
        description: '',
        quantity: '1',
        unit: firstPreset?.unit ?? niche?.defaults.unitLabel ?? '',
        rate: '',
      },
    ],
  }
}

/** Rehydrates the form from a saved draft. */
export function builderStateFromDocument(
  doc: DocumentWithItems,
  user: User | null,
  draftBusiness?: { name: string; email: string; address: string } | null,
): BuilderState {
  const items: BuilderItem[] =
    doc.items.length > 0
      ? doc.items.map((item) => ({
          key: `item-${item.id}`,
          description: item.description,
          quantity: String(Number(item.quantity)),
          unit: item.unit ?? '',
          rate: item.unitPriceCents ? centsToInput(item.unitPriceCents, doc.currency) : '',
        }))
      : [{ key: key(), description: '', quantity: '1', unit: '', rate: '' }]

  return {
    businessName: draftBusiness?.name ?? user?.businessName ?? '',
    businessEmail: draftBusiness?.email ?? user?.businessEmail ?? user?.email ?? '',
    businessAddress: draftBusiness?.address ?? user?.businessAddress ?? '',
    clientName: doc.clientName ?? '',
    clientEmail: doc.clientEmail ?? '',
    clientAddress: doc.clientAddress ?? '',
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    currency: doc.currency,
    taxPercent: String(bpsToPercent(doc.taxRateBps)),
    taxLabel: doc.taxLabel,
    notes: doc.notes ?? '',
    themeId: doc.themeId,
    accentColor: doc.accentColor,
    remindersEnabled: doc.remindersEnabled,
    reminderTone: doc.reminderTone,
    items,
  }
}
