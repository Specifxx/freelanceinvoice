import { clientIpFrom, recordEvent } from '@/lib/events'
import { jsonError, resolveDocumentActor } from '@/lib/document-access'
import { draftBusinessOf } from '@/lib/draft-business'
import { snapshotFor } from '@/lib/invoices'
import { LIMITS, rateLimit } from '@/lib/rate-limit'
import { pdfFilename, renderInvoicePdf } from '@/pdf/InvoicePdf'
import type { InvoiceSnapshot } from '@/lib/snapshot'

// @react-pdf/renderer is Node-only.
export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  // PDF rendering is the most CPU-expensive thing an anonymous visitor can
  // trigger, so it gets its own tighter limit.
  const ip = clientIpFrom(request.headers) ?? 'unknown'
  const limit = rateLimit(`pdf:${ip}`, LIMITS.pdf.limit, LIMITS.pdf.windowMs)
  if (!limit.allowed) return jsonError('Too many PDF downloads. Try again shortly.', 429)

  const actor = await resolveDocumentActor(id)
  if (!actor) return jsonError('Not found', 404)

  const business =
    actor.mode === 'anonymous'
      ? draftBusinessOf(actor.doc.draftBusiness)
      : null

  const snapshot: InvoiceSnapshot =
    actor.mode === 'owner'
      ? snapshotFor(actor.doc, actor.user)
      : snapshotFor(actor.doc, {
          businessName: business?.name ?? null,
          name: null,
          businessAddress: business?.address ?? null,
          businessEmail: business?.email ?? null,
          email: null,
          businessPhone: null,
          logoUrl: null,
          bankDetails: null,
          // Anonymous downloads always carry our footer — it is the whole
          // viral loop of the free tool.
          plan: 'free',
        })

  const pdf = await renderInvoicePdf(snapshot)

  await recordEvent({
    documentId: id,
    type: 'pdf_downloaded',
    ip: clientIpFrom(request.headers),
    userAgent: request.headers.get('user-agent'),
  })

  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${pdfFilename(snapshot)}"`,
      'cache-control': 'no-store',
    },
  })
}
