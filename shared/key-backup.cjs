const validBackup = (value) =>
  value &&
  value.v === 1 &&
  value.kdf === "PBKDF2-SHA256" &&
  value.iterations === 600000 &&
  typeof value.salt === "string" &&
  /^[A-Za-z0-9+/]{43}=$/.test(value.salt) &&
  typeof value.iv === "string" &&
  /^[A-Za-z0-9+/]{16}$/.test(value.iv) &&
  typeof value.ciphertext === "string" &&
  value.ciphertext.length >= 100 &&
  value.ciphertext.length <= 1024 &&
  /^[A-Za-z0-9+/]+={0,2}$/.test(value.ciphertext);
module.exports = { validBackup };
