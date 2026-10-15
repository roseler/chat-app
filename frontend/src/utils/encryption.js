import api from "./api";
import {
  createAccountKey,
  openAccountKey,
  importAccountKey,
  sealAccountKey,
} from "./account-key.mjs";
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
async function replaceStoredKey(id, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("keys", "readwrite");
    transaction.objectStore("keys").put(value, String(id));
    transaction.oncomplete = resolve;
    transaction.onerror = () =>
      reject(new Error("Unable to save your messaging key."));
  });
}
const identities = new Map();
const normalized = (key) =>
  JSON.stringify({ kty: "EC", crv: "P-256", x: key.x, y: key.y });
export function initializeIdentity(userId) {
  if (!identities.has(userId))
    identities.set(
      userId,
      (async () => {
        if (!window.crypto?.subtle)
          throw new Error("Messaging requires HTTPS or localhost.");
        const pair = await storedKey(userId);
        const { data } = await api.get("/auth/messaging-key");
        if (!data.backup)
          throw new Error("Set up messaging for your account to continue.");
        if (
          !pair?.accountBased ||
          normalized(await crypto.subtle.exportKey("jwk", pair.publicKey)) !==
            normalized(data.publicKey)
        )
          throw new Error("Enter your password to unlock account messaging.");
        return pair;
      })().catch((error) => {
        identities.delete(userId);
        throw error;
      }),
    );
  return identities.get(userId);
}
export async function unlockIdentity(
  userId,
  password,
  { replaceLegacy = false } = {},
) {
  let { data } = await api.get("/auth/messaging-key");
  let pair;
  if (!data.backup) {
    if (data.publicKey && !replaceLegacy)
      throw new Error("Confirm the switch from browser messaging first.");
    const created = await createAccountKey(password, userId);
    try {
      await api.put("/auth/messaging-key", {
        password,
        publicKey: created.publicKey,
        backup: created.backup,
        replaceLegacy,
      });
      pair = created.pair;
    } catch (error) {
      if (error.response?.status !== 409) throw error;
      data = (await api.get("/auth/messaging-key")).data;
      if (!data.backup) throw error;
    }
  }
  if (!pair) {
    const raw = await openAccountKey(data.backup, password, userId);
    try {
      pair = await importAccountKey(raw, data.publicKey);
    } finally {
      new Uint8Array(raw).fill(0);
    }
  }
  const previous = await storedKey(userId);
  if (previous && !previous.accountBased)
    await storedKey(`legacy:${userId}`, previous);
  pair.accountBased = true;
  await replaceStoredKey(userId, pair);
  identities.set(userId, Promise.resolve(pair));
  return pair;
}
export async function passwordKeyUpdate(userId, currentPassword, newPassword) {
  const { data } = await api.get("/auth/messaging-key");
  if (!data.backup) return {};
  const raw = await openAccountKey(data.backup, currentPassword, userId);
  try {
    return {
      keyBackup: await sealAccountKey(raw, newPassword, userId),
      keyVersion: data.version,
    };
  } finally {
    new Uint8Array(raw).fill(0);
  }
}
export async function getSharedKey(userId, otherUser) {
  if (!otherUser?.public_key)
    throw new Error(
      "This person needs to sign in before you can send encrypted messages.",
    );
  const peerId = `peer:${userId}:${otherUser.id}`;
  const pinned = await storedKey(peerId, {
    publicKey: otherUser.public_key,
    version: otherUser.key_version || 0,
  });
  if (pinned.publicKey !== otherUser.public_key) {
    if ((otherUser.key_version || 0) <= (pinned.version || 0))
      throw new Error(
        "This person’s messaging key changed unexpectedly. Sending is paused.",
      );
    // Only the password-authenticated, one-time account migration advances this version.
    await storedKey(`legacy-${peerId}`, pinned);
    await replaceStoredKey(peerId, {
      publicKey: otherUser.public_key,
      version: otherUser.key_version,
    });
  }
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
