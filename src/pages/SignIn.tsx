import { useState, type FormEvent } from 'react'
import { FirebaseError } from 'firebase/app'
import { useAuth } from '@/store/AuthContext'
import { Field, Input, Spinner } from '@/components/ui/Primitives'

/**
 * Sign-in only. This is a single-user tool — there is deliberately no
 * registration flow, no password reset, no marketing. The account is created
 * once in the Firebase console; see the README.
 */
export function SignIn() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email.trim(), password)
    } catch (err) {
      // Firebase returns opaque codes; translate the ones worth distinguishing.
      const code = err instanceof FirebaseError ? err.code : ''
      setError(
        code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found'
          ? 'Wrong email or password'
          : code === 'auth/too-many-requests'
            ? 'Too many attempts — wait a minute and try again'
            : code === 'auth/network-request-failed'
              ? 'No connection to Firebase'
              : code === 'auth/invalid-api-key' || code === 'auth/api-key-not-valid'
                ? 'Firebase keys are missing or wrong — check your .env'
                : 'Could not sign in'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xs">
        <div className="flex items-center gap-2 mb-6">
          <svg className="w-4 h-4 text-brass" viewBox="0 0 16 16" fill="none">
            <path d="M1 12.5L4.5 7L8 9.5L11 3.5L15 6" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="square" />
          </svg>
          <span className="font-semibold text-ink-50 tracking-tight">Trackr</span>
        </div>

        <form onSubmit={submit} className="panel">
          <div className="panel-body space-y-3">
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                autoFocus
              />
            </Field>
            <Field label="Password" error={error}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? <><Spinner /> Signing in…</> : 'Sign in'}
            </button>
          </div>
        </form>

        <p className="hint mt-3 leading-relaxed">
          Single-user tool — no registration. Create the account once under
          Authentication in the Firebase console.
        </p>
      </div>
    </div>
  )
}
