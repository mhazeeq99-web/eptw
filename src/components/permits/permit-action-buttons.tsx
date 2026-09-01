'use client'

import Link from 'next/link'
import {
  Printer,
  FileText,
  XCircle,
  PauseCircle,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SubmitPermitButton } from './submit-permit-button'
import { ResubmitPermitButton } from './resubmit-permit-button'

type ActionButtonsProps = {
  id: number
  permitNo: string
  status: string
  initiationMode: string | null
  workflowStage: string | null
  requesterId: string | null
  currentUserRole: string | null
  currentUserId: string | null
}

type Action = {
  label: string
  icon: typeof FileText
  onClick?: () => void
}

/**
 * Client-side permit action bar (Print / PDF + primary + secondary dropdown).
 *
 * Lives in a client component so event handlers (e.g. "Edit Permit" navigation)
 * are created in the browser, not passed across the server→client boundary —
 * Next.js 16 forbids passing functions as props from a Server Component to a
 * Client Component.
 */
export function PermitActionButtons({
  id,
  permitNo,
  status,
  initiationMode,
  workflowStage,
  requesterId,
  currentUserRole,
  currentUserId,
}: ActionButtonsProps) {
  const isDraftInternal =
    status === 'draft' &&
    (initiationMode === 'internal' || initiationMode === 'contractor_direct')

  const primaryAction = (() => {
    if (isDraftInternal) {
      return (
        <SubmitPermitButton
          key="submit"
          permitId={id}
          permitNo={permitNo}
        />
      )
    }
    if (
      status === 'rejected' &&
      currentUserId &&
      requesterId &&
      currentUserId === requesterId
    ) {
      return (
        <ResubmitPermitButton
          key="resubmit"
          permitId={id}
          permitNo={permitNo}
        />
      )
    }
    return null
  })()

  const isRequester =
    currentUserId !== null && requesterId !== null && currentUserId === requesterId
  const isSafety =
    currentUserRole === 'safety_manager' ||
    currentUserRole === 'safety_coordinator'

  const actions: Action[] = []

  if (status === 'draft' && isRequester) {
    actions.push({
      label: 'Edit Permit',
      icon: FileText,
      onClick: () => {
        window.location.href = `/permits/new?edit=${id}`
      },
    })
  }

  if (status === 'rejected' && isRequester) {
    actions.push({
      label: 'Revise Permit',
      icon: FileText,
      onClick: () => {
        window.location.href = `/permits/new?edit=${id}`
      },
    })
  }

  if (
    status === 'pending_approval' &&
    workflowStage === 'safety_approval' &&
    isSafety
  ) {
    actions.push({
      label: 'Reject Permit',
      icon: XCircle,
    })
  }

  if (status === 'active' && isSafety) {
    actions.push({
      label: 'Suspend Permit',
      icon: PauseCircle,
    })
  }

  if (
    ['draft', 'pending_approval', 'rejected', 'approved', 'issued', 'suspended'].includes(
      status
    ) &&
    (isRequester || isSafety)
  ) {
    actions.push({
      label: 'Cancel Permit',
      icon: XCircle,
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Print button always available */}
      <Link
        href={`/permits/${id}/print`}
        target="_blank"
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <Printer className="h-4 w-4" />
        Print / PDF
      </Link>

      {primaryAction}

      {actions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              More
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map((action, index) => (
              <DropdownMenuItem key={index} onClick={action.onClick}>
                {action.icon && <action.icon className="mr-2 h-4 w-4" />}
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
