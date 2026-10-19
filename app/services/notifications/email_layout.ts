import { fileURLToPath } from 'node:url'

/**
 * The one e-mail document every message is wrapped in, and the blocks message bodies are built
 * from. Colours and typeface are the Reemite app's own (src/constants/theme.ts in the mobile
 * app), so a mail reads as coming from the same product as the screen it talks about.
 *
 * Inline styles only, tables for layout: most clients strip <style> and ignore flexbox/grid.
 */

const INK = '#0F1222'
const INK_2 = '#4A5065'
const MUTED = '#7A8094'
const LINE = '#E7E9EF'
const TINT = '#F2F5FE'
const NAVY = '#1E1872'

const SYSTEM_FALLBACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
const FONT = `'Plus Jakarta Sans', ${SYSTEM_FALLBACK}`
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"
/** Figures compared digit by digit keep the same width. */
const TABULAR = "font-variant-numeric:tabular-nums;font-feature-settings:'tnum';"

/**
 * Content-ID of the app icon embedded in every message. Inline (cid:) rather than a remote URL:
 * it shows even where remote images are blocked by default, and does not depend on APP_URL
 * being reachable from the recipient's inbox. NotificationService attaches the file whenever
 * a rendered message references this id.
 */
export const BRAND_ICON_CID = 'reemite-icon'
export const BRAND_ICON_PATH = fileURLToPath(
  new URL('../../../resources/brand/reemite-icon.png', import.meta.url)
)

/**
 * Values interpolated into a message come from user-controlled fields — a full name, a
 * description. They are escaped so a name containing `<` cannot break, or inject into, the body.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ------------------------------------------------------------------------------------------ */
/* Text                                                                                        */
/* ------------------------------------------------------------------------------------------ */

/** A body paragraph. `muted` for secondary lines, `last` to drop the bottom margin. */
export function text(html: string, options: { muted?: boolean; last?: boolean } = {}): string {
  const color = options.muted ? MUTED : INK_2
  const size = options.muted ? 13 : 15
  return `<p style="margin:0 0 ${options.last ? 0 : 20}px;font-family:${FONT};font-size:${size}px;line-height:1.6;color:${color};">${html}</p>`
}

/* ------------------------------------------------------------------------------------------ */
/* Codes                                                                                       */
/* ------------------------------------------------------------------------------------------ */

/**
 * A one-time code — the only thing in the message the reader has to act on. Left-aligned with
 * the text above it, on a faint tint of the brand blue so it reads as the one element to copy.
 *
 * `token` is for long secrets that are pasted rather than typed (the 43-character PIN reset
 * token): monospace so l/I/0/O stay distinct, wrapped anywhere, and selected in one tap where
 * the client honours user-select — its `-` and `_` would otherwise stop a word selection.
 */
export function otpCode(code: unknown, options: { token?: boolean } = {}): string {
  const style = options.token
    ? `font-family:${MONO};font-size:16px;line-height:1.55;font-weight:600;word-break:break-all;-webkit-user-select:all;user-select:all;`
    : `font-family:${FONT};font-size:32px;line-height:1.2;font-weight:700;letter-spacing:10px;${TABULAR}`
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 12px;">
  <tr>
    <td style="background-color:${TINT};border-radius:12px;padding:18px 22px;">
      <div style="${style}color:${INK};">${escapeHtml(code)}</div>
    </td>
  </tr>
</table>`
}

/* ------------------------------------------------------------------------------------------ */
/* Notices                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export type Tone = 'success' | 'warning' | 'danger' | 'info'

const TONES: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: '#E8F5EE', fg: '#1F7D47' },
  warning: { bg: '#FDF3E1', fg: '#8A5A00' },
  danger: { bg: '#FDECEE', fg: '#C7182B' },
  info: { bg: TINT, fg: '#1E46D1' },
}

/** A short status line — a refusal reason, a reassurance that nothing was debited. */
export function notice(tone: Tone, html: string): string {
  const { bg, fg } = TONES[tone]
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
  <tr>
    <td style="background-color:${bg};border-radius:12px;padding:13px 16px;font-family:${FONT};font-size:14px;line-height:1.5;font-weight:500;color:${fg};">${html}</td>
  </tr>
</table>`
}

/* ------------------------------------------------------------------------------------------ */
/* Receipt                                                                                     */
/* ------------------------------------------------------------------------------------------ */

export type ReceiptStatus = 'completed' | 'pending' | 'failed'

const STATUS_LABEL: Record<ReceiptStatus, { label: string; tone: Tone }> = {
  completed: { label: 'Effectué', tone: 'success' },
  pending: { label: 'En attente', tone: 'warning' },
  failed: { label: 'Échoué', tone: 'danger' },
}

export type ReceiptRow = [label: string, value: string | null | undefined]

/**
 * The record of a movement, laid out like the app's receipt screen: what it was and how much at
 * the top, with its status, then every detail support would ask for, in a fixed order. Rows
 * whose value is missing are dropped rather than shown empty — an operation that had no fee says
 * nothing about fees, instead of "Frais : ".
 */
