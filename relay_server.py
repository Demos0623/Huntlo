#!/usr/bin/env python3
"""Valo — lightweight WebSocket host for LAN multiplayer (no dependencies).

Each client gets an id and the host relays multiplayer messages. It performs
only basic frame and data-shape safety checks; gameplay rules remain in the
game client so development cheats are not overridden by the host.

Run:  python3 relay_server.py            # listens on 0.0.0.0:8080
Then open the game (served by serve.py) on each machine on the LAN.
"""
import base64, hashlib, json, math, os, socket, struct, threading

# Cloud hosts (Render, Railway, Fly, …) assign the port via $PORT. Fall back to
# 8080 for local runs.
HOST, PORT = "0.0.0.0", int(os.environ.get("PORT", 8080))
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"  # WebSocket magic string

_clients = {}          # id -> Client
_lock = threading.Lock()
_next_id = 1

MAX_FRAME_BYTES = 8192
VALID_WEAPONS = {
    'classic', 'shorty', 'frenzy', 'ghost', 'marker', 'stinger', 'spectre',
    'bulldog', 'guardian', 'phantom', 'vantage', 'bucky', 'judge', 'marshal',
    'outlaw', 'operator', 'ares', 'odin', 'karambit',
}


class Client:
    def __init__(self, conn, cid):
        self.conn = conn
        self.id = cid
        self.send_lock = threading.Lock()
        self.seq = -1
        self.view = None

    def send(self, obj):
        data = json.dumps(obj).encode("utf-8")
        frame = bytearray([0x81])  # FIN + text opcode
        n = len(data)
        if n < 126:
            frame.append(n)
        elif n < 65536:
            frame.append(126); frame += struct.pack(">H", n)
        else:
            frame.append(127); frame += struct.pack(">Q", n)
        frame += data
        try:
            with self.send_lock:
                self.conn.sendall(frame)
        except OSError:
            pass


def handshake(conn):
    req = b""
    while b"\r\n\r\n" not in req:
        chunk = conn.recv(1024)
        if not chunk:
            return False
        req += chunk
    key = None
    for line in req.split(b"\r\n"):
        if line.lower().startswith(b"sec-websocket-key:"):
            key = line.split(b":", 1)[1].strip()
    if not key:
        # Not a WebSocket upgrade — most likely a cloud platform health check
        # doing a plain HTTP GET. Answer 200 so the service is marked healthy
        # instead of letting the probe see a dropped connection.
        try:
            body = b"Huntlo relay OK\n"
            conn.sendall(
                b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n"
                b"Content-Length: " + str(len(body)).encode() + b"\r\n"
                b"Connection: close\r\n\r\n" + body
            )
        except OSError:
            pass
        return False
    accept = base64.b64encode(hashlib.sha1(key + GUID.encode()).digest())
    conn.sendall(
        b"HTTP/1.1 101 Switching Protocols\r\n"
        b"Upgrade: websocket\r\nConnection: Upgrade\r\n"
        b"Sec-WebSocket-Accept: " + accept + b"\r\n\r\n"
    )
    return True


def recv_frame(conn):
    """Read one client text frame -> str, or None on close/error."""
    hdr = _recv_all(conn, 2)
    if not hdr:
        return None
    b0, b1 = hdr[0], hdr[1]
    opcode = b0 & 0x0F
    masked = b1 & 0x80
    length = b1 & 0x7F
    if length == 126:
        ext = _recv_all(conn, 2)
        if not ext: return None
        length = struct.unpack(">H", ext)[0]
    elif length == 127:
        ext = _recv_all(conn, 8)
        if not ext: return None
        length = struct.unpack(">Q", ext)[0]
    if length > MAX_FRAME_BYTES:
        return None
    mask = _recv_all(conn, 4) if masked else b"\x00\x00\x00\x00"
    if mask is None: return None
    payload = _recv_all(conn, length) if length else b""
    if payload is None:
        return None
    if masked:
        payload = bytes(payload[i] ^ mask[i % 4] for i in range(len(payload)))
    if opcode == 0x8:   # close
        return None
    if opcode == 0x9:   # ping -> pong (ignored payload)
        return ""
    if opcode == 0x1:   # text
        try:
            return payload.decode("utf-8")
        except UnicodeDecodeError:
            return ""
    return ""           # ignore binary/continuation


