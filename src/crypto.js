// crypto.js — valgfri password-kryptering af en sags-eksport (AES-256-GCM + PBKDF2). 100% lokalt (Web Crypto),
// ingen biblioteker. Bruges KUN når brugeren selv vælger "🔒 Krypteret eksport"; almindelig eksport er uændret.
// Envelope: { app:'caseboard-enc', v:1, salt, iv, data } (alt base64). Uden korrekt adgangskode kan intet læses.

const PBKDF2_ITER = 210000;   // robust mod brute-force; OWASP-niveau for PBKDF2-SHA256

function u8ToB64(u8) { let s = ''; const c = 0x8000; for (let i = 0; i < u8.length; i += c) s += String.fromCharCode.apply(null, u8.subarray(i, i + c)); return btoa(s); }
function b64ToU8(b) { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

async function deriveKey(password, salt) {
  const mat = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' }, mat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptJson(jsonString, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(jsonString)));
  return { app: 'caseboard-enc', v: 1, salt: u8ToB64(salt), iv: u8ToB64(iv), data: u8ToB64(ct) };
}

// kaster hvis adgangskoden er forkert / filen er beskadiget (GCM-auth-tag fejler)
export async function decryptEnvelope(env, password) {
  const key = await deriveKey(password, b64ToU8(env.salt));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToU8(env.iv) }, key, b64ToU8(env.data));
  return new TextDecoder().decode(pt);
}

export const isEncryptedExport = (d) => !!(d && d.app === 'caseboard-enc' && d.salt && d.iv && d.data);
