'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function CompanyRegistrationPage() {
  const router = useRouter()
  const supabase = createClient()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [companyName, setCompanyName] = useState('')
  const [ssm, setSsm] = useState('')
  const [employeeNo, setEmployeeNo] = useState('')
  const [phone, setPhone] = useState('')
  const [department, setDepartment] = useState('')
  const [position, setPosition] = useState('')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [companyCode, setCompanyCode] = useState('')

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

    // 2. Create company + Safety Manager profile
    const {
      data: registrationData,
      error: registrationError,
    } = await supabase.rpc('register_company', {
      p_company_name: companyName.trim(),
      p_ssm: ssm.trim(),
      p_full_name: fullName.trim(),
      p_email: email.trim(),
      p_employee_no: employeeNo.trim() || null,
      p_phone: phone.trim() || null,
      p_department: department.trim() || null,
      p_job_position: position.trim() || null,
    })

    if (registrationError) {
      console.error(
        'Company registration failed:',
        registrationError
      )

      setError(
        registrationError.message ||
          'Unable to complete company registration.'
      )

      setLoading(false)
      return
    }

    console.log(
      'Company registration successful:',
      registrationData
    )

    // register_company returns a table row; extract the
    // generated company code from the first row.
    const code = registrationData?.[0]?.company_code

    if (!code) {
      console.error(
        'Company registration succeeded but no company code was returned:',
        registrationData
      )

      setError(
        'Registration succeeded but the company code could not be retrieved.'
      )

      setLoading(false)
      return
    }

    setCompanyCode(code)
    setLoading(false)
  }

  if (companyCode) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
        <div className="w-full max-w-2xl rounded-xl border bg-background p-8 shadow-sm">
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl font-bold text-green-700">
              ✓
            </div>

            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Company Registered
              </h1>

              <p className="mt-2 text-sm text-muted-foreground">
                Your company account has been created
                successfully.
              </p>
            </div>

            <div className="mx-auto w-full max-w-sm space-y-2 rounded-lg border border-green-600/30 bg-green-50 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-green-700">
                Company Code
              </p>

              <p className="text-2xl font-bold tracking-tight text-green-700">
                {companyCode}
              </p>

              <p className="text-sm text-green-800">
                This is your unique ePTW company code.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                router.push('/dashboard')
                router.refresh()
              }}
              className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Continue to Dashboard
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-2xl rounded-xl border bg-background p-8 shadow-sm">

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Register Your Company
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Create your company ePTW account. You will become
            the Safety Manager.
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
                Safety Manager Account
              </h2>

              <p className="text-sm text-muted-foreground">
                This account will be the primary administrator
                for your company ePTW system.
              </p>
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

              <div className="space-y-2">
                <label
                  htmlFor="employeeNo"
                  className="text-sm font-medium"
                >
                  Employee No.
                </label>

                <input
                  id="employeeNo"
                  value={employeeNo}
                  onChange={(event) =>
                    setEmployeeNo(event.target.value)
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

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

            </div>
          </section>

          {/* Company Information */}

          <section className="space-y-4">
            <div>
              <h2 className="font-semibold">
                Company Information
              </h2>

              <p className="text-sm text-muted-foreground">
                Your company code will be generated
                automatically.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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

              <div className="space-y-2">
                <label
                  htmlFor="ssm"
                  className="text-sm font-medium"
                >
                  SSM Registration No. *
                </label>

                <input
                  id="ssm"
                  value={ssm}
                  onChange={(event) =>
                    setSsm(event.target.value)
                  }
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </section>

          {/* Optional Information */}

          <section className="space-y-4">
            <div>
              <h2 className="font-semibold">
                Additional Information
              </h2>

              <p className="text-sm text-muted-foreground">
                Optional.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">

              <div className="space-y-2">
                <label
                  htmlFor="department"
                  className="text-sm font-medium"
                >
                  Department
                </label>

                <input
                  id="department"
                  value={department}
                  onChange={(event) =>
                    setDepartment(event.target.value)
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
              ? 'Creating company...'
              : 'Register Company'}
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
