# Deploy on Cloudflare and Render

Cloudflare Workers hosts the React build and forwards `/api/*` and `/socket.io/*` to Render. Render runs Express, Socket.IO, and SQLite on a persistent disk. The browser uses one HTTPS origin, including its HttpOnly login cookie. No custom domain is required.

The Render blueprint creates one **paid Starter web service and a 1 GB disk**. Confirm the current total shown by Render before creating it. Never use Render's ephemeral filesystem for this app's database.

## 1. Publish the Cloudflare frontend

Use Node.js 24. From the repository root:

```bash
npm ci
npm run login:cf
npm run deploy:cf
```

The first deploy builds and uploads the frontend and proxy from `wrangler.jsonc`. It can publish the interface before Render is configured; API calls return a clear 503 until the backend URL and shared secret are set. Note the resulting `https://quiet-chat.<your-subdomain>.workers.dev` URL.

If Cloudflare asks you to select an account or register a Workers subdomain, finish that setup. Change `name` in `wrangler.jsonc` if you want a different Worker name. Pick the final URL before creating real messaging accounts: encryption keys belong to the browser's origin.

## 2. Create the Render backend

Open the Render dashboard and create a **Blueprint** from `https://github.com/roseler/chat-app`, branch `main`. Render reads the root `render.yaml`.

The blueprint sets `FRONTEND_URL` to the deployed frontend, `https://quiet-chat.ros-03a.workers.dev`. If you use a different Cloudflare URL, update it to that exact origin without a trailing slash. The blueprint configures:

| Setting        | Value                             |
| -------------- | --------------------------------- |
| Service        | `quiet-chat-api`                  |
| Root directory | `backend`                         |
| Runtime        | Node.js 24                        |
| Build          | `npm ci`                          |
| Start          | `npm start`                       |
| Health check   | `/api/health`                     |
| Plan           | Starter (paid)                    |
| Disk mount     | `/var/data` (1 GB)                |
| `NODE_ENV`     | `production`                      |
| `DB_PATH`      | `/var/data/database.sqlite`       |
| `PROXY_SECRET` | Generated automatically by Render |

Review the paid resources and create the Blueprint. Wait for the health check to pass, and note the service's `https://...onrender.com` URL. Do not set `PORT`; Render supplies it.

## 3. Connect Cloudflare to Render

In **Cloudflare → Workers & Pages → quiet-chat → Settings → Variables and Secrets**, add:

| Name           | Type   | Value                                                                                 |
| -------------- | ------ | ------------------------------------------------------------------------------------- |
| `BACKEND_URL`  | Text   | The Render service's HTTPS origin, such as `https://quiet-chat-api-xxxx.onrender.com` |
| `PROXY_SECRET` | Secret | The exact generated `PROXY_SECRET` from the Render service's Environment settings     |

Save/deploy the variable changes. Alternatively, set the secret with `npx wrangler secret put PROXY_SECRET` (paste it into the local CLI prompt, never into a commit or chat), then deploy with `npm run deploy:cf -- --var BACKEND_URL:https://YOUR-SERVICE.onrender.com`.

`keep_vars: true` preserves dashboard text variables across CLI deploys; secrets are preserved by Wrangler as well. Neither value needs to be embedded in the frontend's JavaScript. Leave `VITE_API_URL` and `VITE_SOCKET_URL` unset for this deployment: production uses the Cloudflare origin automatically.

The proxy forwards the original Origin, cookies, HTTP bodies, and WebSocket upgrades. A shared secret prevents direct backend access. Only the authenticated proxy may pass the visitor IP used for login/registration rate limits. Render's `/api/health` stays public for health checks.

## 4. Verify

1. Open `https://YOUR-CLOUDFLARE-URL/api/health`; expect `{"status":"ok","message":"Server is running"}`.
2. Open `/login` directly and refresh it; the SPA route should load.
3. Register two accounts in separate browser profiles and exchange messages. Confirm typing, unread counts, and read receipts.
4. Check the browser Network panel: API and `/socket.io/` requests must use the Cloudflare hostname, and the socket should upgrade to WebSocket.
5. Check that the session cookie is HttpOnly, Secure, and SameSite=Strict.
6. Restart the Render service and confirm you can still sign in. This verifies disk persistence.

Direct Render API requests (other than health) should return 403. A 503 on the Cloudflare API means the Worker variables are missing. A 502 means the Render service cannot be reached. A 403 through Cloudflare usually means `PROXY_SECRET` differs between providers or `FRONTEND_URL` does not exactly match the site origin.

## Updates

Push backend changes to `main` to trigger Render's linked deployment. Publish frontend/proxy changes with `npm run deploy:cf`. For automatic Cloudflare builds, connect this repository in Workers Builds with root directory `/`, build command `npm ci`, and deploy command `npm run deploy:cf`; the Wrangler custom build installs and builds the frontend. Ensure the existing Worker's variables and secret are retained. Do not use a Pages deployment for this Worker configuration.

SQLite is intentionally a single-instance database. Keep one Render instance attached to the disk. Deployment restarts may briefly disconnect sockets; clients reconnect automatically. The backend handles SIGTERM and SIGINT to close the database.

This creates a fresh hosted database. Local accounts/messages are not uploaded automatically, and localhost encryption keys do not transfer to a different hostname. See [SECURITY.md](SECURITY.md) for key-recovery limits.

## References

- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render persistent disks](https://render.com/docs/disks)
- [Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/)
- [Cloudflare Workers WebSockets](https://developers.cloudflare.com/workers/examples/websockets/)
