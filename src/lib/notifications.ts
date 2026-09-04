import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPermitEventEmail } from '@/lib/email'

export type PermitEventType =
  | 'permit_submitted'
  | 'permit_approved'
  | 'permit_rejected'
  | 'permit_issued'
  | 'permit_suspended'
  | 'permit_resumed'
  | 'permit_completed'
  | 'permit_closed'
  | 'permit_cancelled'
  | 'permit_started'
  | 'permit_expiring_soon'
  | 'permit_expired'

type Recipient = {
  id: string
  email: string | null
  full_name: string | null
}

/**
 * Resolves notification recipients for a permit event:
 * - The permit requester always receives an update.
 * - For submissions, the company's safety staff receive the notification.
 */
export async function resolvePermitRecipients(
  supabase: SupabaseClient,
  permit: {
    id: number
    company_id: number | null
    requester_id: string
  },
  event: PermitEventType
): Promise<Recipient[]> {
  // Resolve recipients with the service-role (admin) client. This is needed
  // so that a contractor-originated event still resolves the CUSTOMER's
  // safety team even though the acting contractor's RLS scope (company_id
  // NULL) would otherwise hide those profiles. Tenant isolation is preserved:
  // we only ever resolve the permit's OWN company and requester.
  const admin = createAdminClient()
  const recipients = new Map<string, Recipient>()

  if (
    event === 'permit_submitted' ||
    event === 'permit_expiring_soon' ||
    event === 'permit_expired'
  ) {
    // Notify company safety staff (SM/SC) of the permit's company.
    const { data: safetyStaff } = await admin
      .from('profiles')
      .select('id, email, full_name')
      .eq('company_id', permit.company_id ?? -1)
      .eq('is_active', true)
      .in('role', [
        'safety_manager',
        'safety_coordinator',
      ])

    for (const staff of safetyStaff ?? []) {
      if (staff.id !== permit.requester_id) {
        recipients.set(staff.id, staff)
      }
    }
  }

  // The requester always gets notified of lifecycle events.
  if (permit.requester_id) {
    const { data: requester } = await admin
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', permit.requester_id)
      .single()

    if (requester) {
      recipients.set(requester.id, requester)
    }
  }

  return Array.from(recipients.values())
}

/**
 * Creates in-app notifications (and best-effort emails) for a permit event.
 * Runs as the acting user; the notify_user RPC is SECURITY DEFINER.
 */
export async function notifyPermitEvent(
  supabase: SupabaseClient,
  options: {
    permit: {
      id: number
      permit_no: string
      company_id: number | null
      requester_id: string
    }
    event: PermitEventType
    actorId: string
  }
): Promise<void> {
  const { permit, event, actorId } = options

  const labels: Record<PermitEventType, string> = {
    permit_submitted: 'Permit submitted',
    permit_approved: 'Permit approved',
    permit_rejected: 'Permit rejected',
    permit_issued: 'Permit issued',
    permit_suspended: 'Permit suspended',
    permit_resumed: 'Permit resumed',
    permit_completed: 'Permit completed',
    permit_closed: 'Permit closed',
    permit_cancelled: 'Permit cancelled',
    permit_started: 'Permit started',
    permit_expiring_soon: 'Permit expiring soon',
    permit_expired: 'Permit expired',
  }

  const title = `${labels[event]} — ${permit.permit_no}`

  const message =
    event === 'permit_expiring_soon'
      ? `Permit ${permit.permit_no} is nearing its planned end time.`
      : event === 'permit_expired'
        ? `Permit ${permit.permit_no} has expired.`
        : `Permit ${permit.permit_no} has been ${event
            .replace('permit_', '')
            .replaceAll('_', ' ')}.`

  let recipients: Recipient[]

  try {
    recipients = await resolvePermitRecipients(supabase, permit, event)
  } catch (error) {
    console.error('Failed to resolve notification recipients:', error)
    return
  }

  for (const recipient of recipients) {
    if (recipient.id === actorId) continue

    const { error } = await supabase.rpc('notify_user', {
      p_user_id: recipient.id,
      p_permit_id: permit.id,
      p_type: event,
      p_title: title,
      p_message: message,
    })

    if (error) {
      console.error(
        `Failed to create notification for ${recipient.id}:`,
        error
      )
    }

    if (
      recipient.email &&
      (await isEmailEnabled(
        supabase,
        recipient.id,
        event
      ))
    ) {
      // Branded Resend email first; falls back to the legacy SMTP path when
      // Resend is not configured. Never throws — a failed email must not fail
      // the permit transaction.
      const sent = await sendPermitEventEmail({
        to: recipient.email,
        recipientName: recipient.full_name,
        eventLabel: labels[event],
        permitNo: permit.permit_no,
        message,
        permitUrl: getPermitUrl(permit.id),
      })

      if (!sent.ok && process.env.SMTP_HOST) {
        await sendEmail(
          recipient.email,
          title,
          `${message}\n\nView permit: ${getPermitUrl(permit.id)}`
        )
      }
    }
  }
}

