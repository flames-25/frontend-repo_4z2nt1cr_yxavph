// Firebase initialization and helpers
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, enableIndexedDbPersistence, serverTimestamp } from 'firebase/firestore'
import { getDatabase } from 'firebase/database'
import { getStorage } from 'firebase/storage'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'

// Prefer environment-based config so users can plug in their own Firebase project
// You can set these in a .env file (Vite):
// VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
// VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID, VITE_FIREBASE_MEASUREMENT_ID
const envCfg = {
  apiKey: import.meta?.env?.VITE_FIREBASE_API_KEY,
  authDomain: import.meta?.env?.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta?.env?.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta?.env?.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta?.env?.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta?.env?.VITE_FIREBASE_APP_ID,
  measurementId: import.meta?.env?.VITE_FIREBASE_MEASUREMENT_ID,
}

// Fallback to the default demo config if env vars are not provided
const defaultCfg = {
  apiKey: 'AIzaSyBuFedeWJQ98qZpcLEhwzv3iuo_gt4AYsw',
  authDomain: 'chat-767e2.firebaseapp.com',
  projectId: 'chat-767e2',
  // Fix storage bucket domain to the standard appspot.com host
  storageBucket: 'chat-767e2.appspot.com',
  messagingSenderId: '791673240575',
  appId: '1:791673240575:web:27cd7ae97e9bfc638745ca',
  measurementId: 'G-WSNH9Y5GK5',
}

const firebaseConfig = (envCfg.apiKey ? envCfg : defaultCfg)

// Validate minimal Auth configuration to prevent cryptic auth/configuration-not-found
function validateAuthConfig(cfg) {
  const missing = []
  if (!cfg.apiKey) missing.push('apiKey')
  if (!cfg.authDomain) missing.push('authDomain')
  if (!cfg.projectId) missing.push('projectId')
  if (missing.length) {
    console.error(
      'Firebase Auth configuration is incomplete. Missing:',
      missing.join(', '),
      '\nAdd Vite env vars (VITE_FIREBASE_*) or update firebase.js config.'
    )
  }
}

validateAuthConfig(firebaseConfig)

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const rtdb = getDatabase(app)
export const storage = getStorage(app)

// Enable offline persistence for Firestore
enableIndexedDbPersistence(db).catch(() => {})

export const provider = new GoogleAuthProvider()

// Messaging (FCM). Only initialize if supported (not in Safari private, SSR, etc.)
let messaging = null
let messagingReady = Promise.resolve(null)
if (typeof window !== 'undefined') {
  messagingReady = isSupported().then(async (supported) => {
    if (!supported) return null
    try {
      messaging = getMessaging(app)
      return messaging
    } catch (e) {
      return null
    }
  })
}

export const getFcmToken = async () => {
  const msg = await messagingReady
  if (!msg) return null
  try {
    const reg = await navigator.serviceWorker.ready.catch(() => null)
    if (!reg) return null
    const token = await getToken(msg, {
      // Provide your own public VAPID key via env if desired
      vapidKey: import.meta?.env?.VITE_FIREBASE_VAPID_KEY || 'BBWliuuXBaOleduiyRc7COMfem1BpBSaaxa4C-S-a4DTKqF5ZaerUCbmnOl2MQYwG_-8bW5_0WKh-SBH7MghG7k',
      serviceWorkerRegistration: reg,
    })
    return token
  } catch (e) {
    return null
  }
}

export const onForegroundMessage = async (cb) => {
  const msg = await messagingReady
  if (!msg) return () => {}
  return onMessage(msg, cb)
}

export const ts = serverTimestamp
