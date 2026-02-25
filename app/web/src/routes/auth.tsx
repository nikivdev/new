import { createFileRoute } from "@tanstack/react-router"
import { Mail } from "lucide-react"
import { action, atom, effect, reatomBoolean } from "@/shared/reatom/core"
import { reatomComponent } from "@reatom/react"
import { authClient } from "@/lib/auth-client"

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  ssr: false,
})

type Step = "email" | "otp"

const stepAtom = atom<Step>('email', 'authStep')
const emailAtom = atom('', 'authEmail')
const otpAtom = atom('', 'authOtp')
const loadingAtom = reatomBoolean(false, 'authLoading')
const errorAtom = atom('', 'authError')
const emailInputRefAtom = atom<HTMLInputElement | null>(null, 'authEmailInput').extend(target => ({
  mutableRef: {
    set current(value: HTMLInputElement | null) {
      target.set(value)
    },
  },
}))
const otpInputRefAtom = atom<HTMLInputElement | null>(null, 'authOtpInput').extend(target => ({
  mutableRef: {
    set current(value: HTMLInputElement | null) {
      target.set(value)
    },
  },
}))

effect(() => {
  const step = stepAtom()
  if (step === 'email') {
    emailInputRefAtom()?.focus()
  } else {
    otpInputRefAtom()?.focus()
  }
}, 'authFocusEffect')

const sendOtp = action(async () => {
  if (!emailAtom().trim()) return

  loadingAtom.set(true)
  errorAtom.set('')

  try {
    const result = await authClient.emailOtp.sendVerificationOtp({
      email: emailAtom(),
      type: 'sign-in',
    })

    if (result.error) {
      errorAtom.set(result.error.message || 'Failed to send code')
    } else {
      stepAtom.set('otp')
    }
  } catch (err) {
    errorAtom.set(
      err instanceof Error ? err.message : 'Failed to send verification code',
    )
  } finally {
    loadingAtom.set(false)
  }
}, 'sendOtp')

const verifyOtp = action(async () => {
  if (!otpAtom().trim()) return

  loadingAtom.set(true)
  errorAtom.set('')

  try {
    const result = await authClient.signIn.emailOtp({
      email: emailAtom(),
      otp: otpAtom(),
    })

    if (result.error) {
      errorAtom.set(result.error.message || 'Invalid code')
    } else {
      window.location.href = '/'
    }
  } catch (err) {
    errorAtom.set(err instanceof Error ? err.message : 'Failed to verify code')
  } finally {
    loadingAtom.set(false)
  }
}, 'verifyOtp')

const resendOtp = action(async () => {
  loadingAtom.set(true)
  errorAtom.set('')
  otpAtom.set('')

  try {
    const result = await authClient.emailOtp.sendVerificationOtp({
      email: emailAtom(),
      type: 'sign-in',
    })

    if (result.error) {
      errorAtom.set(result.error.message || 'Failed to resend code')
    }
  } catch {
    errorAtom.set('Failed to resend code')
  } finally {
    loadingAtom.set(false)
  }
}, 'resendOtp')

const backToEmail = action(() => {
  stepAtom.set('email')
  otpAtom.set('')
  errorAtom.set('')
}, 'backToEmail')

const AuthPage = reatomComponent(() => {
  const step = stepAtom()
  const email = emailAtom()
  const otp = otpAtom()
  const isLoading = loadingAtom()
  const error = errorAtom()

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4 py-10 text-white">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-white/10 bg-black/70 px-8 py-10 shadow-[0_10px_40px_rgba(0,0,0,0.45)]">
          <header className="space-y-2 text-left">
            <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-white/40">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              Welcome to Starter App
            </span>
            <h1 className="text-3xl font-semibold tracking-tight">
              {step === 'email' ? 'Sign in to starter.app' : 'Enter your code'}
            </h1>
            <p className="text-sm text-white/70">
              {step === 'email'
                ? 'Multi-modal AI studio for text, images, and more.'
                : `We sent a 6-digit code to ${email}`}
            </p>
          </header>

          {step === 'email' ? (
            <form onSubmit={(event) => { event.preventDefault(); sendOtp() }} className="mt-8 space-y-5">
              <div className="space-y-2 text-left">
                <p className="text-sm font-medium text-white">
                  Enter your email and we'll send you a verification code.
                </p>
              </div>

              <label className="block text-left text-xs font-semibold uppercase tracking-wide text-white/60">
                Email
                <input
                  ref={emailInputRefAtom.mutableRef}
                  type="email"
                  placeholder="you@email.com"
                  required
                  value={email}
                  onChange={(e) => emailAtom.set(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-0"
                />
              </label>

              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !email.trim()}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? 'Sending code...' : 'Send verification code'}
              </button>
            </form>
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); verifyOtp() }} className="mt-8 space-y-5">
              <label className="block text-left text-xs font-semibold uppercase tracking-wide text-white/60">
                Verification Code
                <input
                  ref={otpInputRefAtom.mutableRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => otpAtom.set(e.target.value.replace(/\D/g, ''))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-0"
                />
              </label>

              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || otp.length !== 6}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? 'Verifying...' : 'Sign in'}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => backToEmail()}
                  className="text-white/60 hover:text-white transition"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => resendOtp()}
                  disabled={isLoading}
                  className="text-white/60 hover:text-white transition disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
})
