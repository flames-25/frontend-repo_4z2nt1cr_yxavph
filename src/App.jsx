import React, { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import { auth, db, rtdb, storage, getFcmToken, onForegroundMessage, provider, ts } from './firebase'
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth'
import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { ref, onDisconnect, onValue, serverTimestamp as rtdbTs, set, update } from 'firebase/database'

const Avatar = ({ src, name, size = 40 }) => (
  <div className="flex items-center gap-2">
    <div
      className="rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full rounded-full object-cover" />
      ) : (
        <span className="font-semibold">{(name||'?').slice(0,1).toUpperCase()}</span>
      )}
    </div>
  </div>
)

const Button = ({ children, className = '', ...props }) => (
  <button {...props} className={`px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 ${className}`}>{children}</button>
)

const Input = ({ className = '', ...props }) => (
  <input {...props} className={`w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`} />
)

const Textarea = ({ className = '', ...props }) => (
  <textarea {...props} className={`w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`} />
)

function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      setLoading(false)
      if (u) {
        // presence
        const statusRef = ref(rtdb, `status/${u.uid}`)
        const isOfflineForRTDB = {
          state: 'offline',
          last_changed: rtdbTs(),
        }
        const isOnlineForRTDB = {
          state: 'online',
          last_changed: rtdbTs(),
        }
        const connRef = ref(rtdb, '.info/connected')
        onValue(connRef, (snap) => {
          if (snap.val() === false) return
          onDisconnect(statusRef).set(isOfflineForRTDB).then(() => {
            set(statusRef, isOnlineForRTDB)
          })
        })
        // FCM token
        try {
          const token = await getFcmToken()
          if (token) {
            await setDoc(doc(db, 'users', u.uid), { fcm: token }, { merge: true })
          }
        } catch {}
      }
    })
    return () => unsub()
  }, [])
  return { user, loading }
}

function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password)
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        if (name) await updateProfile(cred.user, { displayName: name })
        await setDoc(doc(db, 'users', cred.user.uid), {
          email,
          name: name || cred.user.email.split('@')[0],
          createdAt: serverTimestamp(),
        }, { merge: true })
      }
    } catch (e) {
      setError(e.message)
    }
  }

  const reset = async () => {
    if (!email) return setError('Enter your email first')
    try {
      await sendPasswordResetEmail(auth, email)
      setError('Password reset email sent')
    } catch (e) { setError(e.message) }
  }

  const google = async () => {
    try {
      await signInWithPopup(auth, provider)
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-fuchsia-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/80 backdrop-blur rounded-2xl shadow-xl p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">Welcome to Whisper</h1>
        <p className="text-center text-gray-500 mb-6">Secure, fast, and modern chat</p>
        <form onSubmit={submit} className="space-y-3">
          {!isLogin && (
            <Input placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
          )}
          <Input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <Input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <Button type="submit" className="w-full">{isLogin ? 'Log in' : 'Create account'}</Button>
        </form>
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <button onClick={()=>setIsLogin(!isLogin)} className="underline">{isLogin ? 'Create account' : 'Have an account? Log in'}</button>
          <button onClick={reset} className="underline">Forgot password?</button>
        </div>
        <div className="mt-4">
          <Button onClick={google} className="w-full bg-white border text-gray-800 hover:bg-gray-50 flex items-center justify-center gap-2">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" /> Continue with Google
          </Button>
        </div>
      </div>
    </div>
  )
}

