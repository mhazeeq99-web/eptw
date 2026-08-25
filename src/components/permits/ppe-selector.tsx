'use client'

/**
 * Structured PPE selection grouped by category.
 * - RECOMMENDED items are pre-selected but toggleable.
 * - REQUIRED items are locked on (company-configured) and cannot be removed.
 * - "Other — specify" free text for anything not in the catalogue.
 */
export type PpeItem = {
  id: number
  category: string
  name: string
}

export function PpeSelector({
  items,
  recommendationByItemId,
  selectedIds,
  onToggle,
  ppeOther,
  onPpeOtherChange,
}: {
  items: PpeItem[]
  recommendationByItemId: Map<number, 'recommended' | 'required'>
  selectedIds: Set<number>
  onToggle: (id: number) => void
  ppeOther: string
  onPpeOtherChange: (value: string) => void
}) {
  const categories: string[] = []
  for (const item of items) {
    if (!categories.includes(item.category)) {
      categories.push(item.category)
    }
  }

  return (
    <div className="space-y-6">
      {categories.map((category) => {
        const categoryItems = items.filter(
          (item) => item.category === category
        )
        return (
          <div key={category}>
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {category}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {categoryItems.map((item) => {
                const requirement =
                  recommendationByItemId.get(item.id)
                const isRequired = requirement === 'required'
                const isSelected = selectedIds.has(item.id)
                return (
                  <label
                    key={item.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isRequired}
                      onChange={() => onToggle(item.id)}
                      className="h-4 w-4 rounded border"
                    />
                    <span>{item.name}</span>
                    {isRequired && (
                      <span className="ml-auto rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        REQUIRED
                      </span>
                    )}
                    {requirement === 'recommended' && (
                      <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Recommended
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}

      <div>
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Other
        </p>
        <input
          type="text"
          value={ppeOther}
          onChange={(event) => onPpeOtherChange(event.target.value)}
          placeholder="Other PPE — specify"
          className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
    </div>
  )
}
