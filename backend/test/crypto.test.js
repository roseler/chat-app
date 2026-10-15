const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCipheriv, createHash, randomBytes } = require("node:crypto");
test("browser cipher handles Unicode, random nonces, tampering, and legacy read compatibility", async () => {
  const { encryptMessage, decryptMessage } =
    await import("../../frontend/src/utils/cipher.mjs");
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const text = "Hello 👋\nKumusta ka? <script>text only</script>";
  const first = await encryptMessage(text, key),
    second = await encryptMessage(text, key);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.encryptedContent, second.encryptedContent);
  assert.equal(Buffer.from(first.iv, "base64").length, 12);
  assert.equal(
    await decryptMessage(first.encryptedContent, first.iv, key),
    text,
  );
  const changed = Buffer.from(first.encryptedContent.slice(3), "base64");
  changed[0] ^= 1;
  assert.match(
    await decryptMessage("v2:" + changed.toString("base64"), first.iv, key),
    /Unable to decrypt/,
  );
  const wrongKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  assert.match(
    await decryptMessage(first.encryptedContent, first.iv, wrongKey),
    /Unable to decrypt/,
  );
  const legacyKey = createHash("sha256").update("1_2_chat_key").digest(),
    iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", legacyKey, iv);
  const old = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]).toString("base64");
  assert.equal(
    await decryptMessage(old, iv.toString("base64"), null, [2, 1]),
    text,
  );
});
