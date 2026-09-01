'use client'

import { useState } from 'react'
import {
  HOT_WORK_TYPES,
  WAH_ACCESS_METHODS,
  ELEC_WORK_TYPES,
} from '@/lib/specialised-permit'
import { 
  Flame, 
  AlertTriangle, 
  ArrowUp, 
  Zap,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export type SpecialDetailsState = Record<string, unknown>

function FieldGroup({
  title,
  icon,
  description,
  children,
  defaultOpen = true,
}: {
  title: string
  icon?: any
  description?: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const Icon = icon

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="rounded-md bg-muted p-1.5">
              <Icon className="h-4 w-4" />
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {description}
              </p>
            )}
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      
      {isOpen && (
        <div className="border-t px-4 py-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}

function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className={cn(
      "flex items-center gap-3 rounded-md border px-4 py-3 text-sm cursor-pointer transition-colors",
      checked 
        ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/30" 
        : "hover:bg-muted/50",
      disabled && "cursor-not-allowed opacity-60"
    )}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border"
      />
      <span className="flex-1">{label}</span>
      {checked && (
        <CheckCircle2 className="h-4 w-4 text-green-600" />
      )}
    </label>
  )
}

function Choice({
  label,
  value,
  onChange,
  disabled,
  description,
}: {
  label: string
  value: boolean | null
  onChange: (value: boolean | null) => void
  disabled?: boolean
  description?: string
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {description}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(true)}
          className={cn(
            "flex-1 rounded-md border px-4 py-2.5 text-sm font-medium transition-all",
            value === true
              ? "border-green-600 bg-green-600 text-white"
              : "hover:bg-muted"
          )}
        >
          Yes
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(false)}
          className={cn(
            "flex-1 rounded-md border px-4 py-2.5 text-sm font-medium transition-all",
            value === false
              ? "border-red-600 bg-red-600 text-white"
              : "hover:bg-muted"
          )}
        >
          No
        </button>
      </div>
    </div>
  )
}

function TripleChoice({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
}) {
  const options = ['Yes', 'No', 'Not Applicable']
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option)}
            className={cn(
              "flex-1 min-w-[80px] rounded-md border px-3 py-2 text-xs font-medium transition-all",
              value === option
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

function MultiSelect({
  label,
  options,
  value,
  onChange,
  disabled,
  description,
}: {
  label: string
  options: readonly string[]
  value: string[] | undefined
  onChange: (value: string[]) => void
  disabled?: boolean
  description?: string
}) {
  const selectedCount = (value ?? []).length
  
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {description}
          </p>
        )}
      </div>
      
      {selectedCount > 0 && (
        <Badge variant="secondary" className="text-xs">
          {selectedCount} selected
        </Badge>
      )}
      
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = (value ?? []).includes(option)
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => {
                const next = new Set(value ?? [])
                if (next.has(option)) {
                  next.delete(option)
                } else {
                  next.add(option)
                }
                onChange([...next])
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all",
                checked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              )}
            >
              {checked ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <span className="h-4 w-4" />
              )}
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  required,
  description,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  required?: boolean
  description?: string
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-sm font-medium">
          {label}
          {required && <span className="ml-1 text-destructive">*</span>}
        </label>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {description}
          </p>
        )}
      </div>
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2.5 text-sm disabled:opacity-60 disabled:bg-muted/50"
      />
    </div>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  required,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  required?: boolean
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      <textarea
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2.5 text-sm disabled:opacity-60 disabled:bg-muted/50"
      />
    </div>
  )
}

const str = (value: unknown): string =>
  typeof value === 'string' ? value : ''

const strArr = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []

/**
 * Specialised permit-type details form. Renders the section for the given
 * permit type code (HOT / CSE / WAH / ELEC) and reports changes upward as a
 * plain JSONB object that the API validates again server-side. COLD (and
 * unknown codes) render nothing.
 */
