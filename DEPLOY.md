# Play Huntlo online (always-on hosting)

Two pieces have to live on the internet:

1. **The relay** (`cloudflare/src/worker.js`) — a Cloudflare Worker plus a
   Durable Object that passes messages between players over WebSockets.
2. **The static game** (this whole folder) — HTML/JS/GLB files. Any static host
   works: **GitHub Pages**, Netlify, or Vercel.

The client picks its relay from `window.HUNTLO_RELAY_URL` in `index.html`
(empty = local/LAN play). You set that to your relay's URL after step 1.

---

## Step 1 — Deploy the relay on Cloudflare Workers

1. Install Node.js 20+ and run `npx wrangler login`.
2. From the repository root, run:

   ```sh
   npx wrangler deploy --config cloudflare/wrangler.toml
   ```

3. Cloudflare creates `https://huntlo-relay.<account>.workers.dev`. Its WebSocket
   URL is the same address with `wss://`.

Test it: opening the HTTPS address in a browser shows `Huntlo relay OK`.

## Step 2 — Point the game at your relay

In `index.html`, set the one config line:

```html
<script>window.HUNTLO_RELAY_URL = 'wss://huntlo-relay.demoslin0623.workers.dev';</script>
```

Commit and push.

## Step 3 — Host the static game on GitHub Pages

1. Push this repo to GitHub (public repo is simplest).
2. Repo **Settings → Pages → Build and deployment**: Source **Deploy from a
   branch**, Branch **main**, folder **/ (root)**. Save.
3. After a minute your game is at `https://<you>.github.io/<repo>/`.

Send that link to your friend. Both of you open it, pick a team, hit
**START MATCH**, and you're on the same relay. Done.

---

## Quick testing without redeploying

Append `?relay=wss://…` to the page URL to override the relay for one session:

```
https://<you>.github.io/<repo>/?relay=wss://huntlo-relay.demoslin0623.workers.dev
```

## Notes

- **`ws` vs `wss`:** an `https://` page can only talk to a `wss://` relay.
- **Cloudflare binding:** `cloudflare/wrangler.toml` creates the `HUNTLO_ROOM`
  Durable Object binding automatically during the first deploy.
- **Local / same Wi-Fi** still works with `HUNTLO_RELAY_URL = ''`: run
  `python3 serve.py` and `python3 relay_server.py`, and connect to
  `http://<host-ip>:5173`.
