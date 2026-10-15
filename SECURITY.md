# Security review

Reviewed 2026-10-15 as part of the chat improvements.

## Changes implemented

- Removed predictable keys derived from user IDs and unauthenticated AES-CBC for new messages. Browser-side ECDH P-256 derives a shared secret; HKDF-SHA-256 derives a per-conversation AES-256-GCM key. Every message uses a fresh random 96-bit IV.
- Private keys remain non-exportable in IndexedDB. Account public keys are validated by the server and registered once with an atomic database update. Peers are pinned locally on first use. Lost keys are not silently replaced.
- Replaced localStorage JWTs and the hardcoded signing secret with random 256-bit opaque session cookies (HttpOnly, SameSite=Strict, Secure in production). Only SHA-256 token hashes are stored in SQLite. Sessions expire after seven days; logout revokes the active session and disconnects its sockets; password changes revoke all sessions and issue a replacement for the current browser.
- Authenticate socket handshakes and recheck sessions on each packet. Expiration disconnects idle sockets. Check HTTP mutation origins and socket handshake origins, restrict request/message sizes, throttle message sends, and retain login/registration rate limits.
- Validate password types and bcrypt’s 72-byte limit, use bcrypt cost 12 for new passwords, restrict read receipts to message recipients, parameterize SQL, and enable SQLite foreign keys.
- Remove email addresses from other users’ directory entries. Render messages as React text, preserving escaping. Restore browser zoom and keyboard accessibility.
- Upgrade runtime dependencies, remove unused crypto/JWT/sanitizer packages, replace Create React App with Vite, and replace nodemon with Node’s watch mode. All three npm audits reported zero known vulnerabilities after updates. Audits are snapshots, not a guarantee.

## Remaining limits

- This is a small custom messaging implementation, not an independently audited protocol. It has no forward secrecy, double ratchet, signed identities, manual fingerprint verification, key backup, recovery, or multi-device transfer. First-contact authenticity depends on the server delivering the correct public key. A compromised server could substitute keys on first contact or serve malicious client code.
- XSS or a compromised dependency can still use non-exportable keys within the origin or access plaintext drafts/messages. IndexedDB does not protect against code already running in the origin. Session storage drafts are plaintext and last for the tab’s lifetime; do not use shared browser profiles for private conversations.
- Browser clearing/site-origin changes lose private keys. An account with a missing private key cannot initialize messaging in another browser. A deliberate, authenticated recovery/rotation flow is future work.
- Legacy ciphertext used public, predictable keys. It remains in the database until normal retention cleanup, and remains readable with a legacy-encryption warning. The predictable key is used only for read compatibility. New encryption does not protect old ciphertext retroactively.
- Message metadata, user directory, online presence, and read receipts remain visible to the server. Connected clients may retain displayed messages beyond server retention. Backups and filesystem snapshots require their own retention policy.
- A send timeout can occur after a successful save. The draft remains; users should check the conversation before manually sending again. No persistent offline queue or exactly-once delivery is claimed.
- SQLite and in-memory presence/rate limiting target a single server. Multi-instance deployments need shared sessions/presence/rate limits and a Socket.IO adapter. Persistent disks and database backups must be configured by the hosting operator.
- No password reset, email verification, MFA, or account deletion flow is provided. HTTPS, frontend CSP/frame headers, host isolation, monitoring, and backup policy must be configured at deployment. Never expose the development server as production hosting.

## References

- [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html) — browser storage and session identifier handling.
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — session cookie protections and lifecycle.
- [MDN Web Crypto deriveKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey) — ECDH/HKDF/AES-GCM primitives. These APIs provide primitives, not a complete audited protocol.
