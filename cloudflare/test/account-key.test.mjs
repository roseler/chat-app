import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAccountKey,
  openAccountKey,
  importAccountKey,
  sealAccountKey,
} from "../../frontend/src/utils/account-key.mjs";
import format from "../../shared/key-backup.cjs";
test("account key restores across devices; backup rejects wrong passwords, tampering and another account", async () => {
  const created = await createAccountKey("Example123!", 7);
  assert.equal(created.pair.privateKey.extractable, false);
  assert.equal(format.validBackup(created.backup), true);
  const raw = await openAccountKey(created.backup, "Example123!", 7);
  const restored = await importAccountKey(raw, created.publicKey);
  assert.equal(restored.privateKey.extractable, false);
  const peer = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const derive = (privateKey) =>
    crypto.subtle.deriveBits(
      { name: "ECDH", public: peer.publicKey },
      privateKey,
      256,
    );
  assert.deepEqual(
    await derive(created.pair.privateKey),
    await derive(restored.privateKey),
  );
  await assert.rejects(
    openAccountKey(created.backup, "Wrong123!", 7),
    /Could not unlock/,
  );
  await assert.rejects(
    openAccountKey(created.backup, "Example123!", 8),
    /Could not unlock/,
  );
  const tampered = {
    ...created.backup,
    ciphertext:
      (created.backup.ciphertext[0] === "A" ? "B" : "A") +
      created.backup.ciphertext.slice(1),
  };
  await assert.rejects(
    openAccountKey(tampered, "Example123!", 7),
    /Could not unlock/,
  );
  const updated = await sealAccountKey(raw, "Updated123!", 7);
  assert.deepEqual(await openAccountKey(updated, "Updated123!", 7), raw);
  await assert.rejects(
    openAccountKey(updated, "Example123!", 7),
    /Could not unlock/,
  );
  new Uint8Array(raw).fill(0);
});
