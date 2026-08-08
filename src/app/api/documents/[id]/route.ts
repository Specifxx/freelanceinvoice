import { z } from 'zod'
import { db } from '@/db'
import { documents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { isIsoDate } from '@/lib/dates'
import { jsonError, resolveDocumentActor } from '@/lib/document-access'
import { saveDocument } from '@/lib/invoices'
import { LIMITS, rateLimit } from '@/lib/rate-limit'
import { clientIpFrom } from '@/lib/events'
import { isValidHexColor, isThemeId } from '@/themes'

export const runtime = 'nodejs'

const ItemSchema = z.object({
  description: z.string().max(500).default(''),
  quantity: z.union([z.string(), z.number()]).default('1'),
  unit: z.string().max(40).nullable().optional(),
  unitPriceCents: z.number().int().min(-100_000_000).max(100_000_000).default(0),
  taxable: z.boolean().optional(),
})

const BodySchema = z.object({
  businessName: z.string().max(200).optional(),
  businessEmail: z.string().max(320).optional(),
  businessAddress: z.string().max(1000).optional(),
  clientName: z.string().max(200).nullable().optional(),
  clientEmail: z.string().max(320).nullable().optional(),
  clientAddress: z.string().max(1000).nullable().optional(),
  issueDate: z.string().refine(isIsoDate, 'Invalid issue date'),
  dueDate: z.string().refine(isIsoDate, 'Invalid due date'),
  currency: z.string().length(3),
  taxRateBps: z.number().int().min(0).max(100_000),
  taxLabel: z.string().max(40),
  notes: z.string().max(4000).nullable().optional(),
  themeId: z.string(),
  accentColor: z.string(),
  remindersEnabled: z.boolean(),
  reminderTone: z.string(),
  // 200 lines is far past any real invoice and bounds the render cost.
  items: z.array(ItemSchema).max(200),
})

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  const ip = clientIpFrom(request.headers) ?? 'unknown'
  const limit = rateLimit(`draft:${ip}`, LIMITS.draftSave.limit, LIMITS.draftSave.windowMs)
  if (!limit.allowed) return jsonError('Too many saves. Slow down a moment.', 429)

  const actor = await resolveDocumentActor(id)
  if (!actor) return jsonError('Not found', 404)

  // A sent invoice is a record of what the client received. Editing it would
  // silently change a document someone already has — see PLAN.md §3.
  if (actor.doc.sentAt) {
    return jsonError(
      'This invoice has already been sent and cannot be edited. Duplicate it to make changes.',
      409,
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON', 400)
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return jsonError(first ? `${first.path.join('.')}: ${first.message}` : 'Invalid data', 400)
  }
  const data = parsed.data

  await saveDocument(id, {
    clientName: data.clientName ?? null,
    clientEmail: data.clientEmail ?? null,
    clientAddress: data.clientAddress ?? null,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    currency: data.currency.toUpperCase(),
    taxRateBps: data.taxRateBps,
    taxLabel: data.taxLabel,
    notes: data.notes ?? null,
    terms: null,
    themeId: isThemeId(data.themeId) ? data.themeId : 'minimal',
    accentColor: isValidHexColor(data.accentColor) ? data.accentColor : '#0f172a',
    remindersEnabled: data.remindersEnabled,
    reminderTone: data.reminderTone,
    items: data.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit ?? null,
      unitPriceCents: item.unitPriceCents,
      taxable: item.taxable,
    })),
  })

  // Anonymous drafts carry the business details on the row, since there is no
  // user profile to read them from yet.
  if (actor.mode === 'anonymous') {
    await db
      .update(documents)
      .set({
        draftBusiness: {
          name: data.businessName ?? '',
          email: data.businessEmail ?? '',
          address: data.businessAddress ?? '',
        },
      })
      .where(eq(documents.id, id))
  }

  return Response.json({ ok: true })
}