function ChatList({ uid, onOpenChat }) {
  const [chats, setChats] = useState([])
  useEffect(() => {
    const q = query(collection(db, 'chats'), where('members', 'array-contains', uid), orderBy('updatedAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      const arr = []
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }))
      setChats(arr)
    })
    return () => unsub()
  }, [uid])
  return (
    <div className="space-y-2">
      {chats.map((c) => (
        <button key={c.id} onClick={()=>onOpenChat(c)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50">
          <Avatar name={c.isGroup ? c.name : 'Chat'} size={44} />
          <div className="flex-1 text-left">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-gray-800">{c.isGroup ? c.name : (c.title || 'Conversation')}</div>
              {c.unread?.[uid] > 0 && <span className="ml-2 bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full">{c.unread[uid]}</span>}
            </div>
            <div className="text-sm text-gray-500 truncate">{c.lastMessage || 'No messages yet'}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

function Composer({ onSend, onUpload, typingRef }) {
  const [text, setText] = useState('')
  useEffect(() => {
    if (!typingRef) return
    const t = setInterval(() => {
      set(typingRef, { typing: text.length > 0, at: rtdbTs() })
    }, 400)
    return () => clearInterval(t)
  }, [text, typingRef])
  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    onSend(text)
    setText('')
  }
  return (
    <form onSubmit={submit} className="flex items-end gap-2 p-2">
      <Textarea rows={1} value={text} onChange={e=>setText(e.target.value)} placeholder="Type a message" className="flex-1 resize-none" />
      <input type="file" onChange={(e)=>onUpload(e.target.files?.[0])} className="hidden" id="file-input" />
      <label htmlFor="file-input" className="px-3 py-2 rounded-lg border text-sm cursor-pointer">Attach</label>
      <Button type="submit">Send</Button>
    </form>
  )
}

function ChatView({ chat, uid }) {
  const [messages, setMessages] = useState([])
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const q = query(collection(db, 'chats', chat.id, 'messages'), orderBy('createdAt', 'asc'), limit(200))
    const unsub = onSnapshot(q, (snap) => {
      const arr = []
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }))
      setMessages(arr)
    })
    return () => unsub()
  }, [chat.id])

  useEffect(() => {
    // typing indicator
    const tr = ref(rtdb, `typing/${chat.id}/${uid}`)
    const other = ref(rtdb, `typing/${chat.id}`)
    const unsub = onValue(other, (snap) => {
      const data = snap.val() || {}
      const anyoneElseTyping = Object.entries(data).some(([k, v]) => k !== uid && v?.typing)
      setTyping(anyoneElseTyping)
    })
    return () => unsub()
  }, [chat.id, uid])

  const send = async (text) => {
    await addDoc(collection(db, 'chats', chat.id, 'messages'), {
      text,
      from: uid,
      status: 'sent',
      createdAt: serverTimestamp(),
      type: 'text',
    })
    await updateDoc(doc(db, 'chats', chat.id), {
      lastMessage: text,
      updatedAt: serverTimestamp(),
    })
  }

  const upload = async (file) => {
    if (!file) return
    const path = `uploads/${chat.id}/${Date.now()}-${file.name}`
    const refx = sRef(storage, path)
    await uploadBytes(refx, file)
    const url = await getDownloadURL(refx)
    await addDoc(collection(db, 'chats', chat.id, 'messages'), {
      from: uid,
      status: 'sent',
      createdAt: serverTimestamp(),
      type: 'media',
      url,
      name: file.name,
      mime: file.type,
      size: file.size,
    })
    await updateDoc(doc(db, 'chats', chat.id), {
      lastMessage: file.type.startsWith('image/') ? '📷 Photo' : '📎 Attachment',
      updatedAt: serverTimestamp(),
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((m) => (
          <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 ${m.from===uid?'bg-indigo-600 text-white ml-auto':'bg-white border'}`}>
            {m.type === 'text' ? (
              <div>{m.text}</div>
            ) : (
              <div className="space-y-1">
                {m.mime?.startsWith('image/') ? (
                  <img src={m.url} alt={m.name} className="rounded-lg max-h-64" />
                ) : (
                  <a href={m.url} target="_blank" className="underline">{m.name}</a>
                )}
              </div>
            )}
            <div className="text-[10px] opacity-70 mt-1">{m.status}</div>
          </div>
        ))}
        {typing && <div className="text-xs text-gray-500">Someone is typing...</div>}
      </div>
      <Composer onSend={send} onUpload={upload} typingRef={ref(rtdb, `typing/${chat.id}/${uid}`)} />
    </div>
  )
}

function Shell() {
  const { user, loading } = useAuth()
  const [active, setActive] = useState(null)
  const [creating, setCreating] = useState(false)

  const createChat = async (e) => {
    e.preventDefault()
    const form = new FormData(e.target)
    const name = form.get('name')
    const members = form.get('members').split(',').map(s=>s.trim()).filter(Boolean)
    const chatDoc = await addDoc(collection(db, 'chats'), {
      isGroup: members.length > 1,
      members: Array.from(new Set([user.uid, ...members])),
      name: name || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      unread: {},
    })
    setCreating(false)
    setActive({ id: chatDoc.id })
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  if (!user) return <AuthScreen />

  return (
    <div className="h-screen grid grid-rows-[auto,1fr] bg-gradient-to-br from-indigo-50 to-fuchsia-50">
      <header className="px-4 py-3 flex items-center justify-between bg-white/80 backdrop-blur border-b">
        <div className="flex items-center gap-3">
          <Avatar name={user.displayName || user.email} />
          <div>
            <div className="font-semibold text-gray-800">{user.displayName || user.email}</div>
            <div className="text-xs text-gray-500">Online</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={()=>setCreating(true)} className="bg-white border text-gray-800 hover:bg-gray-50">New Chat</Button>
          <Button onClick={()=>signOut(auth)} className="bg-rose-600 hover:bg-rose-700">Logout</Button>
        </div>
      </header>
      <main className="grid md:grid-cols-[360px,1fr] grid-cols-1 h-full">
        <aside className="border-r bg-white/60 p-3 overflow-y-auto">
          <ChatList uid={user.uid} onOpenChat={setActive} />
        </aside>
        <section className="bg-gradient-to-b from-white/60 to-white/20">
          {active ? (
            <ChatView chat={active} uid={user.uid} />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">Select a chat to start messaging</div>
          )}
        </section>
      </main>

      {creating && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-4 w-full max-w-md">
            <h3 className="font-semibold mb-2">Create chat</h3>
            <form onSubmit={createChat} className="space-y-3">
              <Input name="name" placeholder="Group name (optional)" />
              <Input name="members" placeholder="Participant UIDs (comma-separated)" />
              <div className="flex justify-end gap-2">
                <Button type="button" onClick={()=>setCreating(false)} className="bg-white border text-gray-800 hover:bg-gray-50">Cancel</Button>
                <Button type="submit">Create</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return <Shell />
}
