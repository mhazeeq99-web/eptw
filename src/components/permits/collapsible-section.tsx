"use client"

import { useState } from "react"
import { ChevronUp, ChevronDown, Activity } from 'lucide-react'
import { Card, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

export function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <Card className="mt-6">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between p-6 hover:bg-gray-50 dark:hover:bg-gray-800">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            {title}
          </CardTitle>
          {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </CollapsibleTrigger>
        <CollapsibleContent className="px-6 pb-6">
          {children}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}