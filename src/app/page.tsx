import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-md rounded-xl border bg-background p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            ePTW
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Electronic Permit to Work
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/register/company"
            className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Register Your Company
          </Link>

          <Link
            href="/register/contractor"
            className="flex w-full items-center justify-center rounded-md border px-4 py-3 text-sm font-medium hover:bg-muted"
          >
            Register as Contractor
          </Link>

          <Link
            href="/login"
            className="flex w-full items-center justify-center rounded-md border px-4 py-3 text-sm font-medium hover:bg-muted"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  )
}