/**
 * Checks a user's email preference for an event type. Absence of a
 * preference row means email is enabled (default).
 */
export async function isEmailEnabled(
  supabase: SupabaseClient,
  userId: string,
  eventType: string
): Promise<boolean> {
  const { data } = await supabase
    .from('notification_preferences')
    .select('email_enabled')
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .maybeSingle()

  return data?.email_enabled ?? true
}

export function getPermitUrl(permitId: number) {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/permits/${permitId}`
}

/**
 * Best-effort email via SMTP (nodemailer). No-op when SMTP is not
 * configured. Requires SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
 * SMTP_FROM in the environment.
 */export async function sendEmail(
  to: string,
  subject: string,
  text: string
): Promise<void> {
  const host = process.env.SMTP_HOST
  const from = process.env.SMTP_FROM

  if (!host || !from) {
    // Email is optional for the MVP; notifications are in-app.
    return
  }

  try {
    const nodemailer = (await import('nodemailer')).default

    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
    })

    await transporter.sendMail({
      from,
      to,
      subject,
      text,
    })
  } catch (error) {
    console.error('Failed to send notification email:', error)
  }
}

/**
 * Finds active permits in a company that are expiring within the next
 * 24 hours and creates a "permit_expiring_soon" notification for their
 * requesters and the company's safety staff — once per permit (guarded by
 * an existing notification of the same type). Call this on page loads
 * (e.g. dashboard); it is best-effort and idempotent per permit.
 */
export async function notifyExpiringPermits(
  supabase: SupabaseClient,
  companyId: number | null
): Promise<void> {
  if (!companyId) return

  const now = Date.now()
  const soon = new Date(now + 24 * 60 * 60 * 1000).toISOString()

  const { data: permits, error } = await supabase
    .from('permits')
    .select(`
      id,
      permit_no,
      company_id,
      requester_id,
      planned_end
    `)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .not('planned_end', 'is', null)
    .lte('planned_end', soon)

  if (error) {
    console.error('Failed to load expiring permits:', error)
    return
  }

  for (const permit of permits ?? []) {
    const end = new Date(permit.planned_end).getTime()

    // Only permits still in the future (already-late ones are "expired").
    if (end < now) continue

    // Guard against duplicate notifications per permit.
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('permit_id', permit.id)
      .eq('type', 'permit_expiring_soon')
      .limit(1)

    if (existing && existing.length > 0) continue

    await notifyPermitEvent(supabase, {
      permit: {
        id: permit.id,
        permit_no: permit.permit_no,
        company_id: permit.company_id,
        requester_id: permit.requester_id,
      },
      event: 'permit_expiring_soon',
      actorId: '',
    })
  }
}

/**
 * Finds ACTIVE permits in a company whose validity window has ended and
 * creates a single "permit_expired" notification for their requesters and
 * the company's safety staff — once per permit (guarded by an existing
 * notification of the same type). Best-effort and idempotent; call on page
 * loads (e.g. dashboard). Expired permits are never deleted or auto-closed.
 */
export async function notifyExpiredPermits(
  supabase: SupabaseClient,
  companyId: number | null
): Promise<void> {
  if (!companyId) return

  const now = new Date().toISOString()

  const { data: permits, error } = await supabase
    .from('permits')
    .select(`
      id,
      permit_no,
      company_id,
      requester_id,
      valid_until,
      planned_end
    `)
    .eq('company_id', companyId)
    .eq('status', 'active')
    .or(`valid_until.lte.${now},planned_end.lte.${now}`)
    .not('planned_end', 'is', null)

  if (error) {
    console.error('Failed to load expired permits:', error)
    return
  }

  for (const permit of permits ?? []) {
    const until =
      permit.valid_until ?? permit.planned_end
    if (!until || new Date(until).getTime() > Date.now()) continue

    // Guard against duplicate notifications per permit.
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('permit_id', permit.id)
      .eq('type', 'permit_expired')
      .limit(1)

    if (existing && existing.length > 0) continue

    await notifyPermitEvent(supabase, {
      permit: {
        id: permit.id,
        permit_no: permit.permit_no,
        company_id: permit.company_id,
        requester_id: permit.requester_id,
      },
      event: 'permit_expired',
      actorId: '',
    })
  }
}
