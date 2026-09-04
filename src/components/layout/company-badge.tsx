'use client'

import { useEffect, useState } from 'react'
import { Building2, Wrench } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Shows the current user's company code (e.g. TESTSDNBHD) or, for contractor
 * admins, their contractor company code (e.g. AA9X) in the app header.
 *
 * - Company staff read their code from companies (own company row via RLS).
 * - Contractor admins read their own contractor row via contractor_users ->
 *   contractors (own-membership RLS).
 * - Platform admins belong to no company/contractor, so nothing is rendered.
 */
export function CompanyBadge() {
  const [label, setLabel] = useState<string | null>(null)
  const [isContractor, setIsContractor] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function loadCode() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, company_id')
        .eq('id', user.id)
        .maybeSingle()

      if (cancelled) return
      if (!profile) return

      // Contractor admin: no company_id — code lives on their contractor row.
      if (profile.role === 'contractor_admin') {
        const { data: membership } = await supabase
          .from('contractor_users')
          .select('contractor_id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle()

        if (cancelled) return
        if (!membership?.contractor_id) return

        const { data: contractor } = await supabase
          .from('contractors')
          .select('company_code')
          .eq('id', membership.contractor_id)
          .maybeSingle()

        if (cancelled) return
        if (contractor?.company_code) {
          setIsContractor(true)
          setLabel(contractor.company_code)
        }
        return
      }

      if (!profile.company_id) return

      const { data: company } = await supabase
        .from('companies')
        .select('code')
        .eq('id', profile.company_id)
        .maybeSingle()

      if (cancelled) return
      if (company?.code) {
        setLabel(company.code)
      }
    }

    loadCode()
    return () => {
      cancelled = true
    }
  }, [])

  if (!label) return null

  const Icon = isContractor ? Wrench : Building2

  return (
    <span
      title={
        isContractor
          ? 'Contractor company code'
          : 'Company code'
      }
      className="inline-flex max-w-[140px] items-center gap-1.5 truncate rounded-md border bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground sm:max-w-[200px]"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  )
}
