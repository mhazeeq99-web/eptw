import type { SupabaseClient } from '@supabase/supabase-js'

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
  const recipients = new Map<string, Recipient>()

  if (event === 'permit_submitted') {
    // Notify company safety staff.
    const { data: safetyStaff } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('company_id', permit.company_id ?? -1)
      .eq('is_active', true)
      .in('role', [
        'safety_manager',
        'safety_coordinator',
        'admin',
      ])

    for (const staff of safetyStaff ?? []) {
      if (staff.id !== permit.requester_id) {
        recipients.set(staff.id, staff)
      }
    }
  }

  // The requester always gets notified of lifecycle events.
  if (permit.requester_id) {
    const { data: requester } = await supabase
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
  }

  const title = `${labels[event]} — ${permit.permit_no}`

  const message = `Permit ${permit.permit_no} has been ${event
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

    if (recipient.email) {
      await sendEmail(
        recipient.email,
        title,
        `${message}\n\nView permit: ${getPermitUrl(permit.id)}`
      )
    }
  }
}

export function getPermitUrl(permitId: number) {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/permits/${permitId}`
}

/**
 * Best-effort email via SMTP (nodemailer). No-op when SMTP is not
 * configured. Requires SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
 * SMTP_FROM in the environment.
 */
export async function sendEmail(
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
