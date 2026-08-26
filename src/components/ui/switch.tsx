'use client'

/**
 * Accessible toggle switch. A button with role="switch" that reflects a
 * boolean state; the knob slides and the track changes colour.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
}: {
  checked: boolean
  onCheckedChange: (value: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-input'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
