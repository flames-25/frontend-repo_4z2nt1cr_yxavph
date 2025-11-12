// Simple E2EE helpers using WebCrypto
// - Per-user RSA-OAEP keypair (public uploaded to Firestore users doc, private stored locally)
// - Per-chat AES-GCM symmetric key, encrypted for each member with their public key

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const b64encode = (buf) => {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

const b64decode = (b64) => {
  const bin = atob(b64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

export async function ensureUserKeypair() {
  // Try load private key from localStorage
  const privJwkStr = localStorage.getItem('e2ee_priv_jwk')
  const pubJwkStr = localStorage.getItem('e2ee_pub_jwk')
  if (privJwkStr && pubJwkStr) {
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      JSON.parse(privJwkStr),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['decrypt']
    )
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      JSON.parse(pubJwkStr),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['encrypt']
    )
    return { privateKey, publicKey, pubJwk: JSON.parse(pubJwkStr) }
  }
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  )
  const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)
  const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  localStorage.setItem('e2ee_priv_jwk', JSON.stringify(privJwk))
  localStorage.setItem('e2ee_pub_jwk', JSON.stringify(pubJwk))
  return { privateKey: keyPair.privateKey, publicKey: keyPair.publicKey, pubJwk }
}

export async function importUserPublicKey(pubJwk) {
  return crypto.subtle.importKey('jwk', pubJwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt'])
}

export async function generateChatKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function exportAesKeyRaw(aesKey) {
  return crypto.subtle.exportKey('raw', aesKey)
}

export async function importAesKeyRaw(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
}

export async function encryptForUserPublic(pubKey, dataBuffer) {
  return crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pubKey, dataBuffer)
}

export async function decryptWithPrivate(privKey, dataBuffer) {
  return crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privKey, dataBuffer)
}

export async function aesEncrypt(aesKey, plainText) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, textEncoder.encode(plainText))
  return { iv: b64encode(iv), ct: b64encode(cipher) }
}

export async function aesDecrypt(aesKey, ctB64, ivB64) {
  const iv = new Uint8Array(b64decode(ivB64))
  const ct = b64decode(ctB64)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct)
  return textDecoder.decode(plain)
}

export function uint8ToB64(u8) {
  return b64encode(u8.buffer)
}

export function b64ToUint8(b64) {
  return new Uint8Array(b64decode(b64))
}
