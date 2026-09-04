'use client'

import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Shows the current user's company code (e.g. TESTSDNBHD) in the app header.
 *
 * Contractors and platform admins have no `profiles.company_id`, so nothing
 * is rendered for those accounts — the header simply shows the tagline.
 * Reads via the existing company-scoped RLS (a user can only read their own
 * company row), so no extra authorization is introduced.
 */
export function CompanyBadge() {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function loadCompany() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle()

      if (cancelled) return
      if (!profile?.company_id) return

      const { data: company } = await supabase
        .from('companies')
        .select('code, name')
        .eq('id', profile.company_id)
        .maybeSingle()

      if (cancelled) return
      if (company?.code) {
        setLabel(company.code)
      }
    }

    loadCompany()
    return () => {
      cancelled = true
    }
  }, [])

  if (!label) return null

  return (
    <span
      title="Company code"
      className="inline-flex max-w-[140px] items-center gap-1.5 truncate rounded-md border bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground sm:max-w-[200px]"
    >
      <Building2 className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  )
}
