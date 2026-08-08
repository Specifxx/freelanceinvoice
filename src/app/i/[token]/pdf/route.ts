import { clientIpFrom, recordEvent } from '@/lib/events'
import { getDocumentByToken, getOwnedDocumentById, snapshotFor } from '@/lib/invoices'
import { LIMITS, rateLimit } from '@/lib/rate-limit'
import { pdfFilename, renderInvoicePdf } from '@/pdf/InvoicePdf'

export const runtime = 'nodejs'

/**
 * The client's own copy. Unauthenticated by design — the 128-bit token is the
 * capability — and served from the frozen snapshot, so it always matches what
 * they were originally sent.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params

  const ip = clientIpFrom(request.headers) ?? 'unknown'
  const limit = rateLimit(`pdf-public:${ip}`, LIMITS.pdf.limit, LIMITS.pdf.windowMs)
  if (!limit.allowed) {
    return new Response('Too many requests', { status: 429 })
  }

  const doc = await getDocumentByToken(token)
  if (!doc || !doc.sentAt) return new Response('Not found', { status: 404 })

  const owner = (await getOwnedDocumentById(doc.id))?.owner ?? null
  const snapshot = snapshotFor(doc, owner)
  const pdf = await renderInvoicePdf(snapshot)

  await recordEvent({
    documentId: doc.id,
    type: 'pdf_downloaded',
    ip: clientIpFrom(request.headers),
    userAgent: request.headers.get('user-agent'),
    meta: { by: 'client' },
  })

  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${pdfFilename(snapshot)}"`,
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
