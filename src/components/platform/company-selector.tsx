'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  SearchableCombobox,
  type ComboboxOption,
} from '@/components/company/searchable-combobox'

/**
 * Company selector for the Platform Configuration page. Uses the shared
 * searchable combobox (search by name/code) and navigates to
 * /platform/configuration?company={id}&tab={currentTab} on selection so the
 * server component can scope its queries to the selected company.
 */
export function CompanySelector({
  currentCompanyId,
  currentTab,
}: {
  currentCompanyId: string | null
  currentTab: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const selectedCompany = (() => {
    // The page already resolved the selected company; the combobox only needs
    // the current value to display it. We read it from the search params.
    const id = currentCompanyId ?? searchParams.get('company')
    return id ? ({ id: Number(id), label: '' } as ComboboxOption) : null
  })()

  async function searchCompanies(query: string) {
    const res = await fetch(
      `/api/admin/companies/search?q=${encodeURIComponent(query)}`
    )
    if (!res.ok) throw new Error('search failed')
    const body = await res.json()
    return (body.companies ?? []).map((company: { id: number; name: string; code: string | null }) => ({
      id: company.id,
      label: company.name,
      code: company.code,
    }))
  }

  function handleSelect(option: ComboboxOption | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (option) params.set('company', String(option.id))
    else params.delete('company')
    // Preserve the current tab.
    params.set('tab', currentTab)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <SearchableCombobox
      searchFn={searchCompanies}
      value={selectedCompany}
      onChange={handleSelect}
      placeholder="Search company by name or code..."
      label="Company"
      clearable
    />
  )
}
