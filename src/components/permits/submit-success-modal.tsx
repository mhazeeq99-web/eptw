'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'

export function SubmitSuccessModal({
  permitId,
  permitNo,
  status,
  submittedByName,
}: {
  permitId: number
  permitNo: string
  status: string
  submittedByName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  function close() {
    // Dismiss the modal immediately from client state (the server page may
    // not re-render when navigating to the same path with a cleared query).
    setOpen(false)
    // Navigate to the clean permit URL (clears the ?submitted=1 flag).
    router.replace(`/permits/${permitId}`)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl dark:bg-gray-900">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>

        <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
          Permit Submitted Successfully
        </h2>

        <p className="mt-2 text-lg font-semibold text-blue-600 dark:text-blue-400">
          {permitNo}
        </p>

        <div className="mt-4 flex items-center justify-center gap-2">
          <span className="inline-flex rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium uppercase text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
            {status.replaceAll('_', ' ')}
          </span>
        </div>

        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Submitted by: {submittedByName}
        </p>

        <button
          type="button"
          onClick={close}
          className="mt-6 w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
        >
          View Permit
        </button>
      </div>
    </div>
  )
}
