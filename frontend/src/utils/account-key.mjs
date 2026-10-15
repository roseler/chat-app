const encode = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const iterations = 600000;
const aad = (userId) =>
  new TextEncoder().encode(`quiet-account-key:v1:${userId}`);
async function wrappingKey(password, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function sealAccountKey(raw, password, userId) {
  const salt = crypto.getRandomValues(new Uint8Array(32)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await wrappingKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(userId) },
    key,
    raw,
  );
  return {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iterations,
    salt: encode(salt),
    iv: encode(iv),
    ciphertext: encode(ciphertext),
  };
}
export async function openAccountKey(backup, password, userId) {
  if (
    backup?.v !== 1 ||
    backup.iterations !== iterations ||
    backup.kdf !== "PBKDF2-SHA256"
  )
    throw new Error("Unsupported messaging key backup.");
  try {
    const key = await wrappingKey(password, decode(backup.salt));
    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(backup.iv), additionalData: aad(userId) },
      key,
      decode(backup.ciphertext),
    );
  } catch {
    throw new Error(
      "Could not unlock your messaging key. Check your current account password.",
    );
  }
}
export async function createAccountKey(password, userId) {
  const generated = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const publicKey = await crypto.subtle.exportKey("jwk", generated.publicKey);
  const raw = await crypto.subtle.exportKey("pkcs8", generated.privateKey);
  const backup = await sealAccountKey(raw, password, userId);
  const pair = await importAccountKey(raw, publicKey);
  new Uint8Array(raw).fill(0);
  return { pair, publicKey, backup };
}
export async function importAccountKey(raw, publicKey) {
  return {
    privateKey: await crypto.subtle.importKey(
      "pkcs8",
      raw,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    ),
    publicKey: await crypto.subtle.importKey(
      "jwk",
      publicKey,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      [],
    ),
  };
}