export function SpecialisedDetailsFields({
  code,
  value,
  onChange,
  disabled,
  embedded,
}: {
  code: string | null
  value: SpecialDetailsState
  onChange: (value: SpecialDetailsState) => void
  disabled?: boolean
  /** Render without the outer card so the parent can wrap it in a section. */
  embedded?: boolean
}) {
  if (!code) return null

  const update = (patch: Record<string, unknown>) => {
    onChange({ ...value, ...patch })
  }

  if (code === 'HOT') {
    const selectedTypes = strArr(value.hot_work_type)
    const showOther = selectedTypes.includes('Other')
    
    return (
      <div className="space-y-4">
        {/* Work Information */}
        <FieldGroup
          title="Work Information"
          icon={Flame}
          description="What hot work will be performed and where?"
        >
          <MultiSelect
            label="Hot Work Type *"
            options={HOT_WORK_TYPES}
            value={selectedTypes}
            disabled={disabled}
            description="Select all that apply"
            onChange={(items) => update({ hot_work_type: items })}
          />

          {showOther && (
            <TextField
              label="Other — specify"
              value={str(value.hot_work_type_other)}
              disabled={disabled}
              onChange={(text) => update({ hot_work_type_other: text })}
            />
          )}

          <TextField
            label="Hot Work Area"
            value={str(value.hot_work_area)}
            disabled={disabled}
            placeholder="e.g. Tank farm south area"
            onChange={(text) => update({ hot_work_area: text })}
          />
        </FieldGroup>

        {/* Fire & Combustible Hazards */}
        <FieldGroup
          title="Fire & Combustible Hazards"
          icon={AlertTriangle}
          description="Identify potential fire and ignition hazards"
        >
          <Choice
            label="Potential combustible materials present?"
            value={
              typeof value.combustibles_present === 'boolean'
                ? value.combustibles_present
                : null
            }
            disabled={disabled}
            onChange={(yes) => update({ combustibles_present: yes })}
          />

          {value.combustibles_present === true && (
            <TextAreaField
              label="Combustible materials *"
              value={str(value.combustible_materials)}
              disabled={disabled}
              placeholder="List the combustible materials..."
              required
              onChange={(text) => update({ combustible_materials: text })}
            />
          )}

          <Choice
            label="Nearby openings / drains?"
            value={
              typeof value.nearby_openings_drains === 'boolean'
                ? value.nearby_openings_drains
                : null
            }
            disabled={disabled}
            onChange={(yes) => update({ nearby_openings_drains: yes })}
          />
        </FieldGroup>

        {/* Fire Controls */}
        <FieldGroup
          title="Fire Controls"
          icon={Flame}
          description="Controls required to prevent and respond to fire"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Choice
              label="Spark / slag containment"
              value={
                typeof value.spark_containment_required === 'boolean'
                  ? value.spark_containment_required
                  : null
              }
              disabled={disabled}
              onChange={(yes) => update({ spark_containment_required: yes })}
            />

            <Choice
              label="Fire Watch required"
              value={
                typeof value.fire_watch_required === 'boolean'
                  ? value.fire_watch_required
                  : null
              }
              disabled={disabled}
              onChange={(yes) => update({ fire_watch_required: yes })}
            />
          </div>

          {value.fire_watch_required === true && (
            <TextField
              label="Fire Watch Person"
              value={str(value.fire_watch_person)}
              disabled={disabled}
              placeholder="Name of the fire watch person"
              onChange={(text) => update({ fire_watch_person: text })}
            />
          )}

          <Choice
            label="Fire Extinguisher available?"
            value={
              typeof value.fire_extinguisher_available === 'boolean'
                ? value.fire_extinguisher_available
                : null
            }
            disabled={disabled}
            onChange={(yes) => update({ fire_extinguisher_available: yes })}
          />
        </FieldGroup>

        {/* Area Preparation */}
        <FieldGroup
          title="Area Preparation"
          icon={CheckCircle2}
          description="Confirm the work area has been prepared"
        >
          <div className="space-y-2">
            {[
              'Combustible materials removed',
              'Combustible materials protected',
              'Area inspected',
            ].map((label) => {
              const checked = strArr(value.area_preparation).includes(label)
              return (
                <Checkbox
                  key={label}
                  label={label}
                  checked={checked}
                  disabled={disabled}
                  onChange={(next) => {
                    const items = new Set(strArr(value.area_preparation))
                    if (next) items.add(label)
                    else items.delete(label)
                    update({ area_preparation: [...items] })
                  }}
                />
              )
            })}
          </div>
        </FieldGroup>
      </div>
    )
  }

  if (code === 'CSE') {
    return (
      <div className="space-y-4">
        {/* Space Identification */}
        <FieldGroup
          title="Space Identification"
          icon={AlertTriangle}
          description="Identify the confined space"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Confined Space / Asset Name"
              value={str(value.confined_space_name)}
              disabled={disabled}
              required
              placeholder="e.g. Product tank T-101"
              onChange={(text) => update({ confined_space_name: text })}
            />

            <TextField
              label="Confined Space ID / Reference"
              value={str(value.confined_space_id)}
              disabled={disabled}
              placeholder="e.g. T-101"
              onChange={(text) => update({ confined_space_id: text })}
            />
          </div>
        </FieldGroup>

        {/* Entry Details */}
        <FieldGroup
          title="Entry Details"
          icon={ArrowUp}
          description="How will personnel enter and exit?"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Entry Purpose"
              value={str(value.entry_purpose)}
              disabled={disabled}
              placeholder="e.g. Internal inspection"
              onChange={(text) => update({ entry_purpose: text })}
            />

            <TextField
              label="Entry Point"
              value={str(value.entry_point)}
              disabled={disabled}
              placeholder="e.g. Top manhole"
              onChange={(text) => update({ entry_point: text })}
            />

            <TextField
              label="Access / Egress Method"
              value={str(value.access_egress_method)}
              disabled={disabled}
              placeholder="e.g. Fixed ladder + harness"
              description="How will personnel safely enter and exit?"
              onChange={(text) => update({ access_egress_method: text })}
            />

            <TextField
              label="Approximate Entry Depth"
              value={str(value.entry_depth)}
              disabled={disabled}
              placeholder="e.g. 3 m"
              onChange={(text) => update({ entry_depth: text })}
            />
          </div>
        </FieldGroup>

        {/* Atmosphere & Ventilation */}
        <FieldGroup
          title="Atmosphere & Ventilation"
          icon={Zap}
          description="Ventilation and atmospheric controls"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Ventilation Method"
              value={str(value.ventilation_method)}
              disabled={disabled}
              placeholder="e.g. Forced air blower"
              onChange={(text) => update({ ventilation_method: text })}
            />

            <TripleChoice
              label="Continuous Ventilation"
              value={
                typeof value.continuous_ventilation === 'string'
                  ? value.continuous_ventilation
                  : null
              }
              disabled={disabled}
              onChange={(text) => update({ continuous_ventilation: text })}
            />
          </div>
        </FieldGroup>
      </div>
    )
  }

  if (code === 'WAH') {
    const selectedAccess = strArr(value.access_method)
    const showAccessOther = selectedAccess.includes('Other')
    
    return (
      <div className="space-y-4">
        {/* Work Information */}
        <FieldGroup
          title="Work Information"
          icon={ArrowUp}
          description="What work at height will be performed?"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Work Height"
              value={str(value.work_height)}
              disabled={disabled}
              placeholder="e.g. 6 m"
              onChange={(text) => update({ work_height: text })}
            />

            <TextField
              label="Work Location"
              value={str(value.work_location)}
              disabled={disabled}
              placeholder="e.g. Roof of warehouse"
              onChange={(text) => update({ work_location: text })}
            />
          </div>

          <TextField
            label="Work Position"
            value={str(value.work_position)}
            disabled={disabled}
            placeholder="e.g. Standing on scaffold platform"
            description="Describe where the worker will be positioned"
            onChange={(text) => update({ work_position: text })}
          />

          <MultiSelect
            label="Access Method"
            options={WAH_ACCESS_METHODS}
            value={selectedAccess}
            disabled={disabled}
            description="Select all that apply"
            onChange={(items) => update({ access_method: items })}
          />

          {showAccessOther && (
            <TextField
              label="Other — specify"
              value={str(value.access_method_other)}
              disabled={disabled}
              onChange={(text) => update({ access_method_other: text })}
            />
          )}
        </FieldGroup>

        {/* Fall & Dropped Object Controls */}
        <FieldGroup
          title="Fall & Dropped Object Controls"
          icon={AlertTriangle}
          description="Identify fall and dropped object hazards"
        >
          <Choice
            label="Falling-object risk?"
            value={
              typeof value.falling_object_risk === 'boolean'
                ? value.falling_object_risk
                : null
            }
            disabled={disabled}
            onChange={(yes) => update({ falling_object_risk: yes })}
          />

          {value.falling_object_risk === true && (
            <TextAreaField
              label="Dropped-object controls *"
              value={str(value.dropped_object_controls)}
              disabled={disabled}
              placeholder="e.g. Tool lanyards, exclusion zone below"
              required
              onChange={(text) => update({ dropped_object_controls: text })}
            />
          )}
        </FieldGroup>

        {/* Rescue */}
        <FieldGroup
          title="Rescue Arrangements"
          icon={CheckCircle2}
          description="Rescue capability for work at height"
        >
          <Choice
            label="Rescue arrangement required?"
            value={
              typeof value.rescue_arrangement_required === 'boolean'
                ? value.rescue_arrangement_required
                : null
            }
            disabled={disabled}
            onChange={(yes) => update({ rescue_arrangement_required: yes })}
          />

          {value.rescue_arrangement_required === true && (
            <TextField
              label="Rescue arrangement / method"
              value={str(value.rescue_arrangement_method)}
              disabled={disabled}
              placeholder="e.g. Mobile elevating work platform for rescue"
              description="Describe the rescue arrangement"
              onChange={(text) => update({ rescue_arrangement_method: text })}
            />
          )}
        </FieldGroup>
      </div>
    )
  }

  if (code === 'ELEC') {
    const selectedTypes = strArr(value.work_type)
    const showTypeOther = selectedTypes.includes('Other')
    
    return (
      <div className="space-y-4">
        {/* Equipment */}
        <FieldGroup
          title="Equipment"
          icon={Zap}
          description="Identify the electrical equipment"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Equipment / Circuit"
              value={str(value.equipment_circuit)}
              disabled={disabled}
              required
              placeholder="e.g. MCC-2 feeder panel"
              onChange={(text) => update({ equipment_circuit: text })}
            />

            <TextField
              label="Equipment ID"
              value={str(value.equipment_id)}
              disabled={disabled}
              placeholder="e.g. MCC-2-F3"
              onChange={(text) => update({ equipment_id: text })}
            />

            <TextField
              label="Voltage"
              value={str(value.voltage)}
              disabled={disabled}
              placeholder="e.g. 415 V"
              onChange={(text) => update({ voltage: text })}
            />
          </div>
        </FieldGroup>

        {/* Work */}
        <FieldGroup
          title="Work Details"
          icon={Zap}
          description="What electrical work will be performed?"
        >
          <MultiSelect
            label="Work Type"
            options={ELEC_WORK_TYPES}
            value={selectedTypes}
            disabled={disabled}
            description="Select all that apply"
            onChange={(items) => update({ work_type: items })}
          />

          {showTypeOther && (
            <TextField
              label="Other — specify"
              value={str(value.work_type_other)}
              disabled={disabled}
              onChange={(text) => update({ work_type_other: text })}
            />
          )}
        </FieldGroup>

        {/* Isolation & Verification */}
        <FieldGroup
          title="Isolation & Verification"
          icon={CheckCircle2}
          description="Electrical isolation and testing"
        >
          <Choice
            label="Electrical isolation required?"
            value={
              typeof value.electrical_isolation_required === 'boolean'
                ? value.electrical_isolation_required
                : null
            }
            disabled={disabled}
            onChange={(yes) => update({ electrical_isolation_required: yes })}
          />

          <TripleChoice
            label="Electrical testing / verification completed"
            value={
              typeof value.test_verification_completed === 'string'
                ? value.test_verification_completed
                : null
            }
            disabled={disabled}
            onChange={(text) => update({ test_verification_completed: text })}
          />
        </FieldGroup>
      </div>
    )
  }

  return null
}
