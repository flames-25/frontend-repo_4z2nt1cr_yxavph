// Firebase initialization and helpers
import { initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, enableIndexedDbPersistence, serverTimestamp } from 'firebase/firestore'
import { getDatabase } from 'firebase/database'
import { getStorage } from 'firebase/storage'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: 'AIzaSyBuFedeWJQ98qZpcLEhwzv3iuo_gt4AYsw',
  authDomain: 'chat-767e2.firebaseapp.com',
  projectId: 'chat-767e2',
  storageBucket: 'chat-767e2.firebasestorage.app',
  messagingSenderId: '791673240575',
  appId: '1:791673240575:web:27cd7ae97e9bfc638745ca',
  measurementId: 'G-WSNH9Y5GK5',
}

const app = initializeApp(firebaseConfig)

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
    const token = await getToken(msg, {
      vapidKey: 'BBWliuuXBaOleduiyRc7COMfem1BpBSaaxa4C-S-a4DTKqF5ZaerUCbmnOl2MQYwG_-8bW5_0WKh-SBH7MghG7k',
      serviceWorkerRegistration: await navigator.serviceWorker.ready,
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
