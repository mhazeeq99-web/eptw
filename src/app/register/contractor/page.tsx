'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ContractorRegistrationPage() {
  const router = useRouter()
  const supabase = createClient()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [phone, setPhone] = useState('')
  const [position, setPosition] = useState('')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError('')
    setLoading(true)

    // 1. Create Supabase Auth account
    const {
      data: signUpData,
      error: signUpError,
    } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    if (!signUpData.user) {
      setError('Unable to create your account.')
      setLoading(false)
      return
    }

    // 2. Create contractor + requester profile + membership
    const {
      data: registrationData,
      error: registrationError,
    } = await supabase.rpc('register_contractor', {
      p_company_name: companyName.trim(),
      p_full_name: fullName.trim(),
      p_email: email.trim(),
      p_phone: phone.trim() || null,
      p_position: position.trim() || null,
    })

    if (registrationError) {
      console.error(
        'Contractor registration failed:',
        registrationError
      )

      setError(
        registrationError.message ||
          'Unable to complete contractor registration.'
      )

      setLoading(false)
      return
    }

    console.log(
      'Contractor registration successful:',
      registrationData
    )

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-2xl rounded-xl border bg-background p-8 shadow-sm">

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Register as Contractor
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Create your contractor account. You will be able to
            submit permits for customer companies that authorize
            your contractor company.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-8"
        >

          {/* Account Information */}
          <section className="space-y-4">
            <div>
              <h2 className="font-semibold">
                Account Information
              </h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">

              <div className="space-y-2 sm:col-span-2">
                <label
                  htmlFor="fullName"
                  className="text-sm font-medium"
                >
                  Full Name *
                </label>

                <input
                  id="fullName"
                  value={fullName}
                  onChange={(event) =>
                    setFullName(event.target.value)
                  }
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium"
                >
                  Email *
                </label>

                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium"
                >
                  Password *
                </label>

                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  minLength={6}
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

            </div>
          </section>

          {/* Contractor Information */}
          <section className="space-y-4">
            <div>
              <h2 className="font-semibold">
                Contractor Company
              </h2>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="companyName"
                className="text-sm font-medium"
              >
                Company Name *
              </label>

              <input
                id="companyName"
                value={companyName}
                onChange={(event) =>
                  setCompanyName(event.target.value)
                }
                required
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="phone"
                  className="text-sm font-medium"
                >
                  Phone
                </label>

                <input
                  id="phone"
                  value={phone}
                  onChange={(event) =>
                    setPhone(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="position"
                  className="text-sm font-medium"
                >
                  Position
                </label>

                <input
                  id="position"
                  value={position}
                  onChange={(event) =>
                    setPosition(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </section>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? 'Creating account...'
              : 'Register Contractor'}
          </button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <a
              href="/login"
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </a>
          </p>

        </form>
      </div>
    </main>
  )
}
