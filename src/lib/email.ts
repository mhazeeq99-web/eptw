import 'server-only'

/**
 * ePTW email service — Resend-backed, server-only.
 *
 * - Reads RESEND_API_KEY and RESEND_FROM_EMAIL from the environment only.
 *   Neither is ever exposed to the client, logged, or echoed in responses.
 * - All send helpers are best-effort: they never throw, and a failed email
 *   NEVER fails the underlying business transaction (invitation creation,
 *   permit status change, etc.). Failures are logged server-side.
 * - When RESEND_API_KEY is missing the service is a no-op (development/build
 *   friendly). When RESEND_FROM_EMAIL is missing, sends are skipped with a
 *   clear log: the sender address must be a domain verified in Resend — we
 *   never invent a sender address.
 */

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  /** Plain-text alternative; recommended for deliverability/accessibility. */
  text?: string
}

export type SendEmailResult = {
  ok: boolean
  /** Reason for skipping/failure (never contains the API key). */
  error?: string
}

const APP_NAME = 'ePTW'
const APP_TAGLINE = 'Electronic Permit to Work'

function getApiKey(): string | undefined {
  return process.env.RESEND_API_KEY?.trim() || undefined
}

function getSender(): string | undefined {
  return process.env.RESEND_FROM_EMAIL?.trim() || undefined
}

/** True when RESEND_API_KEY is present (email sending may be attempted). */
export function isEmailConfigured(): boolean {
  return Boolean(getApiKey())
}

/**
 * Sends an email through Resend. Best-effort: returns { ok:false } instead of
 * throwing when the service is not configured or the API rejects the send.
 */
export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const apiKey = getApiKey()
  const from = getSender()

  if (!apiKey) {
    console.warn(
      '[email] RESEND_API_KEY is not set — skipping email send (to=' +
        input.to +
        ').'
    )
    return {
      ok: false,
      error: 'RESEND_API_KEY is not set',
    }
  }

  if (!from) {
    console.warn(
      '[email] RESEND_FROM_EMAIL is not set — no verified Resend sender ' +
        'configured, skipping email send. Add RESEND_FROM_EMAIL using a ' +
        'domain verified in your Resend account.'
    )
    return {
      ok: false,
      error: 'RESEND_FROM_EMAIL is not set',
    }
  }

  try {
    // Dynamic import keeps Resend out of the client bundle entirely.
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)

    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    })

    if (error) {
      console.error(
        '[email] Resend rejected send to ' +
          input.to +
          ': ' +
          (error.name ?? '') +
          ' ' +
          (error.message ?? '')
      )
      return {
        ok: false,
        error: error.message || 'Resend rejected the send',
      }
    }

    return { ok: true }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error)
    console.error(
      '[email] Unexpected error sending email to ' +
        input.to +
        ': ' +
        message
    )
    return { ok: false, error: message }
  }
}

/* =========================================================
   Branded HTML email layout (inline styles, email-client safe)
   ========================================================= */

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const HEADER_BG =
  'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)'
const BRAND_BLUE = '#2563eb'

function shellHtml(opts: {
  preheader: string
  bodyHtml: string
}): string {
  const { preheader, bodyHtml } = opts
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${APP_NAME} — ${escapeHtml(preheader)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <!-- Header -->
          <tr>
            <td style="background:${HEADER_BG};padding:28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:#ffffff;">
                    <div style="font-size:22px;font-weight:700;letter-spacing:0.2px;">${APP_NAME}</div>
                    <div style="font-size:13px;opacity:0.9;margin-top:2px;">${APP_TAGLINE}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;color:#111827;font-size:15px;line-height:1.6;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #f3f4f6;background-color:#fafafa;">
              <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">
                This is an automated message from ${APP_NAME} — ${APP_TAGLINE}. If you
                did not expect this email, you can safely ignore it.
              </p>
              <p style="margin:8px 0 0;font-size:12px;color:#9ca3af;">
                &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function ctaButtonHtml(label: string, url: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td align="center">
        <a href="${escapeHtml(url)}" style="display:inline-block;background:${HEADER_BG};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:8px;">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 16px;font-size:12px;color:#6b7280;text-align:center;word-break:break-all;">
    Or copy this link into your browser:<br/>
    <a href="${escapeHtml(url)}" style="color:${BRAND_BLUE};word-break:break-all;">${escapeHtml(url)}</a>
  </p>`
}

/* =========================================================
   Templates
   ========================================================= */

const ROLE_LABELS: Record<string, string> = {
  safety_manager: 'Safety Manager',
  safety_coordinator: 'Safety Coordinator',
  internal_staff: 'Internal Staff',
  contractor_admin: 'Contractor Admin',
  platform_admin: 'Platform Admin',
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'Team Member'
  return ROLE_LABELS[role] ?? role
}

/**
 * Renders the Internal Staff / Safety Coordinator registration (invitation)
 * email content. `inviteLink` is the Supabase Auth action link generated for
 * the invited user — the SAME link the existing invitation flow relies on.
 */
export function renderInvitationEmail(opts: {
  fullName?: string | null
  role: string
  companyName?: string | null
  inviteLink: string
}): { subject: string; html: string; text: string } {
  const { fullName, role, companyName, inviteLink } = opts
  const label = roleLabel(role)
  const name = fullName?.trim() || 'there'
  const companyLine = companyName?.trim()

  const subject = `You're invited to join ${APP_NAME} as ${label}`

  const text = [
    `Hi ${name},`,
    '',
    `You have been invited to join ${APP_NAME} (${APP_TAGLINE}) as ${label}.`,
    companyLine
      ? `Company / Plant: ${companyLine}`
      : '',
    '',
    'Complete your registration and set up your password using the link below:',
    '',
    inviteLink,
    '',
    'If you did not expect this invitation, you can safely ignore this email.',
  ]
    .filter((line) => line !== '')
    .join('\n')

  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 16px;">
      You have been invited to join
      <strong style="color:${BRAND_BLUE};">${APP_NAME}</strong> —
      ${APP_TAGLINE} — as
      <strong>${escapeHtml(label)}</strong>.
    </p>
    ${
      companyLine
        ? `<p style="margin:0 0 16px;"><strong>Company / Plant:</strong> ${escapeHtml(companyLine)}</p>`
        : ''
    }
    <p style="margin:0 0 8px;">
      To activate your account, complete your registration and set up your
      password by clicking the button below.
    </p>
    ${ctaButtonHtml('Complete Registration', inviteLink)}
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
      The registration link is valid for a limited time and can only be used
      once. If it expires, ask your Safety Manager to resend the invitation.
    </p>`

  return { subject, html: shellHtml({ preheader: subject, bodyHtml }), text }
}

/**
 * Sends a branded registration (invitation) email to an invited user.
 * Best-effort: never throws; callers must not fail their transaction on the
 * result.
 */
export async function sendInvitationEmail(opts: {
  to: string
  fullName?: string | null
  role: string
  companyName?: string | null
  inviteLink: string
}): Promise<SendEmailResult> {
  const { to, fullName, role, companyName, inviteLink } = opts

  const rendered = renderInvitationEmail({
    fullName,
    role,
    companyName,
    inviteLink,
  })

  return sendEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  })
}
