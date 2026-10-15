import api from "./api";
let database;
function openDatabase() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("chat-identity", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("keys");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new Error("Allow browser storage to enable messaging."));
    });
  return database;
}
async function storedKey(id, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      "keys",
      value ? "readwrite" : "readonly",
    );
    const store = transaction.objectStore("keys");
    let result;
    const request = store.get(String(id));
    request.onsuccess = () => {
      result = request.result;
      if (!result && value) {
        result = value;
        store.add(value, String(id));
      }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () =>
      reject(new Error("Unable to save your messaging key."));
  });
}
const identities = new Map();
export function initializeIdentity(userId) {
  if (!identities.has(userId))
    identities.set(
      userId,
      (async () => {
        if (!window.crypto?.subtle)
          throw new Error("Messaging requires HTTPS or localhost.");
        let pair = await storedKey(userId);
        if (!pair) {
          // Non-exportable private key; the public half remains exportable.
          pair = await crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            false,
            ["deriveBits"],
          );
          pair = await storedKey(userId, pair);
        }
        const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
        await api.put("/auth/public-key", { publicKey });
        return pair;
      })().catch((error) => {
        identities.delete(userId);
        throw error;
      }),
    );
  return identities.get(userId);
}
export async function getSharedKey(userId, otherUser) {
  if (!otherUser?.public_key)
    throw new Error(
      "This person needs to sign in before you can send encrypted messages.",
    );
  const pinned = await storedKey(`peer:${userId}:${otherUser.id}`, {
    publicKey: otherUser.public_key,
  });
  if (pinned.publicKey !== otherUser.public_key)
    throw new Error(
      "This person’s messaging key changed. Sending is paused to protect your conversation.",
    );
  const pair = await initializeIdentity(userId);
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(otherUser.public_key),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const secret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    pair.privateKey,
    256,
  );
  const material = await crypto.subtle.importKey("raw", secret, "HKDF", false, [
    "deriveKey",
  ]);
  const ids = [Number(userId), Number(otherUser.id)]
    .sort((a, b) => a - b)
    .join(":");
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(`quiet-chat:v2:${ids}`),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export { encryptMessage, decryptMessage } from "./cipher.mjs";
