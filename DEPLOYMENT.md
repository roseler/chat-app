# Cloudflare deployment

The live app is **https://quiet-chat.ros-03a.workers.dev**.

The frontend, API, database, and live connections run on Cloudflare. A Worker serves the React build and routes `/api/*` and `/ws` to a SQLite-backed `ChatRoom` Durable Object. The object stores accounts, hashed sessions, encrypted messages, and rate limits. Its hibernating WebSockets handle typing, presence, delivery, and read receipts. No Render service, external database, proxy secret, or custom domain is required.

SQLite-backed Durable Objects are available on the Workers Free plan. Keep the account on Free: requests/storage operations fail if the free quotas are exhausted. This configuration does not enable or upgrade a paid plan. See [Cloudflare's limits and pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Publish updates

Use Node.js 24. From the repository root:

```bash
npm ci
npm run login:cf
npm run deploy:cf
```

Wrangler builds the frontend, uploads its assets and backend, and applies the Durable Object class migration from `wrangler.jsonc`. The `CHAT` binding and SQLite-backed `ChatRoom` namespace are created automatically on first deploy. `quiet-global-v1` is the stable object name used by the app: **do not change it or remove its class migration**, because doing so can point the app at a fresh database.

Redeploys retain the object's database. This migration creates new hosted storage; it does not upload or modify the legacy local `backend/database.sqlite` file. There were no hosted Render accounts or messages to transfer.

No secrets or environment variables are required. Leave `BACKEND_URL`, `PROXY_SECRET`, `VITE_API_URL`, and `VITE_SOCKET_URL` unset. Authentication uses same-origin HttpOnly, Secure, SameSite=Strict cookies on HTTPS. Passwords use bcrypt cost 12 through `bcryptjs`, which runs in the Durable Object without a native addon. Raw session tokens are never stored in the database.

For browser sign-in problems on WSL or remote machines:

```bash
npx wrangler login --device --browser=false --scopes account:read user:read workers:write workers_scripts:write
```

Finish the device authorization in your browser. Do not commit OAuth credentials or API tokens.

## Local Cloudflare development and tests

```bash
npm run dev:cloudflare
```

Open http://localhost:8787. Wrangler builds and serves the production frontend with a local Durable Object/database. Local data is kept under `.wrangler/`, which is ignored by Git. Local cookies omit Secure because localhost development uses HTTP.

Run unit and routing tests with `npm run test:deploy` (Node 24, including its built-in SQLite module).

For integration tests, build the frontend, then start a **separate local fixture** instead of the development command above:

```bash
npm run build --prefix frontend
npx wrangler dev --config cloudflare/test/wrangler.jsonc --port 8787 --persist-to /tmp/quiet-owner-integration
```

In another terminal, run `npm run test:cloudflare`. Use a fresh persistence directory for each run because public keys are pinned. The fixture provisions a local owner with password `Example123!`; it is not imported by the production Worker and must never be deployed. Integration tests refuse non-localhost targets. They cover the owner and two visitors, contact/presence privacy, blocked visitor-to-visitor traffic, encrypted messaging, sessions, key pinning, read receipts, password changes, and logout. SQLite-backed unit tests also check inaccessible prior peer messages, reserved registration, and persistent owner identity.

The production upgrade pins the existing account matching the identity in `shared/chat-policy.cjs`. It adds `app_settings` and `account_keys` in the same database; keep the Worker name, binding, class migration, and object name unchanged. The public registration endpoint cannot provision an owner. If the existing account does not match, visitors have no contact and messaging remains closed until the intended account is provisioned by the operator.

The original Node backend remains available for legacy development with `npm run dev`; it is not deployed or required by the Cloudflare site. Its native Socket.IO development connection is selected only in Vite development builds. The hosted app and `dev:cloudflare` use native WebSockets.

## Production checks

- `/api/health` should return status `ok` with `hosting: cloudflare`.
- `/login` and `/register` should open directly and survive refresh.
- Unauthenticated `/api/auth/me` should return 401.
- Authenticated live chat should connect to `wss://quiet-chat.ros-03a.workers.dev/ws` with a 101 upgrade.
- API responses should use `Cache-Control: no-store`; HTTPS session cookies should be Secure, HttpOnly, and SameSite=Strict.

## Limits and data lifecycle

This intentionally uses one chat object, appropriate for a small app. It is not a multi-region or high-volume chat architecture. The Free plan's per-object SQLite capacity and request/write/compute quotas apply. Growing beyond them requires a separate architecture and plan decision.

Conversation queries show messages from the last 24 hours. A Durable Object alarm cleans expired messages, sessions, and rate limits hourly; the alarm also schedules earlier for the next session expiration. Socket sessions are rechecked on each application event and closed after revocation/expiration. Hibernation keeps idle connections open without a running JavaScript loop on the server; ping/pong responses use the hibernation auto-response API.

Encryption keys remain in the browser's IndexedDB. Keep the public hostname stable. Clearing browser site data or moving to another hostname/browser can make messages inaccessible; no recovery or device transfer is implemented. See [SECURITY.md](SECURITY.md).

## Optional automatic deployments

Connect this GitHub repository to the existing `quiet-chat` Worker using Cloudflare Workers Builds. Use repository root `/`, build command `npm ci`, and deploy command `npm run deploy:cf`. The Wrangler custom build handles the frontend. This is a Worker deployment, not a Pages project. Keep the Durable Object binding/migration and Worker name unchanged across builds.

## References

- [Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/)
- [SQLite-backed Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Hibernating WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Free-plan pricing and limits](https://developers.cloudflare.com/durable-objects/platform/pricing/)

## Account messaging upgrade

Fresh accounts create a password-encrypted messaging-key backup at sign-up. Existing accounts with browser-only keys see **Link messaging to your account**; they must enter their password and acknowledge earlier-message limitations before the one-time switch. The deployment itself never resets an existing identity. After setup, sign-in restores the same key in another browser or on the custom domain. Password changes preserve message access by rewrapping the backup. Keep the Durable Object database intact: it contains both encrypted messages and encrypted key backups. Browser checks cover fresh-device restores, password changes, and the explicit legacy transition.
