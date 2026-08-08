import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'
import { trimQuantity } from '@/components/InvoiceDocument'
import { formatDateHuman } from '@/lib/dates'
import type { InvoiceSnapshot } from '@/lib/snapshot'
import { formatMoney } from '@/lib/money'
import { bpsToPercent } from '@/lib/totals'
import { contrastOn, getTheme } from '@/themes'

/**
 * The PDF twin of src/components/InvoiceDocument.tsx. Both render the same
 * snapshot through the same theme tokens, so the two stay visually in step.
 *
 * The duplication is the accepted cost of `@react-pdf/renderer`: no Chromium
 * in the serverless bundle, no cold-start penalty, deterministic output. It is
 * fine at three themes. If themes proliferate, swap this for headless Chromium
 * rendering the HTML component and delete this file — see PLAN.md §4.
 *
 * Only the three built-in PDF fonts are used, so there is no font file to
 * bundle and no network fetch at render time.
 */

export function InvoicePdf({ snapshot }: { snapshot: InvoiceSnapshot }) {
  const theme = getTheme(snapshot.theme.themeId)
  const t = theme.tokens
  const accent = snapshot.theme.accentColor
  const currency = snapshot.invoice.currency
  const upper = t.headingTransform === 'uppercase'

  const s = StyleSheet.create({
    page: {
      fontFamily: t.pdfFont,
      fontSize: 10,
      color: t.text,
      paddingTop: t.headerLayout === 'band' ? 0 : 40,
      paddingBottom: 48,
      paddingHorizontal: 0,
    },
    band: {
      backgroundColor: accent,
      color: contrastOn(accent),
      paddingVertical: 24,
      paddingHorizontal: 40,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 28,
    },
    body: { paddingHorizontal: 40 },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    title: {
      fontFamily: t.pdfFontBold,
      fontSize: 20,
      letterSpacing: t.headingLetterSpacing,
    },
    rule: { height: 3, backgroundColor: accent, marginTop: 16 },
    hairline: { height: 1, backgroundColor: t.border, marginTop: 16 },
    muted: { color: t.muted },
    sectionLabel: {
      fontFamily: t.pdfFontBold,
      fontSize: 8,
      color: t.muted,
      letterSpacing: t.headingLetterSpacing,
      marginBottom: 5,
    },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: t.tableHeaderBg,
      paddingVertical: 7,
      paddingHorizontal: 8,
      marginTop: 28,
    },
    row: {
      flexDirection: 'row',
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    colDesc: { flex: 4 },
    colQty: { flex: 1.2, textAlign: 'right' },
    colRate: { flex: 1.5, textAlign: 'right' },
    colAmount: { flex: 1.5, textAlign: 'right' },
    colHead: {
      fontFamily: t.pdfFontBold,
      fontSize: 8,
      color: t.muted,
      letterSpacing: t.headingLetterSpacing,
    },
    totals: { marginTop: 20, marginLeft: 'auto', width: 210 },
    totalsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 3,
    },
    grandTotal: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingTop: 7,
      marginTop: 5,
      borderTopWidth: 2,
      borderTopColor: accent,
    },
    bold: { fontFamily: t.pdfFontBold },
    footer: {
      position: 'absolute',
      bottom: 24,
      left: 40,
      right: 40,
      textAlign: 'center',
      fontSize: 8,
      color: t.muted,
      borderTopWidth: 1,
      borderTopColor: t.border,
      paddingTop: 8,
    },
  })

  return (
    <Document
      title={`Invoice ${snapshot.invoice.number}`}
      author={snapshot.business.name}
    >
      <Page size="A4" style={s.page}>
        {t.headerLayout === 'band' ? (
          <View style={s.band}>
            <View>
              <Text style={s.title}>{upper ? 'INVOICE' : 'Invoice'}</Text>
              <Text style={{ fontSize: 10, marginTop: 4 }}>
                {snapshot.invoice.number}
              </Text>
            </View>
            <View style={{ textAlign: 'right' }}>
              <Text style={s.bold}>{snapshot.business.name}</Text>
              {snapshot.business.email ? (
                <Text style={{ fontSize: 9, marginTop: 2 }}>
                  {snapshot.business.email}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={s.body}>
          {t.headerLayout !== 'band' ? (
            <>
              <View style={s.headerRow}>
                <View>
                  <Text style={[s.title, { color: accent }]}>
                    {upper ? 'INVOICE' : 'Invoice'}
                  </Text>
                  <Text style={[s.muted, { fontSize: 10, marginTop: 4 }]}>
                    {snapshot.invoice.number}
                  </Text>
                </View>
                <View style={{ textAlign: 'right' }}>
                  <Text style={s.bold}>{snapshot.business.name}</Text>
                  {snapshot.business.email ? (
                    <Text style={[s.muted, { fontSize: 9, marginTop: 2 }]}>
                      {snapshot.business.email}
                    </Text>
                  ) : null}
                  {snapshot.business.phone ? (
                    <Text style={[s.muted, { fontSize: 9 }]}>
                      {snapshot.business.phone}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={t.headerLayout === 'rule' ? s.rule : s.hairline} />
            </>
          ) : null}

          <View style={s.metaRow}>
            <View style={{ flex: 2 }}>
              <Text style={s.sectionLabel}>{upper ? 'BILLED TO' : 'Billed to'}</Text>
              <Text style={s.bold}>{snapshot.client.name || 'Client name'}</Text>
              {snapshot.client.email ? (
                <Text style={[s.muted, { marginTop: 2 }]}>
                  {snapshot.client.email}
                </Text>
              ) : null}
              {snapshot.client.address ? (
                <Text style={[s.muted, { marginTop: 2 }]}>
                  {snapshot.client.address}
                </Text>
              ) : null}
            </View>
            <View style={{ flex: 1, textAlign: 'right' }}>
              <Text style={s.sectionLabel}>{upper ? 'ISSUED' : 'Issued'}</Text>
              <Text>{formatDateHuman(snapshot.invoice.issueDate)}</Text>
              <Text style={[s.sectionLabel, { marginTop: 10 }]}>
                {upper ? 'DUE' : 'Due'}
              </Text>
              <Text style={s.bold}>
                {formatDateHuman(snapshot.invoice.dueDate)}
              </Text>
            </View>
          </View>

          {snapshot.business.address ? (
            <Text style={[s.muted, { fontSize: 8, marginTop: 14 }]}>
              {snapshot.business.address}
            </Text>
          ) : null}

          <View style={s.tableHeader}>
            <Text style={[s.colDesc, s.colHead]}>
              {upper ? 'DESCRIPTION' : 'Description'}
            </Text>
            <Text style={[s.colQty, s.colHead]}>{upper ? 'QTY' : 'Qty'}</Text>
            <Text style={[s.colRate, s.colHead]}>{upper ? 'RATE' : 'Rate'}</Text>
            <Text style={[s.colAmount, s.colHead]}>
              {upper ? 'AMOUNT' : 'Amount'}
            </Text>
          </View>

          {snapshot.items.map((item, index) => (
            <View key={index} style={s.row} wrap={false}>
              <Text style={s.colDesc}>{item.description || 'Item'}</Text>
              <Text style={s.colQty}>
                {trimQuantity(item.quantity)}
                {item.unit ? ` ${item.unit}` : ''}
              </Text>
              <Text style={s.colRate}>
                {formatMoney(item.unitPriceCents, currency)}
              </Text>
              <Text style={[s.colAmount, s.bold]}>
                {formatMoney(item.amountCents, currency)}
              </Text>
            </View>
          ))}

          <View style={s.totals}>
            <View style={s.totalsRow}>
              <Text style={s.muted}>Subtotal</Text>
              <Text>{formatMoney(snapshot.totals.subtotalCents, currency)}</Text>
            </View>
            {snapshot.invoice.taxRateBps > 0 ? (
              <View style={s.totalsRow}>
                <Text style={s.muted}>
                  {snapshot.invoice.taxLabel} (
                  {bpsToPercent(snapshot.invoice.taxRateBps)}%)
                </Text>
                <Text>{formatMoney(snapshot.totals.taxCents, currency)}</Text>
              </View>
            ) : null}
            <View style={s.grandTotal}>
              <Text style={[s.bold, { fontSize: 12 }]}>Total due</Text>
              <Text style={[s.bold, { fontSize: 12 }]}>
                {formatMoney(snapshot.totals.totalCents, currency)}
              </Text>
            </View>
          </View>

          {snapshot.invoice.notes ? (
            <View style={{ marginTop: 28 }}>
              <Text style={s.sectionLabel}>{upper ? 'NOTES' : 'Notes'}</Text>
              <Text style={s.muted}>{snapshot.invoice.notes}</Text>
            </View>
          ) : null}

          {snapshot.invoice.bankDetails ? (
            <View style={{ marginTop: 18 }}>
              <Text style={s.sectionLabel}>
                {upper ? 'PAYMENT DETAILS' : 'Payment details'}
              </Text>
              <Text style={s.muted}>{snapshot.invoice.bankDetails}</Text>
            </View>
          ) : null}
        </View>

        {snapshot.showsOurBranding ? (
          <Text style={s.footer} fixed>
            Invoice made with FreelanceInvoice
          </Text>
        ) : null}
      </Page>
    </Document>
  )
}

export async function renderInvoicePdf(
  snapshot: InvoiceSnapshot,
): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf snapshot={snapshot} />)
}

/** "Invoice INV-2026-0007 from Rowan Studio.pdf", safe for any filesystem. */
export function pdfFilename(snapshot: InvoiceSnapshot): string {
  const parts = ['Invoice', snapshot.invoice.number, 'from', snapshot.business.name]
  return `${parts.join(' ').replace(/[^\w\-. ]+/g, '').trim() || 'Invoice'}.pdf`
}
