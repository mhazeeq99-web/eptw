'use client'

import { FormEvent, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  Building2, 
  User, 
  Mail, 
  Lock, 
  Phone, 
  BadgeCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  Shield,
  Info,
  FileText,
  Users,
  Briefcase,
  Hash,
  Eye,
  EyeOff,
  Check
} from 'lucide-react'
import { cn } from '@/lib/utils'

export default function CompanyRegistrationPage() {
  const router = useRouter()
  const supabase = createClient()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [companyName, setCompanyName] = useState('')
  const [ssm, setSsm] = useState('')
  const [employeeNo, setEmployeeNo] = useState('')
  const [phone, setPhone] = useState('')
  const [department, setDepartment] = useState('')
  const [position, setPosition] = useState('')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [companyCode, setCompanyCode] = useState('')
  const [isDuplicateSsm, setIsDuplicateSsm] = useState(false)
  
  // Form validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function validateForm(): boolean {
    const errors: Record<string, string> = {}
    
    if (!fullName.trim()) {
      errors.fullName = 'Full name is required'
    }
    
    if (!email.trim()) {
      errors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address'
    }
    
    if (!password) {
      errors.password = 'Password is required'
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters'
    }
    
    if (!companyName.trim()) {
      errors.companyName = 'Company name is required'
    }
    
    if (!ssm.trim()) {
      errors.ssm = 'SSM registration number is required'
    }
    
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError('')
    setIsDuplicateSsm(false)
    setFieldErrors({})
    setLoading(true)

    // Validate form
    if (!validateForm()) {
      setLoading(false)
      return
    }

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

      const message =
        registrationError.message ||
        'Unable to complete company registration.'

      if (/already registered/i.test(message)) {
        setIsDuplicateSsm(true)
      } else {
        setError(message)
      }

      setLoading(false)
      return
    }

    console.log(
      'Company registration successful:',
      registrationData
    )

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

  if (isDuplicateSsm) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-amber-100/40 blur-3xl dark:bg-amber-900/20" />
        </div>

        <div className="relative w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-200/50 dark:border-gray-700 dark:bg-gray-900 dark:shadow-gray-900/50">
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
              <AlertCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>

            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                Company Already Registered
              </h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                This company is already registered with ePTW. Please sign in to access your account.
              </p>
            </div>

            <div className="mx-auto w-full max-w-sm space-y-3">
              <Link
                href="/login"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
              >
                Sign In
              </Link>

              <Link
                href="/forgot-password"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Forgot Password
              </Link>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400">
              Need help? Contact{' '}
              <a
                href="mailto:moviqueservices@gmail.com"
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                moviqueservices@gmail.com
              </a>
            </p>
          </div>
        </div>
      </main>
    )
  }

  if (companyCode) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-green-50 p-6 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-green-100/40 blur-3xl dark:bg-green-900/20" />
        </div>

        <div className="relative w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-200/50 dark:border-gray-700 dark:bg-gray-900 dark:shadow-gray-900/50">
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>

            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                Company Registered Successfully
              </h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Your company account has been created. Save your company code for future reference.
              </p>
            </div>

            <div className="mx-auto w-full max-w-sm space-y-3 rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-900/20">
              <p className="flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-wide text-green-700 dark:text-green-300">
                <BadgeCheck className="h-4 w-4" />
                Company Code
              </p>
              <p className="text-3xl font-bold tracking-tight text-green-700 dark:text-green-300">
                {companyCode}
              </p>
              <p className="text-sm text-green-700 dark:text-green-300">
                This is your unique ePTW company code
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                router.push('/dashboard')
                router.refresh()
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
            >
              <Check className="h-4 w-4" />
              Continue to Dashboard
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Background Decorative Elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-100/40 blur-3xl dark:bg-blue-900/20" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-indigo-100/40 blur-3xl dark:bg-indigo-900/20" />
      </div>

      <div className="relative w-full max-w-3xl">
        {/* Logo — brand mark switches with the theme (day/dark artwork). The
            product name is kept as a visually hidden h1 so the heading outline
            and SEO stay intact without duplicating the wordmark in the artwork. */}
        <div className="mb-6 flex items-center">
          <h1 className="sr-only">ePTW System — Register Your Company</h1>
          <Image
            src="/logo-day-mode.png"
            alt="ePTW"
            width={1458}
            height={1079}
            sizes="176px"
            priority
            className="h-32 w-auto rounded-xl object-contain dark:hidden"
          />
          <Image
            src="/logo-dark-mode.png"
            alt="ePTW"
            width={1458}
            height={1079}
            sizes="176px"
            loading="lazy"
            className="hidden h-32 w-auto rounded-xl object-contain dark:block"
          />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-200/50 dark:border-gray-700 dark:bg-gray-900 dark:shadow-gray-900/50">
          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
              Register Your Company
            </h2>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Create your company ePTW account. You will become the Safety Manager.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Account Information */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/50">
                  <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Safety Manager Account
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Primary administrator for your company
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="fullName" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <User className="h-4 w-4 text-gray-400" />
                    Full Name *
                  </label>
                  <input
                    id="fullName"
                    value={fullName}
                    onChange={(event) => {
                      setFullName(event.target.value)
                      setFieldErrors(prev => ({ ...prev, fullName: '' }))
                    }}
                    required
                    placeholder="e.g. Ahmad bin Ali"
                    className={cn(
                      "w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 dark:bg-gray-800 dark:text-gray-100",
                      fieldErrors.fullName
                        ? "border-red-500 focus:ring-2 focus:ring-red-500/20"
                        : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600"
                    )}
                  />
                  {fieldErrors.fullName && (
                    <p className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                      <AlertCircle className="h-3 w-3" />
                      {fieldErrors.fullName}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Mail className="h-4 w-4 text-gray-400" />
                    Email *
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      setFieldErrors(prev => ({ ...prev, email: '' }))
                    }}
                    required
                    placeholder="name@company.com"
                    className={cn(
                      "w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 dark:bg-gray-800 dark:text-gray-100",
                      fieldErrors.email
                        ? "border-red-500 focus:ring-2 focus:ring-red-500/20"
                        : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600"
                    )}
                  />
                  {fieldErrors.email && (
                    <p className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                      <AlertCircle className="h-3 w-3" />
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Lock className="h-4 w-4 text-gray-400" />
                    Password *
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value)
                        setFieldErrors(prev => ({ ...prev, password: '' }))
                      }}
                      minLength={8}
                      required
                      placeholder="Minimum 6 characters"
                      className={cn(
                        "w-full rounded-lg border bg-white px-3 py-2.5 pr-10 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 dark:bg-gray-800 dark:text-gray-100",
                        fieldErrors.password
                          ? "border-red-500 focus:ring-2 focus:ring-red-500/20"
                          : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                      <AlertCircle className="h-3 w-3" />
                      {fieldErrors.password}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="employeeNo" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Hash className="h-4 w-4 text-gray-400" />
                    Employee No.
                  </label>
                  <input
                    id="employeeNo"
                    value={employeeNo}
                    onChange={(event) => setEmployeeNo(event.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="phone" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Phone className="h-4 w-4 text-gray-400" />
                    Phone
                  </label>
                  <input
                    id="phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              </div>
            </section>

            {/* Company Information */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/50">
                  <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Company Information
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Your company code will be generated automatically
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="companyName" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Building2 className="h-4 w-4 text-gray-400" />
                    Company Name *
                  </label>
                  <input
                    id="companyName"
                    value={companyName}
                    onChange={(event) => {
                      setCompanyName(event.target.value)
                      setFieldErrors(prev => ({ ...prev, companyName: '' }))
                    }}
                    required
                    placeholder="e.g. Movique Services Sdn Bhd"
                    className={cn(
                      "w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 dark:bg-gray-800 dark:text-gray-100",
                      fieldErrors.companyName
                        ? "border-red-500 focus:ring-2 focus:ring-red-500/20"
                        : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600"
                    )}
                  />
                  {fieldErrors.companyName && (
                    <p className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                      <AlertCircle className="h-3 w-3" />
                      {fieldErrors.companyName}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="ssm" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <FileText className="h-4 w-4 text-gray-400" />
                    SSM Registration No. *
                  </label>
                  <input
                    id="ssm"
                    value={ssm}
                    onChange={(event) => {
                      setSsm(event.target.value)
                      setFieldErrors(prev => ({ ...prev, ssm: '' }))
                    }}
                    required
                    placeholder="e.g. 1234567-X"
                    className={cn(
                      "w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 dark:bg-gray-800 dark:text-gray-100",
                      fieldErrors.ssm
                        ? "border-red-500 focus:ring-2 focus:ring-red-500/20"
                        : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600"
                    )}
                  />
                  {fieldErrors.ssm && (
                    <p className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                      <AlertCircle className="h-3 w-3" />
                      {fieldErrors.ssm}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Additional Information */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/50">
                  <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Additional Information
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Optional details about your role
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="department" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Briefcase className="h-4 w-4 text-gray-400" />
                    Department
                  </label>
                  <input
                    id="department"
                    value={department}
                    onChange={(event) => setDepartment(event.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="position" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Briefcase className="h-4 w-4 text-gray-400" />
                    Position
                  </label>
                  <input
                    id="position"
                    value={position}
                    onChange={(event) => setPosition(event.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              </div>
            </section>

            {error && (
              <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-blue-600/20 transition-all",
                "hover:bg-blue-700 hover:shadow-blue-700/30",
                "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating company...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Register Company
                </>
              )}
            </button>

            <p className="text-center text-sm text-gray-600 dark:text-gray-400">
              Already have an account?{' '}
              <Link
                href="/login"
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  )
}