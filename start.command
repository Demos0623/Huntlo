#!/bin/bash
# VALO launcher — double-click this file to start both servers.
cd "$(dirname "$0")" || exit 1

# Stop any old copies so ports are free.
pkill -f relay_server.py 2>/dev/null
pkill -f serve.py 2>/dev/null
sleep 0.5

# Start the multiplayer relay in the background; stop it when this window closes.
python3 relay_server.py &
RELAY=$!
trap "kill $RELAY 2>/dev/null" EXIT

echo ""
echo "  VALO is running!"
echo "  You:    http://localhost:5173"
echo ""
echo "  On another device (same Wi-Fi / hotspot), open one of these:"

# Print a reachable URL for every active interface that has a private LAN
# address — works whether you're on home Wi-Fi, a phone hotspot, USB, or an
# Ethernet adapter. Just try each until one loads on the other device.
FOUND=0
for IFACE in $(ifconfig -l 2>/dev/null); do
  IP=$(ipconfig getifaddr "$IFACE" 2>/dev/null)
  case "$IP" in
    192.168.*|10.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*)
      echo "     http://$IP:5173   ($IFACE)"
      FOUND=1
      ;;
  esac
done
[ "$FOUND" -eq 0 ] && echo "     (no network address found — connect to Wi-Fi or a hotspot)"
echo ""
echo "  Keep this window open. Press Ctrl+C to stop."
echo ""

# Run the game server in the foreground.
python3 serve.py
