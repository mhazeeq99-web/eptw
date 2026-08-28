"use client"

import { useState } from "react"
import { ChevronUp, ChevronDown, Activity } from 'lucide-react'
import { Card, CardTitle, CardDescription } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
  title: string
  description?: string
  icon?: any
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
  badge?: React.ReactNode
}

export function CollapsibleSection({ 
  title, 
  description,
  icon: Icon = Activity,
  defaultOpen = true,
  children,
  className,
  badge
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <Card className={cn("transition-all", className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between p-6 hover:bg-gray-50 dark:hover:bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/50">
              <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                {title}
                {badge}
              </CardTitle>
              {description && (
                <CardDescription className="mt-1">
                  {description}
                </CardDescription>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOpen ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-6 pb-6">
          {children}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}