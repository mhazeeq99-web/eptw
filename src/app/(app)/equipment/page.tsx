import { EquipmentManager } from '@/components/company/equipment-manager'
import { BackButton } from '@/components/ui/back-button'
import { 
  Wrench, 
  Info,
  Package,
  Settings,
  Tag
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export default function EquipmentPage() {
  return (
    <>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="mb-6">
          <BackButton href="/settings" label="Back to Management" />
        </div>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-3 dark:bg-blue-900/50">
                <Wrench className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Equipment
                </h1>
                <p className="mt-1 text-muted-foreground">
                  Manage equipment and machinery for permits
                </p>
              </div>
            </div>
          </div>

          <Badge variant="secondary" className="self-start">
            <Package className="mr-1 h-3 w-3" />
            Equipment Registry
          </Badge>
        </div>

        {/* Info Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <InfoCard
            icon={<Tag className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
            title="Equipment Numbers"
            description="Assign unique equipment numbers for easy identification"
          />
          <InfoCard
            icon={<Settings className="h-5 w-5 text-purple-600 dark:text-purple-400" />}
            title="Configuration"
            description="Manage equipment details and specifications"
          />
          <InfoCard
            icon={<Wrench className="h-5 w-5 text-green-600 dark:text-green-400" />}
            title="Permit Integration"
            description="Link equipment to permits and work areas"
          />
        </div>

        {/* Info Notice */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              About Equipment Management
            </p>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              Register and manage equipment that can be associated with work permits. Each piece of equipment can be assigned a unique number and linked to specific areas.
            </p>
          </div>
        </div>

        {/* Main Content */}
        <Card>
          <CardContent className="p-6">
            <EquipmentManager />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function InfoCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-gray-100 p-2 dark:bg-gray-800">
            {icon}
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white">{title}</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}