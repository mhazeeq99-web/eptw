'use client'

import { useRouter } from 'next/navigation'
import { HardHat } from 'lucide-react'
import { notifyPermitChanged } from '@/lib/permit-changed'
import { Badge } from '@/components/ui/badge'
import { SectionVerifyButton } from './section-verify-button'

type PpeItem = {
  ppe_item_id: number
  is_selected: boolean
  verified: boolean
  ppe_item: { id: number; category: string; name: string } | null
}

/**
 * PPE Requirements section with a single "Verify" button in the top-right.
 * Verifying calls the bulk PPE-verification endpoint (all selected PPE at
 * once). Once verified the button becomes a green "Verified" pill.
 */
export function PpeRequirementsSection({
  permitId,
  permit,
  canVerify,
}: {
  permitId: number
  permit: {
    permit_ppe: PpeItem[] | null
    ppe_other: string | null
  }
  canVerify: boolean
}) {
  const router = useRouter()

  const selectedPpe = (permit.permit_ppe ?? []).filter(
    (item) => item.is_selected && item.ppe_item
  )
  const allVerified =
    selectedPpe.length > 0 &&
    selectedPpe.every((item) => item.verified === true)

  const categories: string[] = []
  for (const item of selectedPpe) {
    const category = item.ppe_item?.category ?? 'Other'
    if (!categories.includes(category)) categories.push(category)
  }

  async function handleVerify(): Promise<boolean> {
    const response = await fetch(
      `/api/permits/${permitId}/ppe-verification`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified: true }),
      }
    )
    if (!response.ok) {
      const result = await response.json()
      throw new Error(result.error || 'Unable to verify PPE')
    }
    notifyPermitChanged()
    router.refresh()
    return true
  }

  if (selectedPpe.length === 0 && !permit.ppe_other) {
    return null
  }

  return (
    <section id="ppe-section" className="mt-6 rounded-xl border bg-background">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <HardHat className="h-5 w-5 text-blue-600" />
            PPE Requirements
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Personal protective equipment required for this work
          </p>
        </div>
        {canVerify && (
          <SectionVerifyButton verified={allVerified} onVerify={handleVerify} />
        )}
      </div>

      <div className="p-6">
        <div className="space-y-6">
          {categories.map((category) => (
            <div key={category}>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                {category}
              </h4>
              <div className="flex flex-wrap gap-2">
                {selectedPpe
                  .filter((item) => (item.ppe_item?.category ?? 'Other') === category)
                  .map((item) => (
                    <Badge key={item.ppe_item_id} variant="secondary">
                      {item.ppe_item?.name}
                    </Badge>
                  ))}
              </div>
            </div>
          ))}
          {permit.ppe_other && (
            <div>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                Other
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {permit.ppe_other}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
