const db = require("./database");
const policy = require("../../../shared/chat-policy.cjs");
async function ownerId() {
  const pinned = await db.get(
    "SELECT value FROM app_settings WHERE key = 'owner_id'",
  );
  if (pinned) return Number(pinned.value);
  const owner = await db.get(
    "SELECT id FROM users WHERE username = ? AND lower(email) = ?",
    [policy.OWNER_USERNAME, policy.OWNER_EMAIL],
  );
  if (!owner) return null;
  await db.run(
    "INSERT OR IGNORE INTO app_settings (key,value) VALUES ('owner_id',?)",
    [String(owner.id)],
  );
  return Number(
    (await db.get("SELECT value FROM app_settings WHERE key = 'owner_id'"))
      .value,
  );
}
const allowed = async (userId, otherId) =>
  policy.canChat(userId, otherId, await ownerId());
const role = async (user) => ({
  ...user,
  is_owner: user.id === (await ownerId()),
});
module.exports = { ...policy, ownerId, allowed, role };
