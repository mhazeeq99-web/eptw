'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { notifyPermitChanged } from '@/lib/permit-changed'

export type SiteChecklistTemplateItem = {
  item_key: string
  label: string
  is_required: boolean
  sort_order: number
}

export type SiteVerificationRecord = {
  id: number
  permit_id: number
  status: 'not_verified' | 'verified' | 'failed'
  checklist: Array<{
    key: string
    status: 'ok' | 'fail' | 'na'
  }>
  verified_by: string | null
  verified_at: string | null
  remarks: string | null
}

type ChecklistDraft = {
  key: string
  status: 'ok' | 'fail' | 'na'
}

export function SiteVerificationSection({
  permitId,
  canEdit,
  template,
  initialRecord,
}: {
  permitId: number
  canEdit: boolean
  template: SiteChecklistTemplateItem[]
  initialRecord: SiteVerificationRecord | null
}) {
  const router = useRouter()

  const [status, setStatus] = useState<
    'not_verified' | 'verified' | 'failed'
  >(initialRecord?.status ?? 'not_verified')
  const [items, setItems] = useState<ChecklistDraft[]>(() => {
    const existing = new Map(
      (initialRecord?.checklist ?? []).map((item) => [
        item.key,
        item.status,
      ])
    )
    return template.map((item) => ({
      key: item.item_key,
      status: existing.get(item.item_key) ?? 'na',
    }))
  })
  const [remarks, setRemarks] = useState(
    initialRecord?.remarks ?? ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function setItemStatus(key: string, value: 'ok' | 'fail' | 'na') {
    setItems((current) =>
      current.map((item) =>
        item.key === key ? { ...item, status: value } : item
      )
    )
  }

  const requiredUnchecked = template.filter((item) => {
    if (!item.is_required) return false
    const state = items.find((i) => i.key === item.item_key)
    return state?.status !== 'ok'
  })

  async function handleSave() {
    setError('')

    const failed = items.some((item) => item.status === 'fail')
    const nextStatus = failed
      ? 'failed'
      : requiredUnchecked.length > 0
        ? 'not_verified'
        : 'verified'

    setSaving(true)

    try {
      const response = await fetch(
        `/api/permits/${permitId}/site-verification`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: nextStatus,
            checklist: items.map((item) => ({
              key: item.key,
              status: item.status,
            })),
            remarks: remarks.trim() || null,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error || 'Unable to save site verification.'
        )
        return
      }

      setStatus(nextStatus)
      notifyPermitChanged()
      router.refresh()
    } catch {
      setError('Unable to save site verification.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6 rounded-xl border bg-background">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="font-semibold">Site / Work-Area Verification</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirmation that the physical work area and required
            controls are ready before approval.
          </p>
        </div>

        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase ${
            status === 'verified'
              ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
              : status === 'failed'
                ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'
          }`}
        >
          {status.replaceAll('_', ' ')}
        </span>
      </div>

      <div className="p-6">
        <div className="space-y-2">
          {template.map((item) => {
            const state = items.find(
              (i) => i.key === item.item_key
            )
            return (
              <div
                key={item.item_key}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    {item.label}
                  </span>
                  {item.is_required && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      Required
                    </span>
                  )}
                </div>

                {canEdit && status !== 'verified' ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setItemStatus(item.item_key, 'ok')
                      }
                      className={`rounded-md border px-3 py-1 text-xs font-medium ${
                        state?.status === 'ok'
                          ? 'border-green-600 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                          : 'hover:bg-muted'
                      }`}
                    >
                      ✓ OK
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setItemStatus(item.item_key, 'fail')
                      }
                      className={`rounded-md border px-3 py-1 text-xs font-medium ${
                        state?.status === 'fail'
                          ? 'border-red-600 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                          : 'hover:bg-muted'
                      }`}
                    >
                      ✗ Fail
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setItemStatus(item.item_key, 'na')
                      }
                      className={`rounded-md border px-3 py-1 text-xs font-medium ${
                        state?.status === 'na' ||
                        state?.status === undefined
                          ? 'border-muted bg-muted/40 text-muted-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      N/A
                    </button>
                  </div>
                ) : (
                  <span
                    className={`text-xs font-medium uppercase ${
                      state?.status === 'ok'
                        ? 'text-green-600'
                        : state?.status === 'fail'
                          ? 'text-red-600'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {state?.status === 'ok'
                      ? '✓ OK'
                      : state?.status === 'fail'
                        ? '✗ Fail'
                        : 'N/A'}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-4 space-y-2">
          <label className="text-sm font-medium">Remarks</label>
          <textarea
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            disabled={!canEdit || status === 'verified'}
            rows={2}
            placeholder="Any notes about the work-area inspection..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </div>

        {initialRecord?.verified_by && (
          <p className="mt-3 text-xs font-medium text-green-600">
            ✓ Verified{initialRecord.verified_at
              ? ` at ${new Intl.DateTimeFormat('en-MY', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(initialRecord.verified_at))}`
              : ''}
          </p>
        )}

        {canEdit && status !== 'verified' && (
          <>
            {requiredUnchecked.length > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                {requiredUnchecked.length} required item(s) are
                not marked OK — verification will remain NOT VERIFIED.
              </p>
            )}

            {error && (
              <p className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Verification'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
