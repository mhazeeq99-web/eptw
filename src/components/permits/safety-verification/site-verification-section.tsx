'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SafetyStatusPill } from '../safety-status-pill'
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Shield,
  ClipboardCheck,
  Lock,
  Eye
} from 'lucide-react'
import { notifyPermitChanged } from '@/lib/permit-changed'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export type SiteChecklistTemplateItem = {
  item_key: string
  label: string
  is_required: boolean
  sort_order: number
  category?: string
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
  verifier?: {
    full_name: string
  } | null
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
  const [savedFlash, setSavedFlash] = useState(false)
  const [showSummary, setShowSummary] = useState(true)

  function setItemStatus(key: string, value: 'ok' | 'fail' | 'na') {
    setItems((current) =>
      current.map((item) =>
        item.key === key ? { ...item, status: value } : item
      )
    )
  }

  const requiredItems = template.filter((item) => item.is_required)
  const optionalItems = template.filter((item) => !item.is_required)
  
  const requiredOkCount = requiredItems.filter((item) => {
    const state = items.find((i) => i.key === item.item_key)
    return state?.status === 'ok'
  }).length
  
  const totalRequiredCount = requiredItems.length
  const failedItems = items.filter((item) => item.status === 'fail')
  const failedRequiredItems = requiredItems.filter((item) => {
    const state = items.find((i) => i.key === item.item_key)
    return state?.status === 'fail'
  })

  const requiredUnchecked = requiredItems.filter((item) => {
    const state = items.find((i) => i.key === item.item_key)
    return state?.status !== 'ok'
  })

  const progressPercentage = totalRequiredCount > 0 
    ? Math.round((requiredOkCount / totalRequiredCount) * 100)
    : 0

  // Group items by category if provided
  const groupedItems = items.reduce<Record<string, ChecklistDraft[]>>((acc, item) => {
    const templateItem = template.find(t => t.item_key === item.key)
    const category = templateItem?.category || 'General'
    if (!acc[category]) acc[category] = []
    acc[category].push(item)
    return acc
  }, {})

  const hasCategories = template.some(item => item.category)

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
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 4000)
      notifyPermitChanged()
      router.refresh()
    } catch {
      setError('Unable to save site verification.')
    } finally {
      setSaving(false)
    }
  }

  const isReadOnly = !canEdit || status === 'verified'

  return (
    <section className="mt-6 rounded-xl border bg-background">
      {savedFlash && (
        <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-6 py-3 text-sm font-medium text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4" />
          Checklist saved successfully
        </div>
      )}

      {/* Header with summary */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <ClipboardCheck className="h-5 w-5 text-blue-600" />
            Site / Work-Area Verification
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirm the work area and required controls are ready.
          </p>
        </div>

        <SafetyStatusPill status={status} />
      </div>

      {/* Progress summary */}
      <div className="border-b bg-muted/20 px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            Verification Progress
          </span>
          <span className="text-sm text-muted-foreground">
            {requiredOkCount} / {totalRequiredCount} required checks OK
          </span>
        </div>
        
        {/* Progress bar */}
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700">
          <div 
            className={cn(
              "h-full transition-all",
              failedItems.length > 0 
                ? "bg-red-500" 
                : progressPercentage === 100 
                  ? "bg-green-500" 
                  : "bg-yellow-500"
            )}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* Status messages */}
        {failedRequiredItems.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
            <XCircle className="h-4 w-4 text-red-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                {failedRequiredItems.length} required check{failedRequiredItems.length !== 1 ? 's' : ''} failed
              </p>
              <ul className="mt-1 text-xs text-red-600 dark:text-red-400 space-y-1">
                {failedRequiredItems.map(item => (
                  <li key={item.item_key}>• {item.label}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {failedItems.length === 0 && requiredUnchecked.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950/30">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                {requiredUnchecked.length} required check{requiredUnchecked.length !== 1 ? 's' : ''} remaining
              </p>
              <ul className="mt-1 text-xs text-yellow-600 dark:text-yellow-400 space-y-1">
                {requiredUnchecked.map(item => (
                  <li key={item.item_key}>• {item.label}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {failedItems.length === 0 && requiredUnchecked.length === 0 && (
          <div className="mt-3 flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">
              All required checks completed
            </span>
          </div>
        )}
      </div>

      <div className="p-6">
        {/* Checklist items */}
        {hasCategories ? (
          // Grouped display
          <div className="space-y-6">
            {Object.entries(groupedItems).map(([category, categoryItems]) => (
              <div key={category}>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  {category}
                </h3>
                <ChecklistGroup
                  items={categoryItems}
                  template={template}
                  canEdit={!isReadOnly}
                  setItemStatus={setItemStatus}
                />
              </div>
            ))}
          </div>
        ) : (
          // Flat display
          <ChecklistGroup
            items={items}
            template={template}
            canEdit={!isReadOnly}
            setItemStatus={setItemStatus}
          />
        )}

        {/* Remarks */}
        <div className="mt-6 space-y-2">
          <label className="text-sm font-medium">
            Remarks
            {failedItems.length > 0 && (
              <span className="ml-2 text-xs text-red-600">
                Required when an item is marked Fail
              </span>
            )}
          </label>
          <textarea
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            disabled={isReadOnly}
            rows={2}
            placeholder={
              failedItems.length > 0
                ? "Explain the issue and corrective action..."
                : "Any notes about the work-area inspection..."
            }
            className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </div>

        {/* Verification info */}
        {initialRecord?.verified_by && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  Verified
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  Verified by {initialRecord.verifier?.full_name || 'Unknown'}
                  {initialRecord.verified_at
                    ? ` · ${new Intl.DateTimeFormat('en-MY', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(initialRecord.verified_at))}`
                    : ''}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Read-only indicator */}
        {isReadOnly && status === 'verified' && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            This checklist is locked after verification
          </div>
        )}

        {/* Save button */}
        {!isReadOnly && (
          <>
            {error && (
              <p className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Checklist'}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

/* =========================================================
   CHECKLIST GROUP
   ========================================================= */

function ChecklistGroup({
  items,
  template,
  canEdit,
  setItemStatus,
}: {
  items: ChecklistDraft[]
  template: SiteChecklistTemplateItem[]
  canEdit: boolean
  setItemStatus: (key: string, value: 'ok' | 'fail' | 'na') => void
}) {
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const templateItem = template.find(t => t.item_key === item.key)
        if (!templateItem) return null
        
        return (
          <ChecklistRow
            key={item.key}
            item={item}
            templateItem={templateItem}
            canEdit={canEdit}
            setItemStatus={setItemStatus}
          />
        )
      })}
    </div>
  )
}

/* =========================================================
   CHECKLIST ROW
   ========================================================= */

function ChecklistRow({
  item,
  templateItem,
  canEdit,
  setItemStatus,
}: {
  item: ChecklistDraft
  templateItem: SiteChecklistTemplateItem
  canEdit: boolean
  setItemStatus: (key: string, value: 'ok' | 'fail' | 'na') => void
}) {
  const isOk = item.status === 'ok'
  const isFail = item.status === 'fail'
  const isNa = item.status === 'na'
  
  return (
    <div className={cn(
      "flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between transition-colors",
      isFail && "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20",
      isOk && "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"
    )}>
      <div className="flex items-center gap-2">
        {isOk && <CheckCircle2 className="h-4 w-4 text-green-600" />}
        {isFail && <XCircle className="h-4 w-4 text-red-600" />}
        {isNa && <span className="h-4 w-4" />}
        
        <span className="text-sm">
          {templateItem.label}
          {templateItem.is_required && (
            <span className="text-red-500 ml-1">*</span>
          )}
        </span>
      </div>

      {canEdit ? (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={isOk ? "default" : "outline"}
            onClick={() => setItemStatus(item.key, 'ok')}
            className={cn(
              "min-w-[60px]",
              isOk && "bg-green-600 hover:bg-green-700 text-white"
            )}
          >
            ✓ OK
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isFail ? "destructive" : "outline"}
            onClick={() => setItemStatus(item.key, 'fail')}
            className="min-w-[60px]"
          >
            ✗ Fail
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isNa ? "secondary" : "outline"}
            onClick={() => setItemStatus(item.key, 'na')}
            className="min-w-[60px]"
          >
            N/A
          </Button>
        </div>
      ) : (
        <StatusIcon status={item.status} />
      )}
    </div>
  )
}

/* =========================================================
   STATUS COMPONENTS
   ========================================================= */

function StatusIcon({ status }: { status: 'ok' | 'fail' | 'na' }) {
  if (status === 'ok') {
    return (
      <Badge variant="success">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        OK
      </Badge>
    )
  }
  
  if (status === 'fail') {
    return (
      <Badge variant="destructive">
        <XCircle className="mr-1 h-3 w-3" />
        Fail
      </Badge>
    )
  }
  
  return (
    <Badge variant="secondary">
      N/A
    </Badge>
  )
}

