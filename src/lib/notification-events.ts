export const EVENT_TYPES = [
  'permit_submitted',
  'permit_approved',
  'permit_rejected',
  'permit_issued',
  'permit_suspended',
  'permit_resumed',
  'permit_completed',
  'permit_closed',
  'permit_cancelled',
  'permit_started',
  'permit_expiring_soon',
]

export const EVENT_LABELS: Record<string, string> = {
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
}
