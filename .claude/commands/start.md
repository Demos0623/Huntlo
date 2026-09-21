---
description: Start the Huntlo servers and print the reachable URLs
---

Start the game for local multiplayer, then tell me where to connect.

Do all of this with the Bash tool:

1. Stop any old copies so the ports are free:
   `pkill -f relay_server.py 2>/dev/null; pkill -f serve.py 2>/dev/null; sleep 0.5`
2. Start the multiplayer relay in the background (run_in_background):
   `cd /Users/demoslin/valo && python3 relay_server.py`
3. Start the game web server in the background (run_in_background):
   `cd /Users/demoslin/valo && python3 serve.py`
4. Wait ~1s, then confirm both are up:
   `pgrep -fl relay_server.py; pgrep -fl serve.py`
5. Print every reachable URL (one per active network interface):
   ```
   for IFACE in $(ifconfig -l); do IP=$(ipconfig getifaddr "$IFACE" 2>/dev/null); case "$IP" in 192.168.*|10.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*) echo "http://$IP:5173   ($IFACE)";; esac; done
   ```

Then report back concisely:
- `http://localhost:5173` — for me on this Mac.
- The LAN URL(s) from step 5 — for another device (iPad/friend) on the same Wi-Fi or phone hotspot.
- If step 4 shows a server didn't start, say so and show the error.

Do not run `serve.py` in the foreground — both servers must be backgrounded so they keep running.
