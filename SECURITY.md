# Security review

Reviewed 2026-10-15 as part of the chat improvements and Cloudflare migration.

The active hosted backend is now `cloudflare/chat-room.mjs`: Cloudflare Workers routes the API and native WebSockets to one SQLite-backed Durable Object. It uses bcrypt cost 12 via bcryptjs, opaque hashed sessions, same-origin checks, and persistent login/registration/message rate limits. Hibernating sockets retain authentication metadata through attachments; sessions are checked for every application event and revoked sockets are closed. The original Node backend is retained for local development only. No Render account, proxy secret, or paid-plan upgrade is required.

## Changes implemented

- Removed predictable keys derived from user IDs and unauthenticated AES-CBC for new messages. Browser-side ECDH P-256 derives a shared secret; HKDF-SHA-256 derives a per-conversation AES-256-GCM key. Every message uses a fresh random 96-bit IV.
- Account private keys are wrapped in the client with password-derived PBKDF2-SHA-256 (600,000 iterations, random 256-bit salt) and AES-256-GCM (random 96-bit IV, account-ID additional data). Only the encrypted backup is stored on the server. Restored local keys are non-exportable. Initial generation briefly exports the private key to create the encrypted backup, then imports a non-exportable copy. Password changes rewrap the same key and update the password hash, backup, and sessions atomically.
- Replaced localStorage JWTs and the hardcoded signing secret with random 256-bit opaque session cookies (HttpOnly, SameSite=Strict, Secure in production). Only SHA-256 token hashes are stored in SQLite. Sessions expire after seven days; logout revokes the active session and disconnects its sockets; password changes revoke all sessions and issue a replacement for the current browser.
- Authenticate socket handshakes and recheck sessions on each packet. Expiration disconnects idle sockets. Check HTTP mutation origins and socket handshake origins, restrict request/message sizes, throttle message sends, and retain login/registration rate limits.
- Validate password types and bcrypt’s 72-byte limit, use bcrypt cost 12 for new passwords, restrict read receipts to message recipients, parameterize SQL, and enable SQLite foreign keys.
- Remove email addresses from other users’ directory entries. Render messages as React text, preserving escaping. Restore browser zoom and keyboard accessibility.
- Upgrade runtime dependencies, remove unused crypto/JWT/sanitizer packages, replace Create React App with Vite, and replace nodemon with Node’s watch mode. All three npm audits reported zero known vulnerabilities after updates. Audits are snapshots, not a guarantee.

## Remaining limits

- This is a small custom messaging implementation, not an independently audited protocol. It has no forward secrecy, double ratchet, signed identities, manual fingerprint verification, or forgotten-password recovery. First-contact authenticity depends on the server delivering the correct public key. A compromised server could substitute keys on first contact or serve malicious client code.
- XSS or a compromised dependency can still use non-exportable keys within the origin or access plaintext drafts/messages. IndexedDB does not protect against code already running in the origin. Session storage drafts are plaintext and last for the tab’s lifetime; do not use shared browser profiles for private conversations.
- Account keys can be restored after clearing storage or changing browser/origin by signing in with the password. Backup confidentiality depends on password strength; encrypted backups permit offline password guessing if stolen. Authentication submits passwords to the server over HTTPS, so a malicious server can capture passwords or serve code that reads plaintext. Older non-exportable keys have no server backup. Moving them to account messaging requires explicit consent and password verification; older ciphertext cannot be decrypted using the new key. The one-time migration advances the server key version, which existing peer pins accept; unexpected same-version changes remain blocked. There is no general key-reset endpoint.
- Legacy ciphertext used public, predictable keys. It remains in the database until normal retention cleanup, and remains readable with a legacy-encryption warning. The predictable key is used only for read compatibility. New encryption does not protect old ciphertext retroactively.
- Message metadata, user directory, online presence, and read receipts remain visible to the server. Connected clients may retain displayed messages beyond server retention. Backups and filesystem snapshots require their own retention policy.
- A send timeout can occur after a successful save. The draft remains; users should check the conversation before manually sending again. No persistent offline queue or exactly-once delivery is claimed.
- The Cloudflare deployment targets a small app with one SQLite-backed Durable Object. It has a single coordination point and the Free plan’s per-object storage and request/compute limits. Rate limits survive restarts in SQLite; presence is derived from hibernating socket attachments. Larger workloads require a separate scaling design. Durable Object storage survives deploys, but disaster recovery and backups still need an operational policy. The optional legacy Node backend has different hosting requirements.
- No password reset, email verification, MFA, or account deletion flow is provided. HTTPS, frontend CSP/frame headers, host isolation, monitoring, and backup policy must be configured at deployment. Never expose the development server as production hosting.

## References

- [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html) — browser storage and session identifier handling.
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — session cookie protections and lifecycle.
- [MDN Web Crypto deriveKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey) — ECDH/HKDF/AES-GCM primitives. These APIs provide primitives, not a complete audited protocol.

## Owner-only conversations

The existing `roseler` / `admin@roseler.tech` account is bound once to a persistent owner ID. Roles are derived on the server, never accepted from clients. Visitors can list and contact only the owner; the owner can list and contact every visitor. The rule also restricts presence broadcasts, history, unread counts, read/delivery receipts, and typing. New visitor registrations or key updates notify only the owner. Public signup reserves the owner identifiers, including case variants. Missing owner configuration denies visitor-to-visitor access. Owner-only routing does not rotate encryption keys or delete user accounts. Account-key migration is a separate, explicit action. Prior visitor-to-visitor messages are hidden and expire under the existing 24-hour retention policy.
