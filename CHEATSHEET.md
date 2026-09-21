# 🎮 VALO — Cheat Sheet

Quick reference for running and playing. **You (host)** run 2 servers in Terminal;
friends just open a URL in a browser.

---

## ⚡ Easiest: `/start` in Claude Code

In this Claude Code chat, just type:
```
/start
```
It kills old servers, launches the relay + game server in the background, and
prints every URL to connect from — `localhost:5173` for this Mac, plus the LAN
URL(s) for the iPad/friend.

> First time after it's added, reload the session (or restart `claude`) so the
> command shows up. Or double-click **`start.command`** in Finder — same thing.

---

## ▶ Start manually (do this every time)

Open **Terminal** (`Cmd + Space` → type `Terminal`).

**1. Free old servers (safe to always run):**
```bash
pkill -f relay_server.py; pkill -f serve.py
```

**2. Start the multiplayer relay** (leave this window open):
```bash
cd /Users/demoslin/valo
python3 relay_server.py
```
→ shows `[relay] Valo relay listening on ws://0.0.0.0:8080`

**3. New Terminal window (`Cmd + N`) — start the game server:**
```bash
cd /Users/demoslin/valo
python3 serve.py
```

**4. Play:** open a browser →
```
localhost:5173
```
Type a **nickname**, then click anywhere to play.

---

## 👥 Your friend / iPad (same Wi‑Fi or hotspot)

No Terminal. Just open a browser and go to the LAN URL that `/start` prints,
for example:
```
http://10.0.12.13:5173
```
Type a nickname, click/tap to play. (No commands on their end.)

> The IP changes when you switch networks. Run `/start` (or `start.command`)
> again to get the current one.

> If macOS asks "allow python3 to accept incoming connections," click **Allow**.

---

## ⏹ Stop the servers

Click each Terminal window and press **`Ctrl + C`**, or run:
```bash
pkill -f relay_server.py; pkill -f serve.py
```

---

## 🕹 Controls

| Key | Action |
|-----|--------|
| **WASD** | Move |
| **Mouse** | Look |
| **Left click** | Shoot |
| **Right click** | Aim / scope |
| **R** | Reload |
| **1 / 2 / 3** | Primary / Secondary / Knife |
| **F** | Inspect weapon |
| **Space** | Jump |
| **Left Shift** | Crouch |
| **Left Ctrl** | Silent walk |
| **B** | Buy menu |
| **Esc** | Release mouse |

When you die → click **RESPAWN**.

---

## 🛠 Troubleshooting

**"Address already in use"** → a server is already running. Free it, then start again:
```bash
pkill -f relay_server.py; pkill -f serve.py
```

**Friend can't connect** → check:
- Both servers running and your Mac is awake.
- You're both on the **same Wi‑Fi** (or the same phone hotspot).
- Clicked **Allow** on the macOS firewall popup.

**Bad home Wi‑Fi?** → turn on a **phone hotspot**, connect *both* the Mac and
the iPad to it, then run `/start` for the new address. Local game traffic stays
between the two devices, so it uses almost no data.

**Find your Mac's IP** (prints one URL per active network):
```bash
for IFACE in $(ifconfig -l); do IP=$(ipconfig getifaddr "$IFACE" 2>/dev/null); case "$IP" in 192.168.*|10.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*) echo "http://$IP:5173   ($IFACE)";; esac; done
```
Give your friend/iPad `<that-url>`.

**Play over the internet (different locations)** → install **Tailscale** on both
computers (free VPN, no router setup), then your friend uses your Tailscale IP:
```bash
tailscale ip -4
```
→ friend opens `http://<your-tailscale-ip>:5173`.

---

## ✅ Test multiplayer alone (one Mac)

Open `localhost:5173` in **two browser windows** side‑by‑side. Only the window you
click into moves; you'll see that player appear in the other window.
