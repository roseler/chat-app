const bytesToBase64 = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (text) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
export async function encryptMessage(message, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(message),
  );
  return {
    encryptedContent: `v2:${bytesToBase64(ciphertext)}`,
    iv: bytesToBase64(iv),
  };
}
export async function decryptMessage(content, iv, key, legacyIds) {
  if (!content?.startsWith("v2:")) {
    // Read-only compatibility. Never use this predictable key for new messages.
    try {
      const ids = legacyIds.map(Number).sort((a, b) => a - b);
      const raw = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${ids[0]}_${ids[1]}_chat_key`),
      );
      const legacyKey = await crypto.subtle.importKey(
        "raw",
        raw,
        "AES-CBC",
        false,
        ["decrypt"],
      );
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-CBC", iv: fromBase64(iv) },
        legacyKey,
        fromBase64(content),
      );
      return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
    } catch {
      return "[Unable to decrypt this legacy message.]";
    }
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(iv) },
      key,
      fromBase64(content.slice(3)),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return "[Unable to decrypt this message in this browser.]";
  }
}
