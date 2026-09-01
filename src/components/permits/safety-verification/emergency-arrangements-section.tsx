'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  CheckCircle2, 
  AlertTriangle, 
  Phone, 
  MapPin, 
  Siren,
  PhoneCall,
  Users,
  Flame,
  HeartPulse,
  LifeBuoy,
  FileText,
  Shield,
  Lock,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { notifyPermitChanged } from '@/lib/permit-changed'
import { cn } from '@/lib/utils'
import { SafetyStatusPill } from '../safety-status-pill'
import { SectionVerifyButton } from '../section-verify-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export type EmergencyArrangementsRecord = {
  id: number
  permit_id: number
  status: 'not_confirmed' | 'confirmed'
  emergency_contact: string | null
  muster_point: string | null
  emergency_procedure: string | null
  first_aid_available: boolean
  fire_response_available: boolean
  rescue_required: boolean
  rescue_available: boolean
  confirmed_by: string | null
  confirmed_at: string | null
  remarks: string | null
  confirmer?: {
    full_name: string
    role?: string
  } | null
}

export function EmergencyArrangementsSection({
  permitId,
  canEdit,
  initialRecord,
}: {
  permitId: number
  canEdit: boolean
  initialRecord: EmergencyArrangementsRecord | null
}) {
  const router = useRouter()

  const [emergencyContact, setEmergencyContact] = useState(
    initialRecord?.emergency_contact ?? ''
  )
  const [musterPoint, setMusterPoint] = useState(
    initialRecord?.muster_point ?? ''
  )
  const [emergencyProcedure, setEmergencyProcedure] = useState(
    initialRecord?.emergency_procedure ?? ''
  )
  const [firstAid, setFirstAid] = useState(
    initialRecord?.first_aid_available ?? false
  )
  const [fireResponse, setFireResponse] = useState(
    initialRecord?.fire_response_available ?? false
  )
  const [rescueRequired, setRescueRequired] = useState(
    initialRecord?.rescue_required ?? false
  )
  const [rescueAvailable, setRescueAvailable] = useState(
    initialRecord?.rescue_available ?? false
  )
  const [remarks, setRemarks] = useState(
    initialRecord?.remarks ?? ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)

  const confirmed = initialRecord?.status === 'confirmed'
  
  // Calculate readiness
  const readinessChecks = [
    { label: 'First Aid', ready: firstAid, icon: HeartPulse },
    { label: 'Fire Response', ready: fireResponse, icon: Flame },
    { label: 'Rescue Capability', ready: !rescueRequired || rescueAvailable, icon: LifeBuoy },
    { label: 'Emergency Contact', ready: emergencyContact.trim().length > 0, icon: Phone },
    { label: 'Muster Point', ready: musterPoint.trim().length > 0, icon: MapPin },
  ]
  
  const readyCount = readinessChecks.filter(check => check.ready).length
  const totalChecks = readinessChecks.length
  const allReady = readyCount === totalChecks

  async function handleConfirm() {
    setError('')

    const rescueOk = !rescueRequired || rescueAvailable

    if (!firstAid || !fireResponse || !rescueOk) {
      setError(
        'First aid and fire response must be available, and rescue must be available when required.'
      )
      return
    }

    if (!emergencyContact.trim() || !musterPoint.trim()) {
      setError(
        'Emergency contact and muster point are required.'
      )
      return
    }

    setSaving(true)

    try {
      const response = await fetch(
        `/api/permits/${permitId}/emergency-arrangements`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'confirmed',
            emergency_contact: emergencyContact.trim() || null,
            muster_point: musterPoint.trim() || null,
            emergency_procedure: emergencyProcedure.trim() || null,
            first_aid_available: firstAid,
            fire_response_available: fireResponse,
            rescue_required: rescueRequired,
            rescue_available: rescueAvailable,
            remarks: remarks.trim() || null,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setError(
          result.error || 'Unable to save emergency arrangements.'
        )
        return
      }

      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 4000)
      notifyPermitChanged()
      router.refresh()
    } catch {
      setError('Unable to save emergency arrangements.')
    } finally {
      setSaving(false)
    }
  }

  const isReadOnly = !canEdit || confirmed

  return (
    <section className="mt-6 rounded-xl border bg-background">
      {savedFlash && (
        <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-6 py-3 text-sm font-medium text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4" />
          Emergency arrangements saved successfully
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Siren className="h-5 w-5 text-red-600" />
            Emergency Arrangements
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirm emergency contacts, location and response resources.
          </p>
        </div>

        {canEdit && (
          <SectionVerifyButton
            verified={confirmed && allReady}
            onVerify={async () => {
              await handleConfirm()
              return allReady
            }}
          />
        )}
      </div>

      {/* Readiness summary */}
      <div className="border-b bg-muted/20 px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            Emergency Readiness
          </span>
          <span className="text-sm text-muted-foreground">
            {readyCount} / {totalChecks} items ready
          </span>
        </div>
        
        {/* Readiness checks */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {readinessChecks.map((check) => (
            <div
              key={check.label}
              className={cn(
                "flex items-center gap-2 rounded-md border p-2",
                check.ready 
                  ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30" 
                  : "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30"
              )}
            >
              <check.icon className={cn(
                "h-4 w-4 shrink-0",
                check.ready ? "text-green-600" : "text-yellow-600"
              )} />
              <span className="text-xs font-medium">
                {check.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Emergency Contacts */}
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            <Phone className="h-4 w-4 text-red-600" />
            Emergency Contacts
          </h3>
          
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Emergency Contact */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Emergency Contact *
              </label>
              {isReadOnly ? (
                <div className="rounded-lg border-2 border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
                  <PhoneCall className="h-5 w-5 text-red-600 mb-2" />
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {emergencyContact || '—'}
                  </p>
                </div>
              ) : (
                <div className="relative">
                  <PhoneCall className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={emergencyContact}
                    onChange={(event) => setEmergencyContact(event.target.value)}
                    placeholder="e.g. Site Control Room 03-1234-5678"
                    className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>

            {/* Muster Point */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Muster Point *
              </label>
              {isReadOnly ? (
                <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
                  <MapPin className="h-5 w-5 text-blue-600 mb-2" />
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {musterPoint || '—'}
                  </p>
                </div>
              ) : (
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={musterPoint}
                    onChange={(event) => setMusterPoint(event.target.value)}
                    placeholder="e.g. Assembly area A"
                    className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Emergency Resources */}
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            <Shield className="h-4 w-4 text-blue-600" />
            Emergency Resources
          </h3>
          
          <div className="space-y-2">
            {/* First Aid */}
            <EmergencyResourceCard
              icon={HeartPulse}
              label="First Aid"
              description="First aid provision available"
              available={firstAid}
              editable={!isReadOnly}
              onChange={setFirstAid}
            />

            {/* Fire Response */}
            <EmergencyResourceCard
              icon={Flame}
              label="Fire Response"
              description="Fire response capability available"
              available={fireResponse}
              editable={!isReadOnly}
              onChange={setFireResponse}
            />

            {/* Rescue Required */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <LifeBuoy className="h-5 w-5 text-orange-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    Rescue Arrangement
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Is rescue capability required for this work?
                  </p>
                </div>
                
                {isReadOnly ? (
                  <Badge variant={rescueRequired ? "warning" : "secondary"}>
                    {rescueRequired ? 'Required' : 'Not required'}
                  </Badge>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={rescueRequired ? "default" : "outline"}
                      onClick={() => setRescueRequired(true)}
                    >
                      Yes
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={!rescueRequired ? "default" : "outline"}
                      onClick={() => {
                        setRescueRequired(false)
                        setRescueAvailable(false)
                      }}
                    >
                      No
                    </Button>
                  </div>
                )}
              </div>

              {/* Rescue Available (only if required) */}
              {rescueRequired && (
                <div className="mt-3 pl-8">
                  <EmergencyResourceCard
                    icon={Users}
                    label="Rescue Capability"
                    description="Rescue team/equipment available"
                    available={rescueAvailable}
                    editable={!isReadOnly}
                    onChange={setRescueAvailable}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Emergency Procedure */}
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            <FileText className="h-4 w-4 text-gray-600" />
            Procedure & Notes
          </h3>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Emergency Procedure / Reference
              </label>
              <textarea
                value={emergencyProcedure}
                onChange={(event) => setEmergencyProcedure(event.target.value)}
                disabled={isReadOnly}
                rows={2}
                placeholder="e.g. Site Emergency Response Plan ERP-01"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Emergency Notes
              </label>
              <textarea
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                disabled={isReadOnly}
                rows={2}
                placeholder="Special instructions, limitations, or additional emergency information..."
                className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
              />
            </div>
          </div>
        </div>

        {/* Confirmation */}
        {initialRecord?.confirmed_by && (
          <div className="mt-4">
            <SafetyStatusPill status="verified" />
          </div>
        )}

        {/* Locked indicator */}
        {isReadOnly && confirmed && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            Emergency arrangements locked after confirmation
          </div>
        )}

        {/* Action button */}
        {!isReadOnly && (
          <>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Confirm Emergency Readiness'}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

/* =========================================================
   EMERGENCY RESOURCE CARD
   ========================================================= */

function EmergencyResourceCard({
  icon: Icon,
  label,
  description,
  available,
  editable,
  onChange,
}: {
  icon: any
  label: string
  description: string
  available: boolean
  editable: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className={cn(
      "rounded-lg border p-4 transition-colors",
      available 
        ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20" 
        : "border-gray-200 dark:border-gray-700"
    )}>
      <div className="flex items-center gap-3">
        <Icon className={cn(
          "h-5 w-5",
          available ? "text-green-600" : "text-gray-400"
        )} />
        <div className="flex-1">
          <p className="text-sm font-medium">
            {label}
          </p>
          <p className="text-xs text-muted-foreground">
            {description}
          </p>
        </div>
        
        {editable ? (
          <Button
            type="button"
            size="sm"
            variant={available ? "default" : "outline"}
            onClick={() => onChange(!available)}
            className={cn(
              available && "bg-green-600 hover:bg-green-700 text-white"
            )}
          >
            {available ? '✓ Available' : 'Mark Available'}
          </Button>
        ) : (
          <Badge variant={available ? "success" : "secondary"}>
            {available ? 'Available' : 'Not available'}
          </Badge>
        )}
      </div>
    </div>
  )
}

