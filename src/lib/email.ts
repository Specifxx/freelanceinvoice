import { Resend } from 'resend'

/**
 * Sending rules that protect deliverability — if invoices land in spam the
 * product simply does not work:
 *
 *  - We always send from OUR verified domain. Users never set an arbitrary
 *    `From`; that is spoofing and it torches domain reputation. Verified
 *    custom sending domains are a phase-2 feature.
 *  - The freelancer's name goes in the display name and their address in
 *    Reply-To, so a client replying reaches them, not us.
 */

let client: Resend | null = null

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  client ??= new Resend(key)
  return client
}

/**
 * The public origin, used to build every absolute link in email and every
 * Stripe redirect.
 *
 * APP_URL wins when set. Otherwise we fall back to the production domain Vercel
 * injects automatically, which removes a chicken-and-egg on first deploy: you
 * cannot know your URL until after deploying, and a wrong value here silently
 * emails clients links that point at localhost.
 *
 * VERCEL_PROJECT_PRODUCTION_URL is the stable production domain. VERCEL_URL is
 * the per-deployment URL and changes every push, so it is only a last resort
 * (preview deployments) and never what a client should receive.
 */
export function appUrl(): string {
  const explicit = process.env.APP_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercelProd) return `https://${vercelProd.replace(/\/+$/, '')}`

  const vercelDeployment = process.env.VERCEL_URL?.trim()
  if (vercelDeployment) return `https://${vercelDeployment.replace(/\/+$/, '')}`

  return 'http://localhost:3000'
}

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string }

export type EmailAttachment = { filename: string; content: Buffer }

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
  /** The freelancer's name, shown as the sender. */
  fromName?: string
  /** The freelancer's address, so replies reach them. */
  replyTo?: string | null
  attachments?: EmailAttachment[]
}

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const resend = getClient()
  const fromAddress = process.env.EMAIL_FROM ?? 'invoices@example.com'
  const from = input.fromName
    ? `${sanitizeDisplayName(input.fromName)} <${fromAddress}>`
    : fromAddress

  // Without an API key the app stays fully usable — emails go to the server
  // console so the whole flow can be exercised before Resend is set up.
  if (!resend) {
    console.info(
      [
        '',
        '─── EMAIL (not sent — RESEND_API_KEY is unset) ───',
        `From:     ${from}`,
        `To:       ${input.to}`,
        `Reply-To: ${input.replyTo ?? '(none)'}`,
        `Subject:  ${input.subject}`,
        ...(input.attachments?.length
          ? [`Attached: ${input.attachments.map((a) => a.filename).join(', ')}`]
          : []),
        '',
        input.text,
        '─────────────────────────────────────────────────',
        '',
      ].join('\n'),
    )
    return { ok: true, id: null }
  }

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      ...(input.attachments?.length
        ? {
            attachments: input.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
            })),
          }
        : {}),
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, id: data?.id ?? null }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown email error',
    }
  }
}

/** Strips characters that could inject extra headers into the From line. */
function sanitizeDisplayName(name: string): string {
  return name.replace(/["\r\n<>]/g, '').trim().slice(0, 78)
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Plain, table-free, mostly-text HTML. Heavy marketing templates are exactly
 * what spam filters penalise, and a transactional invoice email should look
 * like a person sent it.
 */
export function renderEmailHtml(options: {
  bodyText: string
  ctaLabel?: string
  ctaUrl?: string
  footerNote?: string
  accentColor?: string
}): string {
  const accent = options.accentColor ?? '#0f172a'
  const paragraphs = options.bodyText
    .split('\n\n')
    .map(
      (block) =>
        `<p style="margin:0 0 16px;line-height:1.6;">${escapeHtml(block).replace(/\n/g, '<br />')}</p>`,
    )
    .join('')

  const cta =
    options.ctaUrl && options.ctaLabel
      ? `<p style="margin:28px 0;">
           <a href="${escapeHtml(options.ctaUrl)}"
              style="display:inline-block;background:${escapeHtml(accent)};color:#ffffff;
                     text-decoration:none;padding:12px 22px;border-radius:6px;
                     font-weight:600;">${escapeHtml(options.ctaLabel)}</a>
         </p>
         <p style="margin:0 0 16px;font-size:13px;color:#64748b;line-height:1.6;">
           Or paste this into your browser:<br />
           <a href="${escapeHtml(options.ctaUrl)}" style="color:#64748b;">${escapeHtml(options.ctaUrl)}</a>
         </p>`
      : ''

  const footer = options.footerNote
    ? `<p style="margin:28px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">${escapeHtml(options.footerNote)}</p>`
    : ''

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f8fafc;
                   font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                   color:#0f172a;font-size:15px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;
              border-radius:10px;padding:32px;">
    ${paragraphs}
    ${cta}
    ${footer}
  </div>
</body></html>`
}
