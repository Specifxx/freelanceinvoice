import { formatDateHuman } from '@/lib/dates'
import type { InvoiceSnapshot } from '@/lib/snapshot'
import { formatMoney } from '@/lib/money'
import { bpsToPercent } from '@/lib/totals'
import { contrastOn, getTheme } from '@/themes'

/**
 * Renders a snapshot as paper. The PDF renderer (src/pdf/InvoicePdf.tsx)
 * consumes the same snapshot and the same theme tokens, which is what keeps
 * the on-screen invoice and the emailed PDF from drifting apart.
 */
export function InvoiceDocument({
  snapshot,
  className,
}: {
  snapshot: InvoiceSnapshot
  className?: string
}) {
  const theme = getTheme(snapshot.theme.themeId)
  const t = theme.tokens
  const accent = snapshot.theme.accentColor
  const currency = snapshot.invoice.currency

  const headingStyle = {
    textTransform: t.headingTransform === 'uppercase' ? ('uppercase' as const) : undefined,
    letterSpacing: `${t.headingLetterSpacing}px`,
  }

  return (
    <article
      className={`invoice-paper overflow-hidden ${className ?? ''}`}
      style={{
        fontFamily: t.fontFamily,
        color: t.text,
        borderRadius: t.radius,
        border: `1px solid ${t.border}`,
      }}
    >
      {t.headerLayout === 'band' ? (
        <div
          // Responsive padding: the same component renders inside a narrow
          // preview column and on a full-width public page.
          className="px-6 py-6 sm:px-10 sm:py-7"
          style={{ background: accent, color: contrastOn(accent) }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold" style={headingStyle}>
                Invoice
              </h1>
              <p className="mt-1 text-sm opacity-90">
                {snapshot.invoice.number}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">{snapshot.business.name}</p>
              {snapshot.business.email ? (
                <p className="opacity-90">{snapshot.business.email}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="px-6 py-8 sm:px-10 sm:py-10">
        {t.headerLayout !== 'band' ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <h1
                  className="text-2xl font-bold"
                  style={{ ...headingStyle, color: accent }}
                >
                  Invoice
                </h1>
                <p className="mt-1 text-sm" style={{ color: t.muted }}>
                  {snapshot.invoice.number}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold">{snapshot.business.name}</p>
                {snapshot.business.email ? (
                  <p style={{ color: t.muted }}>{snapshot.business.email}</p>
                ) : null}
                {snapshot.business.phone ? (
                  <p style={{ color: t.muted }}>{snapshot.business.phone}</p>
                ) : null}
              </div>
            </div>
            {t.headerLayout === 'rule' ? (
              <div
                style={{
                  height: 3,
                  background: accent,
                  marginTop: 20,
                  borderRadius: 2,
                }}
              />
            ) : (
              <div
                style={{ height: 1, background: t.border, marginTop: 20 }}
              />
            )}
          </>
        ) : null}

        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <p
              className="text-xs font-semibold"
              style={{ ...headingStyle, color: t.muted }}
            >
              Billed to
            </p>
            <p className="mt-2 text-sm font-semibold">
              {snapshot.client.name || 'Client name'}
            </p>
            {snapshot.client.email ? (
              <p className="text-sm" style={{ color: t.muted }}>
                {snapshot.client.email}
              </p>
            ) : null}
            {snapshot.client.address ? (
              <p
                className="mt-1 whitespace-pre-line text-sm"
                style={{ color: t.muted }}
              >
                {snapshot.client.address}
              </p>
            ) : null}
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-semibold" style={{ ...headingStyle, color: t.muted }}>
                Issued
              </p>
              <p className="mt-1">{formatDateHuman(snapshot.invoice.issueDate)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ ...headingStyle, color: t.muted }}>
                Due
              </p>
              <p className="mt-1 font-semibold">
                {formatDateHuman(snapshot.invoice.dueDate)}
              </p>
            </div>
          </div>
        </div>

        {snapshot.business.address ? (
          <p className="mt-6 whitespace-pre-line text-xs" style={{ color: t.muted }}>
            {snapshot.business.address}
          </p>
        ) : null}

        <div className="mt-8 -mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[360px] border-collapse text-sm">
            <thead>
              <tr style={{ background: t.tableHeaderBg }}>
                <th
                  className="px-3 py-2.5 text-left text-xs font-semibold"
                  style={{ ...headingStyle, color: t.muted }}
                >
                  Description
                </th>
                <th
                  className="px-3 py-2.5 text-right text-xs font-semibold"
                  style={{ ...headingStyle, color: t.muted }}
                >
                  Qty
                </th>
                <th
                  className="px-3 py-2.5 text-right text-xs font-semibold"
                  style={{ ...headingStyle, color: t.muted }}
                >
                  Rate
                </th>
                <th
                  className="px-3 py-2.5 text-right text-xs font-semibold"
                  style={{ ...headingStyle, color: t.muted }}
                >
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {snapshot.items.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-sm"
                    style={{ color: t.muted }}
                  >
                    No line items yet.
                  </td>
                </tr>
              ) : (
                snapshot.items.map((item, index) => (
                  <tr key={index} style={{ borderTop: `1px solid ${t.border}` }}>
                    <td className="px-3 py-3">
                      {item.description || (
                        <span style={{ color: t.muted }}>Item</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {trimQuantity(item.quantity)}
                      {item.unit ? (
                        <span style={{ color: t.muted }}> {item.unit}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {formatMoney(item.unitPriceCents, currency)}
                    </td>
                    <td className="px-3 py-3 text-right font-medium whitespace-nowrap">
                      {formatMoney(item.amountCents, currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt style={{ color: t.muted }}>Subtotal</dt>
              <dd>{formatMoney(snapshot.totals.subtotalCents, currency)}</dd>
            </div>
            {snapshot.invoice.taxRateBps > 0 ? (
              <div className="flex justify-between">
                <dt style={{ color: t.muted }}>
                  {snapshot.invoice.taxLabel} (
                  {bpsToPercent(snapshot.invoice.taxRateBps)}%)
                </dt>
                <dd>{formatMoney(snapshot.totals.taxCents, currency)}</dd>
              </div>
            ) : null}
            <div
              className="flex justify-between pt-2 text-base font-bold"
              style={{ borderTop: `2px solid ${accent}` }}
            >
              <dt>Total due</dt>
              <dd>{formatMoney(snapshot.totals.totalCents, currency)}</dd>
            </div>
          </dl>
        </div>

        {snapshot.invoice.notes ? (
          <div className="mt-8">
            <p className="text-xs font-semibold" style={{ ...headingStyle, color: t.muted }}>
              Notes
            </p>
            <p className="mt-2 whitespace-pre-line text-sm" style={{ color: t.muted }}>
              {snapshot.invoice.notes}
            </p>
          </div>
        ) : null}

        {snapshot.invoice.bankDetails ? (
          <div className="mt-6">
            <p className="text-xs font-semibold" style={{ ...headingStyle, color: t.muted }}>
              Payment details
            </p>
            <p className="mt-2 whitespace-pre-line text-sm" style={{ color: t.muted }}>
              {snapshot.invoice.bankDetails}
            </p>
          </div>
        ) : null}

        {snapshot.showsOurBranding ? (
          <p
            className="mt-10 border-t pt-4 text-center text-xs"
            style={{ borderColor: t.border, color: t.muted }}
          >
            Invoice made with FreelanceInvoice
          </p>
        ) : null}
      </div>
    </article>
  )
}

/** "2.000" reads badly on an invoice; "2" and "2.5" read correctly. */
export function trimQuantity(quantity: string | number): string {
  const n = Number(quantity)
  if (!Number.isFinite(n)) return String(quantity)
  return String(Number(n.toFixed(3)))
}
