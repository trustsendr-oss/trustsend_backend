/**
 * Shared HTML layout for every transactional e-mail, carrying the same visual world as the
 * institution dashboard: navy header, light blue-grey backdrop, a white card, one blue for the
 * single action.
 *
 * Written against mail clients, not browsers, so the rules differ from the app's own CSS:
 *
 * - Tables for structure. Outlook renders through Word, which ignores flex, grid and float.
 * - Styles inline on each element. Gmail strips most of what a <style> block declares, so the
 *   block below only carries the dark-mode and small-screen rules that cannot be inlined, and
 *   nothing depends on them surviving.
 * - No images. Most clients block remote images by default, and a logo that fails leaves a
 *   broken frame where the brand should be — the wordmark is text, so it always arrives.
 * - Same two faces as the app (tumaplus_imf/src/index.css): Inter Tight for what is read as a
 *   figure or a heading — title, amount, code, wordmark — and Inter for running text. Gmail
 *   drops @font-face entirely, so both are requested for the clients that honour it (Apple
 *   Mail, iOS) and every other reader falls back to their system sans, spelled out below.
 */

/* Tokens copied from the app's @theme — change them there first, then here. */
const NAV = '#101b3a'
const NAV_TEXT = '#93a2c4'
const CANVAS = '#edf1f7'
const SURFACE = '#ffffff'
const SURFACE_2 = '#f5f7fb'
const LINE = '#e6eaf2'
const INK = '#0f172a'
const INK_2 = '#334155'
const MUTED = '#64748b'
const MUTED_2 = '#94a3b8'
const ACCENT = '#2563eb'

const SYSTEM_FALLBACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
/** --font-display: headings, amounts, codes, the wordmark. */
const DISPLAY = `'Inter Tight', Inter, ${SYSTEM_FALLBACK}`
/** --font-sans: everything else. */
const SANS = `Inter, ${SYSTEM_FALLBACK}`
/** The app's `.tabular` class: figures compared digit by digit keep the same width. */
const TABULAR = 'font-variant-numeric:tabular-nums;font-feature-settings:\'tnum\';'

/** --shadow-card: the panel sits on the canvas and casts downward, as in the app. */
const SHADOW_CARD = '0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.04)'

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
/* Building blocks                                                                             */
/* ------------------------------------------------------------------------------------------ */

/** A paragraph of body copy. */
export function p(html: string): string {
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${INK_2};">${html}</p>`
}

/** The one line that states what happened, above the detail. */
export function lead(html: string): string {
  return `<p style="margin:0 0 20px;font-family:${DISPLAY};font-size:17px;line-height:1.45;font-weight:600;letter-spacing:-0.01em;color:${INK};">${html}</p>`
}

/**
 * A one-time code. Letter-spaced and oversized because it is read off the screen and typed by
 * hand, often on a second device — the spacing is what stops a 6 from being read into a group
 * of 8 digits.
 */
export function codeBox(code: unknown, note?: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
  <tr>
    <td align="center" style="background-color:${SURFACE_2};border:1px solid ${LINE};border-radius:14px;padding:22px 16px;">
      <div style="font-family:${DISPLAY};font-size:30px;font-weight:700;letter-spacing:8px;${TABULAR}color:${INK};">${escapeHtml(code)}</div>
      ${note ? `<div style="margin-top:8px;font-family:${SANS};font-size:13px;color:${MUTED};">${escapeHtml(note)}</div>` : ''}
    </td>
  </tr>
</table>`
}

/**
 * Key/value detail block — reference, date, amount. A table rather than lines of text so the
 * labels stay in one column when a long reference wraps.
 */
export function detailList(rows: Array<[string, string]>): string {
  const body = rows
    .filter(([, value]) => value !== '' && value !== undefined && value !== null)
    .map(
      ([label, value]) => `  <tr>
    <td style="padding:10px 0;font-family:${SANS};font-size:13px;color:${MUTED};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
    <td align="right" style="padding:10px 0 10px 16px;font-family:${SANS};font-size:14px;font-weight:500;${TABULAR}color:${INK};word-break:break-word;">${escapeHtml(value)}</td>
  </tr>`
    )
    .join('\n')

  if (!body) return ''

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};">
${body}
</table>`
}

/** The amount an e-mail is actually about, set large enough to be read before the sentence. */
export function amountBlock(amount: string, caption?: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
  <tr>
    <td style="padding:0;">
      ${caption ? `<div style="font-family:${SANS};font-size:13px;font-weight:500;color:${MUTED};margin-bottom:4px;">${escapeHtml(caption)}</div>` : ''}
      <div style="font-family:${DISPLAY};font-size:28px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;${TABULAR}color:${INK};">${escapeHtml(amount)}</div>
    </td>
  </tr>
</table>`
}

type NoticeTone = 'success' | 'warning' | 'danger' | 'info'

const NOTICE_COLORS: Record<NoticeTone, { bg: string; fg: string }> = {
  success: { bg: '#dcfce7', fg: '#15803d' },
  warning: { bg: '#fef3c7', fg: '#b45309' },
  danger: { bg: '#fee2e2', fg: '#b91c1c' },
  info: { bg: '#dbeafe', fg: '#1d4ed8' },
}

/** A short status line — a refusal reason, a reassurance that nothing was debited. */
export function notice(tone: NoticeTone, html: string): string {
  const { bg, fg } = NOTICE_COLORS[tone]
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
  <tr>
    <td style="background-color:${bg};border-radius:12px;padding:14px 16px;font-family:${SANS};font-size:14px;line-height:1.5;color:${fg};">${html}</td>
  </tr>
</table>`
}

