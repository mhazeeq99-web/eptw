/** NULL numeric limits mean unlimited. */
export function formatLimit(value: number | null): string {
  return value == null ? 'Unlimited' : String(value)
}

export function formatPrice(
  price: number,
  currency: string
): string {
  return `${currency} ${price.toLocaleString('en-MY')}`
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`
  }
  return `${bytes} B`
}
