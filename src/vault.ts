export type Sealed = { cipher: string; iv: string; salt: string; version: 1 };
const encode = (v: Uint8Array) => btoa(String.fromCharCode(...v));
const decode = (v: string) => Uint8Array.from(atob(v), c => c.charCodeAt(0));
async function key(passphrase: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function seal(value: string, passphrase: string): Promise<Sealed> {
  if (passphrase.length < 12) throw new Error('Use a vault passphrase of at least 12 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(passphrase, salt), new TextEncoder().encode(value));
  return { cipher: encode(new Uint8Array(cipher)), salt: encode(salt), iv: encode(iv), version: 1 };
}
export async function unseal(value: Sealed, passphrase: string) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(value.iv) }, await key(passphrase, decode(value.salt)), decode(value.cipher));
  return new TextDecoder().decode(plain);
}