/**
 * Primary action. A padded table cell rather than an <a> with padding: Outlook ignores padding
 * on inline elements, which would collapse the button to bare underlined text.
 */
export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
  <tr>
    <td align="center" style="background-color:${ACCENT};border-radius:12px;">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 20px;font-family:${SANS};font-size:14px;line-height:18px;font-weight:500;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`
}

/** Fine print inside the card — the "ignore this message" line. */
export function fineprint(html: string): string {
  return `<p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">${html}</p>`
}

/** Horizontal rule matching the card's own hairline. */
export function divider(): string {
  return `<div style="height:1px;line-height:1px;font-size:0;background-color:${LINE};margin:0 0 20px;">&nbsp;</div>`
}

/* ------------------------------------------------------------------------------------------ */
/* Document                                                                                    */
/* ------------------------------------------------------------------------------------------ */

export interface EmailDocumentOptions {
  brand: string
  /** Small line under the wordmark, as under the institution name in the app's sidebar. */
  tagline?: string
  /** Shown as the heading inside the card, and as the document title. */
  title: string
  /**
   * The grey line an inbox shows next to the subject. Left out, clients fall back to the first
   * words of the body, which on these messages is a greeting — the same for every e-mail and
   * worth nothing at a glance.
   */
  preheader: string
  /** Pre-rendered blocks, built from the helpers above. */
  body: string
  /** Optional greeting line: "Bonjour Marie," */
  greeting?: string
  /** Replaces the default legal footer when a message needs its own. */
  footerNote?: string
}

export function emailDocument(options: EmailDocumentOptions): string {
  const { brand, tagline = 'Ensemble pour votre avenir', title, preheader, body, greeting, footerNote } =
    options
  const monogram = escapeHtml(brand.trim().charAt(0).toUpperCase() || 'T')
  const year = new Date().getFullYear()

  return `<!DOCTYPE html>
<html lang="fr" style="margin:0;padding:0;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<!-- Light only, like the app, which has no dark theme. Declaring "dark" would let Apple Mail
     darken the card while every text colour stays inlined for a white background. -->
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&amp;family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
<style>
  /* Only what cannot be inlined lives here; nothing below is required for the mail to read
     correctly in a client that discards it. */
  @media (max-width: 620px) {
    .sm-px { padding-left: 20px !important; padding-right: 20px !important; }
    .sm-py { padding-top: 24px !important; padding-bottom: 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${CANVAS};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
<!-- Second hidden run stops the client from pulling the body's first words in after the
     preheader and gluing them together in the inbox preview. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${CANVAS};">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;">

        <!-- Brand bar, drawn like the top of the app's sidebar: navy, a blue tile, the name in
             white and a muted line under it. Text, never an image: blocked remote images are
             the default in most clients, and a brand that fails to load is worse than one set
             in type. -->
        <tr>
          <td style="background-color:${NAV};border-radius:18px 18px 0 0;padding:22px 32px;" class="sm-px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="40" height="40" align="center" valign="middle" style="width:40px;height:40px;background-color:${ACCENT};border-radius:12px;font-family:${DISPLAY};font-size:18px;font-weight:700;line-height:40px;color:#ffffff;">${monogram}</td>
                <td style="padding-left:12px;">
                  <div style="font-family:${DISPLAY};font-size:15px;line-height:1.25;font-weight:600;color:#ffffff;">${escapeHtml(brand)}</div>
                  ${tagline ? `<div style="font-family:${SANS};font-size:11px;line-height:1.35;color:${NAV_TEXT};">${escapeHtml(tagline)}</div>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="sm-px sm-py" style="background-color:${SURFACE};border-radius:0 0 18px 18px;padding:32px;box-shadow:${SHADOW_CARD};">
            <h1 style="margin:0 0 ${greeting ? '16px' : '20px'};font-family:${DISPLAY};font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.02em;color:${INK};">${escapeHtml(title)}</h1>
            ${greeting ? p(`Bonjour ${escapeHtml(greeting)},`) : ''}
            ${body}
          </td>
        </tr>

        <tr>
          <td style="padding:24px 32px 0;" class="sm-px">
            <p style="margin:0 0 6px;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};">
              ${footerNote ? escapeHtml(footerNote) : `Ce message vous est adressé automatiquement par ${escapeHtml(brand)}. Merci de ne pas y répondre.`}
            </p>
            <p style="margin:0;font-family:${SANS};font-size:12px;color:${MUTED_2};">&copy; ${year} ${escapeHtml(brand)}</p>
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
export function plainText(lines: Array<string | null | undefined>): string {
  return lines.filter((line): line is string => typeof line === 'string').join('\n')
}