export function receipt(options: {
  caption: string
  amount: string
  /** `in` adds a +, `out` a − : the direction is read before the sentence. */
  direction?: 'in' | 'out'
  status: ReceiptStatus
  rows: ReceiptRow[]
}): string {
  const { label, tone } = STATUS_LABEL[options.status]
  const pill = TONES[tone]
  const sign = options.direction === 'in' ? '+ ' : options.direction === 'out' ? '− ' : ''

  const rows = options.rows
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(
      ([rowLabel, value], index) => `      <tr>
        <td style="padding:11px 0;${index ? `border-top:1px solid ${LINE};` : ''}font-family:${FONT};font-size:13px;color:${MUTED};white-space:nowrap;vertical-align:top;">${escapeHtml(rowLabel)}</td>
        <td align="right" style="padding:11px 0 11px 16px;${index ? `border-top:1px solid ${LINE};` : ''}font-family:${FONT};font-size:14px;font-weight:600;${TABULAR}color:${INK};word-break:break-word;">${escapeHtml(value)}</td>
      </tr>`
    )
    .join('\n')

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;border:1px solid ${LINE};border-radius:14px;border-collapse:separate;">
  <tr>
    <td style="padding:20px 20px 18px;border-bottom:1px solid ${LINE};">
      <div style="font-family:${FONT};font-size:13px;font-weight:500;color:${MUTED};margin:0 0 4px;">${escapeHtml(options.caption)}</div>
      <div style="font-family:${FONT};font-size:28px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;${TABULAR}color:${INK};">${escapeHtml(sign + options.amount)}</div>
      <div style="margin-top:10px;"><span style="display:inline-block;background-color:${pill.bg};color:${pill.fg};border-radius:999px;padding:3px 10px;font-family:${FONT};font-size:12px;font-weight:600;">${label}</span></div>
    </td>
  </tr>
  <tr>
    <td style="padding:4px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
${rows}
      </table>
    </td>
  </tr>
</table>`
}

/* ------------------------------------------------------------------------------------------ */
/* Document                                                                                    */
/* ------------------------------------------------------------------------------------------ */

export interface EmailDocumentOptions {
  brand: string
  /** The heading: says what happened or what to do, not what the product is called. */
  title: string
  /**
   * The grey line an inbox shows next to the subject. Left out, clients fall back to the first
   * words of the body, which on most of these messages is a greeting.
   */
  preheader: string
  /** Pre-rendered blocks, built from the helpers above. */
  body: string
  /** Name to greet, when the message is about someone's own account. */
  greeting?: string
  /** Replaces the default footer line. */
  footerNote?: string
}

/**
 * A white page and a single column: the app icon and name, the heading, the body, and one line
 * of footer. No banner, no card, no canvas colour — nothing around the content competes with it.
 */
export function emailDocument(options: EmailDocumentOptions): string {
  const { brand, title, preheader, body, greeting, footerNote } = options
  const year = new Date().getFullYear()

  return `<!DOCTYPE html>
<html lang="fr" style="margin:0;padding:0;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
<style>
  @media (max-width: 520px) {
    .sm-pad { padding: 32px 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#ffffff;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
<!-- Second hidden run stops the client from pulling the body's first words in after the
     preheader and gluing them together in the inbox preview. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="width:520px;max-width:100%;">
        <tr>
          <td class="sm-pad" style="padding:48px 24px 40px;">

            <!-- The name stays in type beside the icon: if a client hides the image, the
                 sender is still named. -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 36px;">
              <tr>
                <td width="40" valign="middle" style="width:40px;">
                  <img src="cid:${BRAND_ICON_CID}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border:0;border-radius:10px;background-color:${NAVY};">
                </td>
                <td valign="middle" style="padding-left:12px;font-family:${FONT};font-size:17px;font-weight:700;letter-spacing:-0.01em;color:${INK};">${escapeHtml(brand)}</td>
              </tr>
            </table>

            <h1 style="margin:0 0 ${greeting ? 16 : 12}px;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-0.02em;color:${INK};">${escapeHtml(title)}</h1>
            ${greeting ? text(`Bonjour ${escapeHtml(greeting)},`) : ''}
            ${body}

            <div style="height:1px;line-height:1px;font-size:0;background-color:${LINE};margin:32px 0 20px;">&nbsp;</div>
            <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">${
              footerNote
                ? escapeHtml(footerNote)
                : `Message automatique de ${escapeHtml(brand)}, merci de ne pas y répondre.`
            }</p>
            <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">&copy; ${year} ${escapeHtml(brand)}</p>

          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

/**
 * Plain-text alternative. Worth sending alongside the HTML: some clients and most filters read
 * it, and a message with no text part scores as spam more often.
 */
export function plainText(lines: Array<string | null | undefined | false>): string {
  return lines.filter((line): line is string => typeof line === 'string').join('\n')
}

/** Receipt rows as plain-text lines: "Référence : TXN-…". */
export function plainRows(rows: ReceiptRow[]): string[] {
  return rows
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => `${label} : ${value}`)
}
