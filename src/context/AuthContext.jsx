import { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, getDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase/config'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let profileUnsub = null

    const authUnsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)

      // Clean up any previous profile listener
      if (profileUnsub) { profileUnsub(); profileUnsub = null }

      if (firebaseUser) {
        // Real-time listener — updates whenever balance or any profile field changes
        profileUnsub = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (snap) => {
            setUserProfile(snap.exists() ? snap.data() : null)
            setLoading(false)
          },
          (err) => {
            console.error('Profile listener error:', err)
            setLoading(false)
          }
        )
      } else {
        setUserProfile(null)
        setLoading(false)
      }
    })

    return () => { authUnsub(); if (profileUnsub) profileUnsub() }
  }, [])

  async function signup(email, password, displayName) {
    const result = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(result.user, { displayName })
    return result
  }

  async function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password)
  }

  async function logout() {
    await signOut(auth)
    setUserProfile(null)
  }

  async function saveUserProfile(uid, profileData) {
    const docRef = doc(db, 'users', uid)
    const data = {
      ...profileData,
      updatedAt: serverTimestamp(),
    }
    await setDoc(docRef, data, { merge: true })
    setUserProfile((prev) => ({ ...prev, ...profileData }))
  }

  async function completeOnboarding(uid, onboardingData) {
    const docRef = doc(db, 'users', uid)
    const data = {
      ...onboardingData,
      onboardingComplete: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    await setDoc(docRef, data, { merge: true })
    setUserProfile(data)
  }

  const value = {
    user,
    userProfile,
    loading,
    signup,
    login,
    logout,
    saveUserProfile,
    completeOnboarding,
    refreshProfile: () => {}, // no-op — profile updates via real-time listener now
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
