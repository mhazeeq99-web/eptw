'use client'

import { ShieldCheck, AlertTriangle, XCircle, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Unified safety status pill used for verification states across the permit
 * detail page (JHA, safety controls, LOTO, gas testing, site verification,
 * PPE). One consistent visual format: a small rounded pill with an icon and
 * a capitalized label.
 *
 *   verified    -> green  "Verified"
 *   pending     -> yellow "Pending"
 *   completed   -> blue   "Completed"
 *   not_verified-> yellow "Pending verification"
 *   failed      -> red    "Failed"
 *   rejected    -> red    "Rejected"
 *   confirmed   -> green  "Confirmed"
 *   not_required-> gray   "Not required"
 *   optional    -> gray   "Optional"
 */
export function SafetyStatusPill({ status }: { status: string }) {
  const key = (status ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '_')

  const configs: Record<
    string,
    { label: string; className: string; icon: typeof Circle }
  > = {
    verified: {
      label: 'Verified',
      className:
        'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
      icon: ShieldCheck,
    },
    confirmed: {
      label: 'Confirmed',
      className:
        'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
      icon: ShieldCheck,
    },
    completed: {
      label: 'Completed',
      className:
        'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      icon: Circle,
    },
    pending: {
      label: 'Pending',
      className:
        'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
      icon: AlertTriangle,
    },
    not_verified: {
      label: 'Pending verification',
      className:
        'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
      icon: AlertTriangle,
    },
    pending_verification: {
      label: 'Pending verification',
      className:
        'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
      icon: AlertTriangle,
    },
    rejected: {
      label: 'Rejected',
      className:
        'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
      icon: XCircle,
    },
    failed: {
      label: 'Failed',
      className:
        'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
      icon: XCircle,
    },
    not_required: {
      label: 'Not required',
      className:
        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      icon: Circle,
    },
    optional: {
      label: 'Optional',
      className:
        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      icon: Circle,
    },
  }

  const config = configs[key] ?? {
    label: key.replace(/_/g, ' ') || 'Unknown',
    className:
      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    icon: Circle,
  }
  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        config.className
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
}