def _recv_all(conn, n):
    buf = b""
    while len(buf) < n:
        try:
            chunk = conn.recv(n - len(buf))
        except OSError:
            return None
        if not chunk:
            return None
        buf += chunk
    return buf


def broadcast(obj, exclude=None):
    with _lock:
        targets = [c for cid, c in _clients.items() if cid != exclude]
    for c in targets:
        c.send(obj)


def _finite(*values):
    return all(isinstance(v, (int, float)) and math.isfinite(v) for v in values)


def _clean_state(client, data):
    """Keep relay snapshots structurally valid without policing gameplay."""
    x, y, z = data.get('x'), data.get('y'), data.get('z')
    if not _finite(x, y, z):
        return None
    yaw, pitch = data.get('yaw', 0), data.get('pitch', 0)
    if not _finite(yaw, pitch):
        yaw, pitch = 0, 0
    wid = data.get('wid') if data.get('wid') in VALID_WEAPONS else 'vantage'
    name = str(data.get('name') or ('Player ' + str(client.id)))[:16]
    seq = data.get('seq')
    client.seq = seq if isinstance(seq, int) else client.seq + 1
    state = {
        't': 'state', 'id': client.id, 'x': x, 'y': y, 'z': z,
        'yaw': yaw, 'pitch': pitch, 'moving': bool(data.get('moving')),
        'stance': 'crouch' if data.get('stance') == 'crouch' else 'stand',
        'grounded': bool(data.get('grounded')), 'seq': client.seq, 'wid': wid,
        'hp': data.get('hp') if _finite(data.get('hp')) else 150,
        'dead': bool(data.get('dead')),
        'team': data.get('team') if data.get('team') in ('attacker', 'defender') else 'attacker',
        'flashed': bool(data.get('flashed')), 'name': name,
    }
    client.view = state
    return state


def handle(conn, addr):
    global _next_id
    if not handshake(conn):
        conn.close(); return
    with _lock:
        cid = _next_id; _next_id += 1
        client = Client(conn, cid)
        roster = list(_clients.keys())
        snapshot = [dict(c.view) for c in _clients.values() if c.view is not None]
        _clients[cid] = client
    client.send({"t": "welcome", "id": cid, "peers": roster})
    client.send({"t": "snapshot", "players": snapshot})
    broadcast({"t": "join", "id": cid}, exclude=cid)
    print(f"[relay] client {cid} joined ({addr[0]}), {len(_clients)} online", flush=True)
    try:
        while True:
            msg = recv_frame(conn)
            if msg is None:
                break
            if not msg:
                continue
            try:
                data = json.loads(msg)
            except ValueError:
                continue
            if not isinstance(data, dict):
                continue
            kind = data.get("t")
            if kind == "ping":      # echo latency probe back to sender only
                client.send({"t": "pong", "seq": data.get("seq")})
                continue
            if kind == 'state':
                state = _clean_state(client, data)
                if state:
                    broadcast(state, exclude=cid)
            else:
                # Client gameplay events (including development cheats) are
                # simply shared with the other connected players.
                data['id'] = client.id
                broadcast(data, exclude=cid)
    finally:
        with _lock:
            _clients.pop(cid, None)
        broadcast({"t": "leave", "id": cid})
        conn.close()
        print(f"[relay] client {cid} left, {len(_clients)} online", flush=True)


def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((HOST, PORT))
    srv.listen(16)
    print(f"[relay] Valo relay listening on ws://{HOST}:{PORT}", flush=True)
    try:
        while True:
            conn, addr = srv.accept()
            conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            threading.Thread(target=handle, args=(conn, addr), daemon=True).start()
    except KeyboardInterrupt:
        print("\n[relay] shutting down")
    finally:
        srv.close()


if __name__ == "__main__":
    main()
