const OWNER_USERNAME = "roseler";
const OWNER_EMAIL = "admin@roseler.tech";
const validId = (id) => Number.isSafeInteger(id) && id > 0;
const canChat = (userId, otherId, ownerId) =>
  validId(userId) &&
  validId(otherId) &&
  validId(ownerId) &&
  userId !== otherId &&
  (userId === ownerId || otherId === ownerId);
const isReserved = (username, email) =>
  username.toLowerCase() === OWNER_USERNAME ||
  email.toLowerCase() === OWNER_EMAIL;
const visibleOnline = (users, viewerId, ownerId) =>
  viewerId === ownerId
    ? users.filter((user) => user.userId !== viewerId)
    : users.filter((user) => user.userId === ownerId);
module.exports = {
  OWNER_USERNAME,
  OWNER_EMAIL,
  canChat,
  isReserved,
  visibleOnline,
};
