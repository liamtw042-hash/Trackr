import { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase/config'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        await fetchUserProfile(firebaseUser.uid)
      } else {
        setUserProfile(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  async function fetchUserProfile(uid) {
    try {
      const docRef = doc(db, 'users', uid)
      const docSnap = await getDoc(docRef)
      if (docSnap.exists()) {
        setUserProfile(docSnap.data())
      } else {
        setUserProfile(null)
      }
    } catch (err) {
      console.error('Error fetching profile:', err)
      setUserProfile(null)
    }
  }

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
    refreshProfile: () => user && fetchUserProfile(user.uid),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
