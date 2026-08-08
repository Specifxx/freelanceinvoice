'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { users } from '@/db/schema'
import { requireUser } from '@/lib/auth'
import { createDraft, getOwnedDocument, saveDocument } from '@/lib/invoices'
import { percentToBps } from '@/lib/totals'
import { isThemeId, isValidHexColor } from '@/themes'
import { nicheSlugs } from '@/niches'
import { isReminderTone } from '@/lib/reminders'

export async function createInvoiceAction() {
  const user = await requireUser()
  const doc = await createDraft({ ownerId: user.id, nicheSlug: user.nicheSlug })
  redirect(`/invoices/${doc.id}/edit`)
}

/**
 * Duplicating is how a user edits a sent invoice — the original stays frozen
 * as the record of what the client actually received.
 */
export async function duplicateInvoiceAction(formData: FormData) {
  const user = await requireUser()
  const sourceId = String(formData.get('id') ?? '')

  const source = await getOwnedDocument(sourceId, user.id)
  if (!source) redirect('/invoices')

  const copy = await createDraft({ ownerId: user.id, nicheSlug: source.nicheSlug })

  await saveDocument(copy.id, {
    clientName: source.clientName,
    clientEmail: source.clientEmail,
    clientAddress: source.clientAddress,
    issueDate: copy.issueDate,
    dueDate: copy.dueDate,
    currency: source.currency,
    taxRateBps: source.taxRateBps,
    taxLabel: source.taxLabel,
    notes: source.notes,
    terms: source.terms,
    themeId: source.themeId,
    accentColor: source.accentColor,
    remindersEnabled: source.remindersEnabled,
    reminderTone: source.reminderTone,
    items: source.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: item.unitPriceCents,
      taxable: item.taxable,
    })),
  })

  redirect(`/invoices/${copy.id}/edit`)
}

export async function saveSettingsAction(formData: FormData) {
  const user = await requireUser()

  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === 'string' ? v.trim() : ''
  }

  const themeId = str('themeId')
  const accentColor = str('accentColor')
  const nicheSlug = str('nicheSlug')
  const tone = str('reminderTone')
  const terms = Number(str('defaultPaymentTermsDays'))

  await db
    .update(users)
    .set({
      name: str('name') || null,
      businessName: str('businessName') || null,
      businessEmail: str('businessEmail') || null,
      businessPhone: str('businessPhone') || null,
      businessAddress: str('businessAddress') || null,
      bankDetails: str('bankDetails') || null,
      defaultCurrency: (str('defaultCurrency') || 'USD').toUpperCase().slice(0, 3),
      defaultPaymentTermsDays:
        Number.isFinite(terms) && terms >= 0 && terms <= 365 ? terms : 14,
      defaultTaxRateBps: percentToBps(str('defaultTaxPercent') || '0'),
      taxLabel: str('taxLabel') || 'Tax',
      themeId: isThemeId(themeId) ? themeId : 'minimal',
      accentColor: isValidHexColor(accentColor) ? accentColor : '#0f172a',
      nicheSlug: nicheSlugs().includes(nicheSlug) ? nicheSlug : null,
      invoiceNumberFormat: str('invoiceNumberFormat') || 'INV-{YYYY}-{0000}',
      remindersEnabledByDefault: formData.get('remindersEnabledByDefault') === 'on',
      reminderTone: isReminderTone(tone) ? tone : 'friendly',
    })
    .where(eq(users.id, user.id))

  revalidatePath('/settings')
  redirect('/settings?saved=1')
}
