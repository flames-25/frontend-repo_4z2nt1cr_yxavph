import React, { useEffect, useMemo, useRef, useState } from 'react'
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
import {
  ensureUserKeypair,
  importUserPublicKey,
  generateChatKey,
  exportAesKeyRaw,
  importAesKeyRaw,
  encryptForUserPublic,
  decryptWithPrivate,
  aesEncrypt,
  aesDecrypt,
} from './crypto'

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
        // E2EE keys
        try {
          const { pubJwk } = await ensureUserKeypair()
          await setDoc(doc(db, 'users', u.uid), { pub: pubJwk, name: u.displayName || u.email.split('@')[0] }, { merge: true })
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
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">Welcome to Chat</h1>
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
  const [qText, setQText] = useState('')
  useEffect(() => {
    const qy = query(collection(db, 'chats'), where('members', 'array-contains', uid), orderBy('updatedAt', 'desc'))
    const unsub = onSnapshot(qy, (snap) => {
      const arr = []
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }))
      setChats(arr)
    })
    return () => unsub()
  }, [uid])
  const filtered = useMemo(() => {
    if (!qText) return chats
    return chats.filter(c => (c.name || c.title || 'Conversation').toLowerCase().includes(qText.toLowerCase()) || (c.lastMessage||'').toLowerCase().includes(qText.toLowerCase()))
  }, [chats, qText])
  return (
    <div className="space-y-2">
      <div className="p-2"><Input placeholder="Search chats" value={qText} onChange={e=>setQText(e.target.value)} /></div>
      {filtered.map((c) => (
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
  const [search, setSearch] = useState('')
  const [chatDoc, setChatDoc] = useState(null)
  const [aesKey, setAesKey] = useState(null)
  const privKeyRef = useRef(null)

  // Load chat doc
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'chats', chat.id), async (d) => {
      const data = d.data()
      setChatDoc({ id: d.id, ...data })
      // Resolve AES key using user private key
      try {
        // ensure private key
        const { privateKey } = await ensureUserKeypair()
        privKeyRef.current = privateKey
        const encB64 = data?.keyring?.[uid]
        if (encB64) {
          const encBuf = Uint8Array.from(atob(encB64), c => c.charCodeAt(0)).buffer
          const raw = await decryptWithPrivate(privateKey, encBuf)
          const key = await importAesKeyRaw(raw)
          setAesKey(key)
        }
      } catch {}
    })
    return () => unsub()
  }, [chat.id, uid])

  // Messages listener
  useEffect(() => {
    const qy = query(collection(db, 'chats', chat.id, 'messages'), orderBy('createdAt', 'asc'), limit(500))
    const unsub = onSnapshot(qy, async (snap) => {
      const arr = []
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }))
      setMessages(arr)
    })
    return () => unsub()
  }, [chat.id])

  // typing indicator
  useEffect(() => {
    const other = ref(rtdb, `typing/${chat.id}`)
    const unsub = onValue(other, (snap) => {
      const data = snap.val() || {}
      const anyoneElseTyping = Object.entries(data).some(([k, v]) => k !== uid && v?.typing)
      setTyping(anyoneElseTyping)
    })
    return () => unsub()
  }, [chat.id, uid])

  // Delivered when received; Read when view is active
  useEffect(() => {
    const doStatus = async () => {
      const batch = []
      for (const m of messages) {
        if (m.from !== uid && m.status !== 'delivered' && m.status !== 'read') {
          batch.push(updateDoc(doc(db, 'chats', chat.id, 'messages', m.id), { status: 'delivered' }))
        }
      }
      if (batch.length) await Promise.allSettled(batch)
      // mark read
      const readBatch = []
      for (const m of messages) {
        if (m.from !== uid && m.status !== 'read') {
          readBatch.push(updateDoc(doc(db, 'chats', chat.id, 'messages', m.id), { status: 'read' }))
        }
      }
      if (readBatch.length) await Promise.allSettled(readBatch)
      // reset unread counter for me
      await updateDoc(doc(db, 'chats', chat.id), { [`unread.${uid}`]: 0 })
    }
    if (messages.length) doStatus()
  }, [messages, chat.id, uid])

  const send = async (text) => {
    let payload = { from: uid, status: 'sent', createdAt: serverTimestamp(), type: 'text' }
    if (aesKey) {
      const enc = await aesEncrypt(aesKey, text)
      payload = { ...payload, enc }
    } else {
      payload = { ...payload, text }
    }
    await addDoc(collection(db, 'chats', chat.id, 'messages'), payload)
    await updateDoc(doc(db, 'chats', chat.id), {
      lastMessage: text,
      updatedAt: serverTimestamp(),
      [`unread.${uid}`]: 0,
    })
  }

  const upload = async (file) => {
    if (!file) return
    const path = `uploads/${chat.id}/${Date.now()}-${file.name}`
    const refx = sRef(storage, path)
    await uploadBytes(refx, file)
    const url = await getDownloadURL(refx)
    const textLabel = file.type.startsWith('image/') ? '📷 Photo' : '📎 Attachment'
    const payload = {
      from: uid,
      status: 'sent',
      createdAt: serverTimestamp(),
      type: 'media',
      url,
      name: file.name,
      mime: file.type,
      size: file.size,
    }
    await addDoc(collection(db, 'chats', chat.id, 'messages'), payload)
    await updateDoc(doc(db, 'chats', chat.id), {
      lastMessage: textLabel,
      updatedAt: serverTimestamp(),
      [`unread.${uid}`]: 0,
    })
  }

  const shown = useMemo(() => {
    if (!search) return messages
    return messages.filter(m => {
      const txt = m.enc ? '[encrypted]' : (m.text || m.name || '')
      return (txt + ' ' + (m.mime||'')).toLowerCase().includes(search.toLowerCase())
    })
  }, [messages, search])

  const renderText = (m) => {
    if (m.type !== 'text') return null
    if (m.enc && aesKey) {
      return <DecryptText enc={m.enc} aesKey={aesKey} />
    }
    return <div>{m.text}</div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b bg-white/70">
        <Input placeholder="Search in chat" value={search} onChange={e=>setSearch(e.target.value)} />
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {shown.map((m) => (
          <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 ${m.from===uid?'bg-indigo-600 text-white ml-auto':'bg-white border'}`}>
            {m.type === 'text' ? (
              renderText(m)
            ) : (
              <div className="space-y-1">
                {m.mime?.startsWith('image/') ? (
                  <img src={m.url} alt={m.name} className="rounded-lg max-h-64" />
                ) : (
                  <a href={m.url} target="_blank" className="underline" rel="noreferrer">{m.name}</a>
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

function DecryptText({ enc, aesKey }) {
  const [txt, setTxt] = useState('')
  useEffect(() => {
    let mounted = true
    const run = async () => {
      try {
        const dec = await aesDecrypt(aesKey, enc.ct, enc.iv)
        if (mounted) setTxt(dec)
      } catch {
        if (mounted) setTxt('[unable to decrypt]')
      }
    }
    run()
    return () => { mounted = false }
  }, [enc, aesKey])
  return <div>{txt || '...'}</div>
}

function Contacts({ uid, onOpenChat }) {
  const [contacts, setContacts] = useState([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  // load contacts
  useEffect(() => {
    const sub = onSnapshot(collection(db, 'users', uid, 'contacts'), async (snap) => {
      const arr = []
      for (const d of snap.docs) {
        const cUid = d.id
        const u = await getDoc(doc(db, 'users', cUid))
        if (u.exists()) arr.push({ uid: cUid, ...(u.data()) })
      }
      setContacts(arr)
    })
    return () => sub()
  }, [uid])

  const addByEmail = async () => {
    if (!email) return
    setLoading(true)
    try {
      const qy = query(collection(db, 'users'), where('email', '==', email))
      const res = await getDocs(qy)
      if (res.empty) {
        alert('No user with that email')
      } else {
        const u = res.docs[0]
        if (u.id === uid) {
          alert("That's you")
        } else {
          await setDoc(doc(db, 'users', uid, 'contacts', u.id), { createdAt: serverTimestamp() })
          setEmail('')
        }
      }
    } finally { setLoading(false) }
  }

  const startChat = async (toUid) => {
    // find existing 1:1 chat
    const qy = query(collection(db, 'chats'), where('isGroup', '==', false), where('members', 'array-contains', uid))
    const snap = await getDocs(qy)
    let existing = null
    snap.forEach(d => {
      const data = d.data()
      if (data.members?.length === 2 && data.members.includes(toUid)) existing = { id: d.id, ...data }
    })
    if (existing) return onOpenChat(existing)

    // Create new chat with E2EE keyring
    const members = [uid, toUid]
    const aes = await generateChatKey()
    const raw = await exportAesKeyRaw(aes)
    const keyring = {}
    for (const m of members) {
      const ud = await getDoc(doc(db, 'users', m))
      const pub = ud.data()?.pub
      if (!pub) continue
      const pubKey = await importUserPublicKey(pub)
      const enc = await encryptForUserPublic(pubKey, raw)
      const encB64 = btoa(String.fromCharCode(...new Uint8Array(enc)))
      keyring[m] = encB64
    }
    const chatDoc = await addDoc(collection(db, 'chats'), {
      isGroup: false,
      members,
      name: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      unread: {},
      keyring,
    })
    onOpenChat({ id: chatDoc.id })
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="Add by email" value={email} onChange={e=>setEmail(e.target.value)} />
        <Button disabled={loading} onClick={addByEmail}>Add</Button>
      </div>
      <div className="text-sm text-gray-500">Your contacts</div>
      <div className="space-y-2">
        {contacts.map(c => (
          <div key={c.uid} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
            <div className="flex items-center gap-2">
              <Avatar name={c.name || c.email} />
              <div>
                <div className="font-medium">{c.name || c.email}</div>
                <div className="text-xs text-gray-500">{c.email}</div>
              </div>
            </div>
            <Button className="bg-white border text-gray-800 hover:bg-gray-50" onClick={()=>startChat(c.uid)}>Message</Button>
          </div>
        ))}
        {contacts.length === 0 && <div className="text-sm text-gray-500">No contacts yet</div>}
      </div>
    </div>
  )
}

function Shell() {
  const { user, loading } = useAuth()
  const [active, setActive] = useState(null)
  const [creating, setCreating] = useState(false)
  const [showContacts, setShowContacts] = useState(false)

  const createChat = async (e) => {
    e.preventDefault()
    const form = new FormData(e.target)
    const name = form.get('name')
    const members = form.get('members').split(',').map(s=>s.trim()).filter(Boolean)
    const uniqueMembers = Array.from(new Set([user.uid, ...members]))

    // Build E2EE keyring for all members
    let keyring = {}
    try {
      const aes = await generateChatKey()
      const raw = await exportAesKeyRaw(aes)
      for (const m of uniqueMembers) {
        const ud = await getDoc(doc(db, 'users', m))
        const pub = ud.data()?.pub
        if (!pub) continue
        const pubKey = await importUserPublicKey(pub)
        const enc = await encryptForUserPublic(pubKey, raw)
        const encB64 = btoa(String.fromCharCode(...new Uint8Array(enc)))
        keyring[m] = encB64
      }
    } catch {}

    const chatDoc = await addDoc(collection(db, 'chats'), {
      isGroup: uniqueMembers.length > 2,
      members: uniqueMembers,
      name: name || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      unread: {},
      keyring,
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
          <Button onClick={()=>setShowContacts(s => !s)} className="bg-white border text-gray-800 hover:bg-gray-50">{showContacts ? 'Chats' : 'Contacts'}</Button>
          <Button onClick={()=>setCreating(true)} className="bg-white border text-gray-800 hover:bg-gray-50">New Chat</Button>
          <Button onClick={()=>signOut(auth)} className="bg-rose-600 hover:bg-rose-700">Logout</Button>
        </div>
      </header>
      <main className="grid md:grid-cols-[360px,1fr] grid-cols-1 h-full">
        <aside className="border-r bg-white/60 p-3 overflow-y-auto">
          {showContacts ? (
            <Contacts uid={user.uid} onOpenChat={setActive} />
          ) : (
            <ChatList uid={user.uid} onOpenChat={setActive} />
          )}
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
