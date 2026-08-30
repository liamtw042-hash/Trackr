import {
  createContext, useContext, useEffect, useState, useCallback, type ReactNode,
} from 'react'
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, type User,
} from 'firebase/auth'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, COL } from '@/lib/firebase'
import type { UserProfile } from '@/types'

interface AuthValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  saveProfile: (patch: Partial<UserProfile>) => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

/** Sensible defaults so a fresh account renders rather than showing nulls. */
const DEFAULT_PROFILE: UserProfile = {
  displayName: 'Trader',
  accountBalance: 0,
  startingBalance: 0,
  defaultRisk: 1,
  strategy: '',
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let profileUnsub: (() => void) | null = null

    const authUnsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser)

      profileUnsub?.()
      profileUnsub = null

      if (!fbUser) {
        setProfile(null)
        setLoading(false)
        return
      }

      // Live listener rather than a one-shot read: the account balance moves
      // whenever a trade closes, and the sidebar has to follow it.
      profileUnsub = onSnapshot(
        doc(db, COL.users, fbUser.uid),
        (snap) => {
          setProfile(
            snap.exists()
              ? { ...DEFAULT_PROFILE, ...(snap.data() as Partial<UserProfile>) }
              : { ...DEFAULT_PROFILE, displayName: fbUser.displayName ?? 'Trader' }
          )
          setLoading(false)
        },
        (err) => {
          console.error('[auth] profile listener:', err)
          setProfile({ ...DEFAULT_PROFILE })
          setLoading(false)
        }
      )
    })

    return () => {
      authUnsub()
      profileUnsub?.()
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }, [])

  const logout = useCallback(async () => {
    await signOut(auth)
    setProfile(null)
  }, [])

  const saveProfile = useCallback(
    async (patch: Partial<UserProfile>) => {
      if (!user) throw new Error('Not signed in')
      await setDoc(
        doc(db, COL.users, user.uid),
        { ...patch, updatedAt: serverTimestamp() },
        { merge: true }
      )
    },
    [user]
  )

  return (
    <Ctx.Provider value={{ user, profile, loading, login, logout, saveProfile }}>
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
