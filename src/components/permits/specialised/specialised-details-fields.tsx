'use client'

import {
  HOT_WORK_TYPES,
  WAH_ACCESS_METHODS,
  ELEC_WORK_TYPES,
} from '@/lib/specialised-permit'

export type SpecialDetailsState = Record<string, unknown>

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
    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border"
      />
      {label}
    </label>
  )
}

function Choice({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: boolean | null
  onChange: (value: boolean | null) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <span className="mr-1">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(true)}
        className={`rounded-md border px-3 py-1 text-xs font-medium ${
          value === true
            ? 'border-primary bg-primary text-primary-foreground'
            : 'hover:bg-muted'
        }`}
      >
        Yes
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(false)}
        className={`rounded-md border px-3 py-1 text-xs font-medium ${
          value === false
            ? 'border-primary bg-primary text-primary-foreground'
            : 'hover:bg-muted'
        }`}
      >
        No
      </button>
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
    <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <span className="mr-1">{label}</span>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option)}
          className={`rounded-md border px-3 py-1 text-xs font-medium ${
            value === option
              ? 'border-primary bg-primary text-primary-foreground'
              : 'hover:bg-muted'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function MultiSelect({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string
  options: readonly string[]
  value: string[] | undefined
  onChange: (value: string[]) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
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
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                checked
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              {checked ? '✓ ' : ''}
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
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
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
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <textarea
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        rows={2}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
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
    return (
      <section className={embedded ? 'p-6' : 'rounded-xl border bg-background p-6'}>
        <h2 className="text-lg font-semibold">Hot Work Details</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Permit-specific hot-work information. Fire watch, fire
          extinguisher and spark-containment controls reuse the existing
          safety-control configuration for this permit type.
        </p>

        <div className="mt-6 space-y-5">
          <MultiSelect
            label="Hot Work Type"
            options={HOT_WORK_TYPES}
            value={strArr(value.hot_work_type)}
            disabled={disabled}
            onChange={(items) => update({ hot_work_type: items })}
          />

          {(strArr(value.hot_work_type).includes('Other') ||
            !value.hot_work_type) && (
            <TextField
              label="Other — specify"
              value={str(value.hot_work_type_other)}
              disabled={disabled}
              onChange={(text) =>
                update({ hot_work_type_other: text })
              }
            />
          )}

          <TextField
            label="Hot Work Area"
            value={str(value.hot_work_area)}
            disabled={disabled}
            placeholder="e.g. Tank farm south area"
            onChange={(text) => update({ hot_work_area: text })}
          />

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
              label="Combustible materials"
              value={str(value.combustible_materials)}
              disabled={disabled}
              placeholder="List the combustible materials..."
              onChange={(text) =>
                update({ combustible_materials: text })
              }
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
            onChange={(yes) =>
              update({ nearby_openings_drains: yes })
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Choice
              label="Spark / slag containment"
              value={
                typeof value.spark_containment_required === 'boolean'
                  ? value.spark_containment_required
                  : null
              }
              disabled={disabled}
              onChange={(yes) =>
                update({ spark_containment_required: yes })
              }
            />

            <Choice
              label="Fire Watch"
              value={
                typeof value.fire_watch_required === 'boolean'
                  ? value.fire_watch_required
                  : null
              }
              disabled={disabled}
              onChange={(yes) =>
                update({ fire_watch_required: yes })
              }
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
            onChange={(yes) =>
              update({ fire_extinguisher_available: yes })
            }
          />

          <div className="space-y-2">
            <p className="text-sm font-medium">Area preparation</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                'Combustible materials removed',
                'Combustible materials protected',
                'Area inspected',
              ].map((label) => {
                const checked = strArr(
                  value.area_preparation
                ).includes(label)
                return (
                  <Checkbox
                    key={label}
                    label={label}
                    checked={checked}
                    disabled={disabled}
                    onChange={(next) => {
                      const items = new Set(
                        strArr(value.area_preparation)
                      )
                      if (next) items.add(label)
                      else items.delete(label)
                      update({ area_preparation: [...items] })
                    }}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (code === 'CSE') {
    return (
      <section className={embedded ? 'p-6' : 'rounded-xl border bg-background p-6'}>
        <h2 className="text-lg font-semibold">Confined Space Details</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Permit-specific confined-space information. Gas testing, LOTO, JHA,
          PPE, site verification and rescue arrangements reuse the existing
          safety modules — nothing is duplicated here.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
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
            onChange={(text) => update({ access_egress_method: text })}
          />

          <TextField
            label="Approximate Entry Depth (optional)"
            value={str(value.entry_depth)}
            disabled={disabled}
            placeholder="e.g. 3 m"
            onChange={(text) => update({ entry_depth: text })}
          />

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
            onChange={(text) =>
              update({ continuous_ventilation: text })
            }
          />
        </div>
      </section>
    )
  }

  if (code === 'WAH') {
    return (
      <section className={embedded ? 'p-6' : 'rounded-xl border bg-background p-6'}>
        <h2 className="text-lg font-semibold">Work at Height Details</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Permit-specific work-at-height information. Fall-protection PPE and
          controls reuse the existing PPE / safety-control configuration.
        </p>

        <div className="mt-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
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

          <MultiSelect
            label="Access Method"
            options={WAH_ACCESS_METHODS}
            value={strArr(value.access_method)}
            disabled={disabled}
            onChange={(items) => update({ access_method: items })}
          />

          {(strArr(value.access_method).includes('Other') ||
            !value.access_method) && (
            <TextField
              label="Other — specify"
              value={str(value.access_method_other)}
              disabled={disabled}
              onChange={(text) =>
                update({ access_method_other: text })
              }
            />
          )}

          <TextField
            label="Work Position"
            value={str(value.work_position)}
            disabled={disabled}
            placeholder="e.g. Standing on scaffold platform"
            onChange={(text) => update({ work_position: text })}
          />

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

          <TextAreaField
            label="Dropped-object controls"
            value={str(value.dropped_object_controls)}
            disabled={disabled}
            placeholder="e.g. Tool lanyards, exclusion zone below"
            onChange={(text) => update({ dropped_object_controls: text })}
          />

          <Choice
            label="Rescue arrangement"
            value={
              typeof value.rescue_arrangement_required === 'boolean'
                ? value.rescue_arrangement_required
                : null
            }
            disabled={disabled}
            onChange={(yes) =>
              update({ rescue_arrangement_required: yes })
            }
          />
        </div>
      </section>
    )
  }

  if (code === 'ELEC') {
    return (
      <section className={embedded ? 'p-6' : 'rounded-xl border bg-background p-6'}>
        <h2 className="text-lg font-semibold">Electrical Work Details</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Permit-specific electrical-work information. Electrical isolation,
          LOTO and electrical PPE reuse the existing safety modules.
        </p>

        <div className="mt-6 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
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

          <MultiSelect
            label="Work Type"
            options={ELEC_WORK_TYPES}
            value={strArr(value.work_type)}
            disabled={disabled}
            onChange={(items) => update({ work_type: items })}
          />

          {(strArr(value.work_type).includes('Other') ||
            !value.work_type) && (
            <TextField
              label="Other — specify"
              value={str(value.work_type_other)}
              disabled={disabled}
              onChange={(text) => update({ work_type_other: text })}
            />
          )}

          <Choice
            label="Electrical isolation required?"
            value={
              typeof value.electrical_isolation_required === 'boolean'
                ? value.electrical_isolation_required
                : null
            }
            disabled={disabled}
            onChange={(yes) =>
              update({ electrical_isolation_required: yes })
            }
          />

          <TripleChoice
            label="Test / verification completed"
            value={
              typeof value.test_verification_completed === 'string'
                ? value.test_verification_completed
                : null
            }
            disabled={disabled}
            onChange={(text) =>
              update({ test_verification_completed: text })
            }
          />
        </div>
      </section>
    )
  }

  return null
}
