"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface CollapsibleProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

const Collapsible = React.forwardRef<HTMLDivElement, CollapsibleProps>(
  ({ className, open: controlledOpen, defaultOpen = false, onOpenChange, children, ...props }, ref) => {
    const [internalOpen, setInternalOpen] = React.useState(defaultOpen)
    const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen

    const setOpen = React.useCallback(
      (newOpen: boolean) => {
        if (controlledOpen === undefined) {
          setInternalOpen(newOpen)
        }
        onOpenChange?.(newOpen)
      },
      [controlledOpen, onOpenChange]
    )

    return (
      <div ref={ref} className={cn("w-full", className)} {...props}>
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<any>, {
              isOpen,
              setOpen,
            })
          }
          return child
        })}
      </div>
    )
  }
)
Collapsible.displayName = "Collapsible"

interface CollapsibleTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isOpen?: boolean
  setOpen?: (open: boolean) => void
}

const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
  ({ className, isOpen, setOpen, children, onClick, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e)
      setOpen?.(!isOpen)
    }

    return (
      <button
        ref={ref}
        type="button"
        onClick={handleClick}
        aria-expanded={isOpen}
        className={cn("w-full", className)}
        {...props}
      >
        {children}
      </button>
    )
  }
)
CollapsibleTrigger.displayName = "CollapsibleTrigger"

interface CollapsibleContentProps extends React.HTMLAttributes<HTMLDivElement> {
  isOpen?: boolean
}

const CollapsibleContent = React.forwardRef<HTMLDivElement, CollapsibleContentProps>(
  ({ className, isOpen, children, ...props }, ref) => {
    // Keep the children mounted when collapsed (just hidden) so that stateful
    // section content — JHA/LOTO/gas-test/attachment records owned by the child
    // sections — is preserved instead of re-seeding from empty defaults on
    // every collapse/expand cycle.
    return (
      <div
        ref={ref}
        hidden={!isOpen}
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
CollapsibleContent.displayName = "CollapsibleContent"

export { Collapsible, CollapsibleTrigger, CollapsibleContent }