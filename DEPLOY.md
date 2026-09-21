# Play Huntlo online (always-on hosting)

Two pieces have to live on the internet:

1. **The relay** (`relay_server.py`) — a small WebSocket server that passes
   messages between players. Needs a host that runs Python and gives a `wss://`
   URL. **Render's free tier** works and is used below.
2. **The static game** (this whole folder) — HTML/JS/GLB files. Any static host
   works: **GitHub Pages**, Netlify, or Vercel.

The client picks its relay from `window.HUNTLO_RELAY_URL` in `index.html`
(empty = local/LAN play). You set that to your relay's URL after step 1.

---

## Step 1 — Deploy the relay on Render

1. Push this repo to GitHub (see Step 2 if you haven't yet).
2. Go to <https://render.com>, sign in with GitHub.
3. **New +  →  Blueprint**, pick this repo. Render reads `render.yaml` and
   creates a free web service called **huntlo-relay**.
   - (Or **New +  →  Web Service** manually: Runtime **Python 3**, Build
     `pip install -r requirements.txt`, Start `python3 relay_server.py`.)
4. When it's live, copy its URL, e.g. `https://huntlo-relay.onrender.com`.
   The WebSocket address is the same host with `wss://`:
   `wss://huntlo-relay.onrender.com`.

Test it: opening the `https://…onrender.com` URL in a browser shows
`Huntlo relay OK` — that means it's up.

> Free Render services sleep after ~15 min idle and take ~30–50 s to wake on the
> first connection. Fine for casual play; upgrade the plan to keep it always warm.

## Step 2 — Point the game at your relay

In `index.html`, set the one config line:

```html
<script>window.HUNTLO_RELAY_URL = 'wss://huntlo-relay.onrender.com';</script>
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
https://<you>.github.io/<repo>/?relay=wss://huntlo-relay.onrender.com
```

## Notes

- **`ws` vs `wss`:** an `https://` page can only talk to a `wss://` relay
  (browsers block insecure `ws://` from a secure page). Render gives you `wss://`
  automatically, so this is handled.
- **Other relay hosts:** Railway and Fly.io work too — deploy `relay_server.py`,
  make sure it listens on `$PORT` (it already does), and use the `wss://` URL
  they give you.
- **Local / same Wi-Fi** still works with `HUNTLO_RELAY_URL = ''`: run
  `python3 serve.py` and `python3 relay_server.py`, and connect to
  `http://<host-ip>:5173`.
