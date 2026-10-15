# quiet.

A responsive text chat app with a restrained charcoal theme, live conversations, unread counts, typing indicators, timestamps, delivery/read receipts, and browser-side encryption.

## Conversations

This deployment is a private inbox for `roseler`: visitors see and can message only that account. The owner sees all other accounts. The server enforces this policy for contacts, presence, messages, history, unread counts, typing, and receipts.

On upgrade, the existing account with username `roseler` and email `admin@roseler.tech` is pinned by ID in `app_settings`. Public registration reserves both identifiers and cannot create or claim the owner role. If the matching account is absent, messaging fails closed until the operator provisions the intended account directly in storage. Existing accounts, sessions, and keys are preserved; previous visitor-to-visitor conversations become inaccessible through the app and remain subject to normal message expiry.

## Run locally

Use Node.js 22.12 or newer (tested with Node.js 24).

```bash
npm run install-all
npm run dev
```

Open http://localhost:3000. The API and Socket.IO server run at http://localhost:3001. SQLite tables are created automatically; existing user accounts remain available. Sign in again after upgrading from the old token-based version.

For the deployed Cloudflare architecture locally, run `npm run dev:cloudflare` and open http://localhost:8787. The Node/Socket.IO setup above remains available for legacy development.

The frontend uses Vite. File polling is enabled for Windows/WSL mounted folders. To produce a frontend build:

```bash
npm run build --prefix frontend
```

## Deployment

The full app runs on Cloudflare Workers with a SQLite-backed Durable Object and hibernating WebSockets. No Render service is required. See [DEPLOYMENT.md](DEPLOYMENT.md) for deployment and local Cloudflare development. The repository includes `wrangler.jsonc`.

## Features

- Labeled login/registration forms, password visibility toggles, password requirements, confirmation, loading and error feedback.
- Searchable people list, live online status, per-person unread badges, and a mobile conversation drawer with keyboard focus handling.
- Account settings showing your private email and a password-change form. Password changes revoke existing sessions; sign-out immediately revokes the current session.
- Live typing, acknowledged sends, delivery/read receipts, calendar dates and exact message times. “Sent” means saved by the server; “Delivered” means a recipient session was connected/acknowledged it; “Read” means the conversation was visible in the recipient’s browser.
- Offline/reconnection feedback. Drafts survive refresh and switching conversations in the same tab. They are kept in session storage and cleared on sign-out. Failed or unconfirmed sends retain the draft; the app does not automatically retry and risk duplicate messages.
- Keyboard focus styles, reduced-motion support, browser zoom, selectable text, and accessible form controls.

## Messaging keys and existing messages

New messages use ECDH P-256, HKDF-SHA-256, and AES-256-GCM through Web Crypto. Each account has an encrypted private-key backup in the database. The client wraps the key with AES-256-GCM using PBKDF2-SHA-256 (600,000 iterations and a random salt) derived from the account password, binding it to the account ID. Signing in on another device or site origin restores the same key. Password changes atomically replace the password hash and re-encrypt the same backup with the new password. Unlocked private keys are cached locally as non-exportable CryptoKeys; passwords are not saved in browser storage. HTTPS or localhost is required.

Existing browser-only identities need a one-time, password-authenticated switch under **Link messaging to your account**. The app requires explicit acknowledgement that older messages cannot be opened with the new key. No accounts or message rows are deleted, and the original local key is retained separately. The old non-exportable private key cannot be recovered from the server. New messages then follow the account across devices. Peer pins accept only the server's version advance for this authenticated one-time migration; unexpected changes still block sending. There is no forgotten-password recovery. This is not an independently audited protocol; see [SECURITY.md](SECURITY.md).

The former encryption derived keys from public user IDs, so it did not provide meaningful confidentiality. Existing legacy messages remain readable with a “Legacy encryption” warning. They cannot be retroactively made private. No existing accounts or messages are migrated or deleted by the upgrade itself.

Conversation history is limited to the latest 100 messages within 24 hours. Expired messages are hidden by history queries; physical cleanup runs at startup and hourly. Drafts and copies already displayed on other clients are not remotely erased.

## Configuration

Optional `backend/.env`:

```dotenv
PORT=3001
FRONTEND_URL=http://localhost:3000
DB_PATH=./database.sqlite
NODE_ENV=development
```

Optional `frontend/.env.local`:

```dotenv
VITE_API_URL=http://localhost:3001/api
VITE_SOCKET_URL=http://localhost:3001
```

By default, the frontend uses its current hostname with API port 3001. Set the URLs explicitly when deploying. Cookies require the frontend and backend to share a site. In production, use HTTPS and `NODE_ENV=production` for Secure cookies; configure the exact frontend origin. The app uses HttpOnly, SameSite=Strict cookies with hashed, revocable server-side sessions. It no longer uses JWT_SECRET or stores authentication tokens in localStorage.

The active deployment runs entirely on Cloudflare; its SQLite database is managed by a Durable Object. The optional Node backend requires a persistent server and SQLite volume if hosted separately. The old Vercel configuration is not used for Cloudflare deployments.

## Verification

```bash
npm test --prefix backend
npm run build --prefix frontend
npm audit
npm audit --prefix backend
npm audit --prefix frontend
```

API integration tests use a temporary SQLite database and port 3199. They cover authentication, cookies, malformed inputs, public-key validation/pinning, conversation queries, origin rejection, password changes, and session revocation.
