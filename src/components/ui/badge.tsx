import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
}

const variantStyles = {
  default: "bg-primary text-primary-foreground hover:bg-primary/80",
  secondary: "bg-muted text-foreground hover:bg-muted/70",
  destructive: "bg-destructive text-white hover:bg-destructive/90",
  outline: "border border-border text-foreground hover:bg-muted",
  success: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  )
}