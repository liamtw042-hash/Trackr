import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const missing = Object.entries(cfg)
  .filter(([, v]) => !v)
  .map(([k]) => k)

if (missing.length) {
  console.error(
    `[firebase] Missing config: ${missing.join(', ')}. ` +
      'Copy .env.example to .env and fill in your Firebase project values.'
  )
}

const app = initializeApp(cfg)

export const auth = getAuth(app)
export const db = getFirestore(app)

export const COL = {
  users: 'users',
  trades: 'trades',
  holdings: 'holdings',
} as const
