'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  CheckCircle2, 
  AlertTriangle, 
  Shield, 
  HardHat,
  Eye,
  Hand,
  Footprints,
  Wind,
  Droplets,
  Ear,
  Lock,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { notifyPermitChanged } from '@/lib/permit-changed'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export type PpeVerificationItem = {
  ppe_item_id: number
  name: string
  category: string
  requirement: 'required' | 'recommended'
  is_selected: boolean
  verified: boolean
}

const PPE_CATEGORY_ICONS: Record<string, any> = {
  'Head Protection': HardHat,
  'Eye Protection': Eye,
  'Face Protection': Eye,
  'Hand Protection': Hand,
  'Foot Protection': Footprints,
  'Respiratory Protection': Wind,
  'Chemical Protection': Droplets,
  'Hearing Protection': Ear,
  'Fall Protection': Shield,
  'Other': Shield,
}

export function PpeVerificationSection({
  permitId,
  canEdit,
  initialItems,
}: {
  permitId: number
  canEdit: boolean
  initialItems: PpeVerificationItem[]
}) {
  const router = useRouter()

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const [showRecommended, setShowRecommended] = useState(true)
  const [verifyMode, setVerifyMode] = useState<'bulk' | 'individual'>('bulk')

  const requiredItems = initialItems.filter(
    (item) => item.requirement === 'required'
  )
  const recommendedItems = initialItems.filter(
    (item) => item.requirement === 'recommended'
  )
  
  const hasRequired = requiredItems.length > 0
  const hasRecommended = recommendedItems.length > 0
  
  const verifiedCount = requiredItems.filter(
    (item) => item.is_selected && item.verified
  ).length
  
  const selectedCount = requiredItems.filter(
    (item) => item.is_selected
  ).length
  
  const totalRequired = requiredItems.length
  
  const allRequiredVerified = hasRequired && verifiedCount === totalRequired
  
  const progressPercentage = totalRequired > 0 
    ? Math.round((verifiedCount / totalRequired) * 100)
    : 0

  async function handleBulkVerify() {
    setError('')
    setSaving(true)

    try {
      const response = await fetch(
        `/api/permits/${permitId}/ppe-verification`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ verified: true }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error || 'Unable to update PPE verification.'
        )
        return
      }

      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 4000)
      notifyPermitChanged()
      router.refresh()
    } catch {
      setError('Unable to update PPE verification.')
    } finally {
      setSaving(false)
    }
  }

  if (!hasRequired) {
    return null
  }

  // Group items by category
  const groupedItems = requiredItems.reduce<Record<string, PpeVerificationItem[]>>((acc, item) => {
    const category = item.category || 'Other'
    if (!acc[category]) acc[category] = []
    acc[category].push(item)
    return acc
  }, {})

  return (
    <section className="mt-6 rounded-xl border bg-background">
      {savedFlash && (
        <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-6 py-3 text-sm font-medium text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4" />
          PPE verification saved successfully
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Shield className="h-5 w-5 text-blue-600" />
            PPE Verification
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirm required PPE is available for the work.
          </p>
        </div>

        <PpeStatusBadge 
          verifiedCount={verifiedCount}
          totalRequired={totalRequired}
          allVerified={allRequiredVerified}
        />
      </div>

      {/* Readiness summary */}
      <div className="border-b bg-muted/20 px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            PPE Readiness
          </span>
          <span className="text-sm text-muted-foreground">
            {verifiedCount} / {totalRequired} required items verified
          </span>
        </div>
        
        {/* Progress bar */}
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700">
          <div 
            className={cn(
              "h-full transition-all",
              allRequiredVerified ? "bg-green-500" : "bg-yellow-500"
            )}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* Status message */}
        {allRequiredVerified ? (
          <div className="mt-3 flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">
              All required PPE verified and available
            </span>
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-2 text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            <div>
              <p className="text-sm font-medium">
                {totalRequired - verifiedCount} item{totalRequired - verifiedCount !== 1 ? 's' : ''} require attention
              </p>
              <ul className="mt-1 text-xs space-y-0.5">
                {requiredItems
                  .filter(item => !(item.is_selected && item.verified))
                  .map(item => (
                    <li key={item.ppe_item_id}>• {item.name}</li>
                  ))
                }
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Required PPE */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Required PPE
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Must be available and verified
            </span>
          </h3>

          {/* Grouped by category */}
          <div className="space-y-4">
            {Object.entries(groupedItems).map(([category, items]) => {
              const CategoryIcon = PPE_CATEGORY_ICONS[category] || Shield
              return (
                <div key={category}>
                  <h4 className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                    <CategoryIcon className="h-4 w-4" />
                    {category}
                  </h4>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <PpeItemRow
                        key={item.ppe_item_id}
                        item={item}
                        canEdit={canEdit}
                        verifyMode={verifyMode}
                        onVerify={handleBulkVerify}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Bulk verification action */}
          {canEdit && !allRequiredVerified && (
            <>
              {error && (
                <p className="mt-3 text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  onClick={handleBulkVerify}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Confirm All Required PPE Available'}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Recommended PPE */}
        {hasRecommended && (
          <div className="border-t pt-6">
            <button
              type="button"
              onClick={() => setShowRecommended(!showRecommended)}
              className="flex items-center justify-between w-full mb-3"
            >
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Recommended PPE
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Advisory — does not block approval
                </span>
              </h3>
              {showRecommended ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {showRecommended && (
              <div className="space-y-1">
                {recommendedItems.map((item) => (
                  <div
                    key={item.ppe_item_id}
                    className="flex items-center justify-between rounded-md border p-3 text-sm opacity-75"
                  >
                    <div className="flex items-center gap-2">
                      <span>{item.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        Recommended
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Optional
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

/* =========================================================
   PPE ITEM ROW
   ========================================================= */

function PpeItemRow({
  item,
  canEdit,
  verifyMode,
  onVerify,
}: {
  item: PpeVerificationItem
  canEdit: boolean
  verifyMode: 'bulk' | 'individual'
  onVerify: () => void
}) {
  const isVerified = item.is_selected && item.verified
  const isSelected = item.is_selected
  const needsAttention = item.requirement === 'required' && !isVerified

  return (
    <div className={cn(
      "flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between transition-colors",
      isVerified 
        ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20" 
        : needsAttention
          ? "border-yellow-200 bg-yellow-50/50 dark:border-yellow-800 dark:bg-yellow-950/20"
          : "border-gray-200 dark:border-gray-700"
    )}>
      <div className="flex items-center gap-2">
        {isVerified ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : needsAttention ? (
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
        ) : (
          <Shield className="h-4 w-4 text-gray-400" />
        )}
        
        <div>
          <span className="text-sm font-medium">
            {item.name}
          </span>
          {item.requirement === 'required' && (
            <span className="text-red-500 ml-1">*</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isVerified ? (
          <Badge variant="success">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Verified
          </Badge>
        ) : needsAttention ? (
          isSelected ? (
            <Badge variant="warning">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Verification required
            </Badge>
          ) : (
            <Badge variant="destructive">
              Not selected
            </Badge>
          )
        ) : (
          <Badge variant="secondary">
            Optional
          </Badge>
        )}
      </div>
    </div>
  )
}

/* =========================================================
   STATUS BADGE
   ========================================================= */

function PpeStatusBadge({
  verifiedCount,
  totalRequired,
  allVerified,
}: {
  verifiedCount: number
  totalRequired: number
  allVerified: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        allVerified
          ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'
      )}
    >
      {allVerified ? (
        <>
          <CheckCircle2 className="h-3 w-3" />
          Verified
        </>
      ) : (
        <>
          <AlertTriangle className="h-3 w-3" />
          {verifiedCount}/{totalRequired} Verified
        </>
      )}
    </span>
  )
}
